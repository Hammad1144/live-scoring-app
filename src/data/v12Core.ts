import type { SQLiteDatabase } from 'expo-sqlite';
import { initDatabase as initBaseDatabase } from './database';
import { Player, Team, TeamSummary } from '../types';

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some(c => c.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export async function initDatabaseV12(db: SQLiteDatabase) {
  await initBaseDatabase(db);
  await ensureColumn(db, 'teams', 'captain_player_id', 'captain_player_id INTEGER');
  await ensureColumn(db, 'teams', 'vice_captain_player_id', 'vice_captain_player_id INTEGER');
  await ensureColumn(db, 'teams', 'archived', 'archived INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'match_players', 'is_captain', 'is_captain INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'match_players', 'is_vice_captain', 'is_vice_captain INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'matches', 'import_key', 'import_key TEXT');

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_import_key ON matches(import_key) WHERE import_key IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS trg_match_player_roles
    AFTER INSERT ON match_players
    BEGIN
      UPDATE match_players
      SET is_captain = CASE WHEN NEW.player_id = (SELECT captain_player_id FROM teams WHERE id = NEW.team_id) THEN 1 ELSE 0 END,
          is_vice_captain = CASE WHEN NEW.player_id = (SELECT vice_captain_player_id FROM teams WHERE id = NEW.team_id) THEN 1 ELSE 0 END
      WHERE match_id = NEW.match_id AND team_id = NEW.team_id AND player_id = NEW.player_id;
    END;
  `);

  // v1.1 seeded placeholder players. Remove them only if the install never used them.
  const legacy = await db.getFirstAsync<{ playerCount: number; defaultCount: number; teamCount: number; matchCount: number }>(`
    SELECT
      (SELECT COUNT(*) FROM players) AS playerCount,
      (SELECT COUNT(*) FROM players WHERE id BETWEEN 1 AND 24 AND name = 'Player ' || id) AS defaultCount,
      (SELECT COUNT(*) FROM team_players) AS teamCount,
      (SELECT COUNT(*) FROM matches) AS matchCount
  `);
  if (legacy?.playerCount === 24 && legacy.defaultCount === 24 && legacy.teamCount === 0 && legacy.matchCount === 0) {
    await db.runAsync('DELETE FROM players');
  }
}

export async function getPlayersV12(db: SQLiteDatabase): Promise<Player[]> {
  return db.getAllAsync<Player>('SELECT id, name FROM players ORDER BY name COLLATE NOCASE, id');
}

async function validatePlayerName(db: SQLiteDatabase, name: string, excludeId?: number) {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Player name cannot be empty.');
  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM players WHERE LOWER(name) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1',
    cleaned, excludeId ?? null, excludeId ?? null,
  );
  if (duplicate) throw new Error('A player with this name already exists.');
  return cleaned;
}

export async function createPlayer(db: SQLiteDatabase, name: string): Promise<number> {
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM players');
  if ((count?.c ?? 0) >= 50) throw new Error('Player Bank supports a maximum of 50 players.');
  const cleaned = await validatePlayerName(db, name);
  const result = await db.runAsync('INSERT INTO players(name) VALUES (?)', cleaned);
  return Number(result.lastInsertRowId);
}

export async function renamePlayerV12(db: SQLiteDatabase, id: number, name: string) {
  const cleaned = await validatePlayerName(db, name, id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE players SET name = ? WHERE id = ?', cleaned, id);
    // Match snapshots intentionally follow Player Bank renames so scorecards, season rankings,
    // leaderboards and player profiles all display the same current player identity.
    await db.runAsync('UPDATE match_players SET player_name = ? WHERE player_id = ?', cleaned, id);
  });
}

export async function deletePlayer(db: SQLiteDatabase, id: number) {
  const used = await db.getFirstAsync<{ teamCount: number; matchCount: number }>(`
    SELECT
      (SELECT COUNT(*) FROM team_players WHERE player_id=?) AS teamCount,
      (SELECT COUNT(*) FROM match_players WHERE player_id=?) AS matchCount
  `, id, id);
  if ((used?.teamCount ?? 0) > 0) throw new Error('Remove this player from all teams before deleting them.');
  if ((used?.matchCount ?? 0) > 0) throw new Error('This player is used in match history and cannot be deleted.');
  await db.runAsync('DELETE FROM players WHERE id = ?', id);
}

export async function getTeamsV12(db: SQLiteDatabase): Promise<TeamSummary[]> {
  return db.getAllAsync<TeamSummary>(`
    SELECT t.id, t.name, COUNT(tp.player_id) AS playerCount,
      cp.name AS captainName, vcp.name AS viceCaptainName
    FROM teams t
    LEFT JOIN team_players tp ON tp.team_id = t.id
    LEFT JOIN players cp ON cp.id = t.captain_player_id
    LEFT JOIN players vcp ON vcp.id = t.vice_captain_player_id
    WHERE COALESCE(t.archived, 0) = 0
    GROUP BY t.id, t.name, cp.name, vcp.name
    ORDER BY t.name COLLATE NOCASE
  `);
}

export async function getTeamV12(db: SQLiteDatabase, teamId: number): Promise<Team> {
  const row = await db.getFirstAsync<{ id: number; name: string; captain_player_id: number | null; vice_captain_player_id: number | null }>(
    'SELECT id, name, captain_player_id, vice_captain_player_id FROM teams WHERE id = ? AND COALESCE(archived,0)=0', teamId,
  );
  if (!row) throw new Error('Team not found.');
  const players = await db.getAllAsync<Player>(`
    SELECT p.id, p.name FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? ORDER BY tp.batting_order
  `, teamId);
  return { id: row.id, name: row.name, players, captainId: row.captain_player_id, viceCaptainId: row.vice_captain_player_id };
}

export async function saveTeamV12(db: SQLiteDatabase, name: string, playerIds: number[], captainId: number | null, viceCaptainId: number | null, teamId?: number) {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Team name is required.');
  // Team Bank stores the wider reusable squad. Match setup later narrows this to a maximum XI.
  if (playerIds.length < 2 || playerIds.length > 20) throw new Error('Select between 2 and 20 players.');
  const uniqueIds = [...new Set(playerIds)];
  if (uniqueIds.length !== playerIds.length) throw new Error('Duplicate players are not allowed.');
  if (captainId != null && !uniqueIds.includes(captainId)) throw new Error('Captain must be selected in the squad.');
  if (viceCaptainId != null && !uniqueIds.includes(viceCaptainId)) throw new Error('Vice Captain must be selected in the squad.');
  if (captainId != null && captainId === viceCaptainId) throw new Error('Captain and Vice Captain must be different players.');

  let id = teamId;
  if (id) {
    await db.runAsync('UPDATE teams SET name = ?, captain_player_id = ?, vice_captain_player_id = ? WHERE id = ? AND COALESCE(archived,0)=0', cleaned, captainId, viceCaptainId, id);
    await db.runAsync('DELETE FROM team_players WHERE team_id = ?', id);
  } else {
    const result = await db.runAsync('INSERT INTO teams(name, captain_player_id, vice_captain_player_id, archived) VALUES (?, ?, ?, 0)', cleaned, captainId, viceCaptainId);
    id = Number(result.lastInsertRowId);
  }
  for (let i = 0; i < uniqueIds.length; i++) {
    await db.runAsync('INSERT INTO team_players(team_id, player_id, batting_order) VALUES (?, ?, ?)', id, uniqueIds[i]!, i);
  }
  return id;
}

export async function deleteTeamV12(db: SQLiteDatabase, teamId: number) {
  const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM matches WHERE team_a_id = ? OR team_b_id = ?', teamId, teamId);
  if ((used?.c ?? 0) > 0) throw new Error('This team is used in match history and cannot be deleted.');
  await db.runAsync('DELETE FROM teams WHERE id = ? AND COALESCE(archived,0)=0', teamId);
}
