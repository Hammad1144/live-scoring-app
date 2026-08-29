import type { SQLiteDatabase } from 'expo-sqlite';
import { getAvailableBowlers, getMatch, getMatchPlayers } from './database';
import { createMatchV14 } from './v14Core';
import { createPlayer } from './v12Core';
import { getMatchDetailV13 } from './v13Core';
import { initDatabaseV15 } from './v15Core';
import { BatterLine, InningsRow, MatchDetail, Player } from '../types';

export type MatchPlayerSwitch = {
  playerId: number;
  fromTeamId: number;
  toTeamId: number;
};

export async function initDatabaseV16(db: SQLiteDatabase) {
  await initDatabaseV15(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS innings_retirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      innings_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'DECLARED',
      created_at TEXT NOT NULL,
      UNIQUE(innings_id, player_id),
      FOREIGN KEY(innings_id) REFERENCES innings(id) ON DELETE CASCADE,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_innings_retirements_innings ON innings_retirements(innings_id, player_id);
  `);

  // v15's cloud dirty triggers are created before this v16 table exists, so add the
  // equivalent triggers here to keep cloud-save conflict detection accurate.
  for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
    const suffix = operation.toLowerCase();
    await db.execAsync(`
      CREATE TRIGGER IF NOT EXISTS trg_cloud_dirty_innings_retirements_${suffix}
      AFTER ${operation} ON innings_retirements
      BEGIN
        UPDATE cloud_sync_state
        SET dirty = 1,
            local_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = 1;
      END;
    `);
  }
}

export async function createMatchV16(
  db: SQLiteDatabase,
  teamAId: number,
  teamBId: number,
  oversLimit: number,
  battingFirstTeamId: number,
  seasonId: number | null,
  switches: MatchPlayerSwitch[] = [],
): Promise<number> {
  const matchId = await createMatchV14(db, teamAId, teamBId, oversLimit, battingFirstTeamId, seasonId);
  try {
    for (const move of switches) {
      if (move.fromTeamId === move.toTeamId) continue;
      if (![teamAId, teamBId].includes(move.fromTeamId) || ![teamAId, teamBId].includes(move.toTeamId)) {
        throw new Error('A match-only player switch references an invalid team.');
      }
      const source = await db.getFirstAsync<{ player_id: number }>(
        'SELECT player_id FROM match_players WHERE match_id=? AND team_id=? AND player_id=?',
        matchId, move.fromTeamId, move.playerId,
      );
      if (!source) throw new Error('A selected player is no longer available in the source team.');
      const duplicate = await db.getFirstAsync<{ player_id: number }>(
        'SELECT player_id FROM match_players WHERE match_id=? AND team_id=? AND player_id=?',
        matchId, move.toTeamId, move.playerId,
      );
      if (duplicate) throw new Error('A switched player cannot appear for both teams in the same match.');
      const order = await db.getFirstAsync<{ nextOrder: number }>(
        'SELECT COALESCE(MAX(batting_order), -1) + 1 AS nextOrder FROM match_players WHERE match_id=? AND team_id=?',
        matchId, move.toTeamId,
      );
      await db.runAsync(
        `UPDATE match_players
         SET team_id=?, batting_order=?, is_captain=0, is_vice_captain=0
         WHERE match_id=? AND team_id=? AND player_id=?`,
        move.toTeamId, order?.nextOrder ?? 0, matchId, move.fromTeamId, move.playerId,
      );
    }

    for (const teamId of [teamAId, teamBId]) {
      const count = await db.getFirstAsync<{ c: number }>(
        'SELECT COUNT(*) AS c FROM match_players WHERE match_id=? AND team_id=?', matchId, teamId,
      );
      if ((count?.c ?? 0) < 2) throw new Error('Each team must still have at least 2 players after match-only switches.');
    }
    return matchId;
  } catch (error) {
    await db.runAsync('DELETE FROM matches WHERE id=?', matchId).catch(() => undefined);
    throw error;
  }
}

export async function createGuestPlayerForMatch(
  db: SQLiteDatabase,
  matchId: number,
  teamId: number,
  name: string,
): Promise<Player> {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Guest player name is required.');
  const match = await getMatch(db, matchId);
  if (![match.team_a_id, match.team_b_id].includes(teamId)) throw new Error('Guest player team is invalid.');

  let player = await db.getFirstAsync<Player>('SELECT id, name FROM players WHERE LOWER(name)=LOWER(?) LIMIT 1', cleaned);
  if (!player) {
    const id = await createPlayer(db, cleaned);
    player = { id, name: cleaned };
  }

  const existing = await db.getFirstAsync<{ team_id: number }>(
    'SELECT team_id FROM match_players WHERE match_id=? AND player_id=? LIMIT 1', matchId, player.id,
  );
  if (existing) {
    if (existing.team_id !== teamId) throw new Error('This player is already assigned to the opposite team for this match. Use the match-only player switch during match setup.');
    return player;
  }

  const order = await db.getFirstAsync<{ nextOrder: number }>(
    'SELECT COALESCE(MAX(batting_order), -1) + 1 AS nextOrder FROM match_players WHERE match_id=? AND team_id=?',
    matchId, teamId,
  );
  await db.runAsync(
    `INSERT INTO match_players(match_id, team_id, player_id, player_name, batting_order, is_captain, is_vice_captain)
     VALUES (?, ?, ?, ?, ?, 0, 0)`,
    matchId, teamId, player.id, player.name, order?.nextOrder ?? 0,
  );
  return player;
}

export async function getAvailableBattersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return [];
  const dismissed = await db.getAllAsync<{ id: number }>(
    'SELECT DISTINCT dismissed_player_id AS id FROM deliveries WHERE innings_id=? AND wicket=1 AND dismissed_player_id IS NOT NULL',
    inningsId,
  );
  const retired = await db.getAllAsync<{ id: number }>('SELECT player_id AS id FROM innings_retirements WHERE innings_id=?', inningsId);
  const blocked = new Set<number>([...dismissed.map(x => x.id), ...retired.map(x => x.id)]);
  if (innings.striker_id) blocked.add(Number(innings.striker_id));
  if (innings.non_striker_id) blocked.add(Number(innings.non_striker_id));
  const all = await getMatchPlayers(db, innings.match_id, innings.batting_team_id);
  return all.filter(p => !blocked.has(p.id));
}

export async function getAvailableBowlersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  return getAvailableBowlers(db, inningsId);
}

export async function setNextBatterV16(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const available = await getAvailableBattersV16(db, inningsId);
  if (!available.some(p => p.id === playerId)) throw new Error('That batter is not available in this innings.');
  if (innings.striker_id == null) await db.runAsync('UPDATE innings SET striker_id=? WHERE id=?', playerId, inningsId);
  else if (innings.non_striker_id == null) await db.runAsync('UPDATE innings SET non_striker_id=? WHERE id=?', playerId, inningsId);
  else throw new Error('Both batting ends are already occupied.');
}

export async function retireBatterV16(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  if (innings.completed) throw new Error('This innings is already complete.');
  const isStriker = Number(innings.striker_id) === playerId;
  const isNonStriker = Number(innings.non_striker_id) === playerId;
  if (!isStriker && !isNonStriker) throw new Error('Only a current batter can be declared.');
  const prior = await db.getFirstAsync<{ id: number }>('SELECT id FROM innings_retirements WHERE innings_id=? AND player_id=?', inningsId, playerId);
  if (prior) throw new Error('This batter has already been declared in this innings.');

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO innings_retirements(innings_id, match_id, player_id, reason, created_at)
       VALUES (?, ?, ?, 'DECLARED', ?)`,
      inningsId, innings.match_id, playerId, new Date().toISOString(),
    );
    if (isStriker) await db.runAsync('UPDATE innings SET striker_id=NULL WHERE id=?', inningsId);
    else await db.runAsync('UPDATE innings SET non_striker_id=NULL WHERE id=?', inningsId);
  });
}

export async function getMatchDetailV16(db: SQLiteDatabase, matchId: number): Promise<MatchDetail> {
  const detail = await getMatchDetailV13(db, matchId);
  for (const innings of detail.innings) {
    const retired = await db.getAllAsync<{ playerId: number; name: string }>(`
      SELECT r.player_id AS playerId, mp.player_name AS name
      FROM innings_retirements r
      JOIN match_players mp ON mp.match_id=r.match_id AND mp.player_id=r.player_id
      WHERE r.innings_id=?
      ORDER BY r.id
    `, innings.inningsId);

    for (const item of retired) {
      let batter = innings.batters.find(b => b.playerId === item.playerId);
      if (!batter) {
        const stats = await db.getFirstAsync<{ runs: number; balls: number; fours: number; sixes: number }>(`
          SELECT
            COALESCE(SUM(CASE WHEN striker_id=? THEN bat_runs ELSE 0 END),0) AS runs,
            COALESCE(SUM(CASE WHEN striker_id=? AND legal_ball=1 THEN 1 ELSE 0 END),0) AS balls,
            COALESCE(SUM(CASE WHEN striker_id=? AND bat_runs=4 THEN 1 ELSE 0 END),0) AS fours,
            COALESCE(SUM(CASE WHEN striker_id=? AND bat_runs=6 THEN 1 ELSE 0 END),0) AS sixes
          FROM deliveries WHERE innings_id=?
        `, item.playerId, item.playerId, item.playerId, item.playerId, innings.inningsId);
        batter = {
          playerId: item.playerId,
          name: item.name,
          runs: stats?.runs ?? 0,
          balls: stats?.balls ?? 0,
          fours: stats?.fours ?? 0,
          sixes: stats?.sixes ?? 0,
          dismissal: 'declared',
        } satisfies BatterLine;
        innings.batters.push(batter);
      } else {
        batter.dismissal = 'declared';
      }
    }
  }
  return detail;
}
