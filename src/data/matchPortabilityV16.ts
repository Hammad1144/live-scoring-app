import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackageV14, importMatchPackageV14 } from './matchPortabilityV14';
import { PortableMatchPackage } from '../types';

type PortableRetirement = {
  sourceInningsId: number;
  playerId: number;
  reason: string;
  createdAt: string;
};

type PortableTeamBankPlayer = {
  sourceTeamId: number;
  playerName: string;
  battingOrder: number;
  isCaptain: number;
  isViceCaptain: number;
};

type PortableMatchPackageV16 = PortableMatchPackage & {
  retirements?: PortableRetirement[];
  teamBankRosters?: PortableTeamBankPlayer[];
};

export async function exportMatchPackageV16(db: SQLiteDatabase, matchId: number): Promise<PortableMatchPackageV16> {
  const payload = await exportMatchPackageV14(db, matchId) as PortableMatchPackageV16;
  payload.retirements = await db.getAllAsync<PortableRetirement>(`
    SELECT innings_id AS sourceInningsId,
      player_id AS playerId,
      reason,
      created_at AS createdAt
    FROM innings_retirements
    WHERE match_id=?
    ORDER BY id
  `, matchId);

  // Store the reusable Team Bank roster separately from match_players. match_players is
  // intentionally the match-only roster and may contain lent or guest players.
  payload.teamBankRosters = await db.getAllAsync<PortableTeamBankPlayer>(`
    SELECT tp.team_id AS sourceTeamId,
      p.name AS playerName,
      tp.batting_order AS battingOrder,
      CASE WHEN t.captain_player_id=tp.player_id THEN 1 ELSE 0 END AS isCaptain,
      CASE WHEN t.vice_captain_player_id=tp.player_id THEN 1 ELSE 0 END AS isViceCaptain
    FROM team_players tp
    JOIN players p ON p.id=tp.player_id
    JOIN teams t ON t.id=tp.team_id
    WHERE tp.team_id IN (?, ?)
    ORDER BY tp.team_id, tp.batting_order
  `, payload.match.teamAId, payload.match.teamBId);
  return payload;
}

async function ensureImportedPlayer(db: SQLiteDatabase, name: string) {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM players WHERE name=? COLLATE BINARY LIMIT 1', name);
  if (existing) return existing.id;
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM players');
  if ((count?.c ?? 0) >= 50) throw new Error('The imported permanent team roster would exceed the 50-player bank limit.');
  const result = await db.runAsync('INSERT INTO players(name) VALUES (?)', name);
  return Number(result.lastInsertRowId);
}

export async function importMatchPackageV16(
  db: SQLiteDatabase,
  payload: PortableMatchPackageV16,
): Promise<{ matchId: number; title: string }> {
  // Remember which Team Bank entries existed before import. Existing local squads remain
  // authoritative; only newly created teams are populated from the exported permanent roster.
  const [teamAExisting, teamBExisting] = await Promise.all([
    db.getFirstAsync<{ id: number }>('SELECT id FROM teams WHERE name=? COLLATE BINARY LIMIT 1', payload.match.teamAName),
    db.getFirstAsync<{ id: number }>('SELECT id FROM teams WHERE name=? COLLATE BINARY LIMIT 1', payload.match.teamBName),
  ]);

  const imported = await importMatchPackageV14(db, payload);
  const importedMatch = await db.getFirstAsync<{ team_a_id: number; team_b_id: number }>(
    'SELECT team_a_id, team_b_id FROM matches WHERE id=?', imported.matchId,
  );
  if (!importedMatch) throw new Error('Imported match could not be reloaded.');
  const teamMap = new Map<number, number>([
    [payload.match.teamAId, importedMatch.team_a_id],
    [payload.match.teamBId, importedMatch.team_b_id],
  ]);

  const bankRosters = payload.teamBankRosters ?? [];
  for (const sourceTeamId of [payload.match.teamAId, payload.match.teamBId]) {
    const existedBefore = sourceTeamId === payload.match.teamAId ? !!teamAExisting : !!teamBExisting;
    if (existedBefore) continue;
    const localTeamId = teamMap.get(sourceTeamId);
    if (!localTeamId) continue;
    const roster = bankRosters.filter(p => p.sourceTeamId === sourceTeamId).sort((a, b) => a.battingOrder - b.battingOrder);
    if (!roster.length) continue; // Older exports: retain V14's match-roster fallback.

    await db.runAsync('DELETE FROM team_players WHERE team_id=?', localTeamId);
    let captainId: number | null = null;
    let viceCaptainId: number | null = null;
    for (let index = 0; index < roster.length; index++) {
      const row = roster[index]!;
      const playerId = await ensureImportedPlayer(db, row.playerName);
      await db.runAsync(
        'INSERT OR IGNORE INTO team_players(team_id, player_id, batting_order) VALUES (?, ?, ?)',
        localTeamId, playerId, index,
      );
      if (row.isCaptain) captainId = playerId;
      if (row.isViceCaptain) viceCaptainId = playerId;
    }
    await db.runAsync(
      'UPDATE teams SET captain_player_id=?, vice_captain_player_id=? WHERE id=?',
      captainId, viceCaptainId, localTeamId,
    );
  }

  const retirements = payload.retirements ?? [];
  if (retirements.length) {
    const localInnings = await db.getAllAsync<{ id: number; innings_no: number }>(
      'SELECT id, innings_no FROM innings WHERE match_id=?', imported.matchId,
    );
    const inningsMap = new Map<number, number>();
    for (const source of payload.innings) {
      const local = localInnings.find(i => i.innings_no === source.inningsNo);
      if (local) inningsMap.set(source.sourceInningsId, local.id);
    }

    for (const retirement of retirements) {
      const localInningsId = inningsMap.get(retirement.sourceInningsId);
      if (!localInningsId) throw new Error('Unable to map a declared batter to the imported innings.');
      const sourcePlayer = payload.matchPlayers.find(p => p.playerId === retirement.playerId);
      if (!sourcePlayer) throw new Error('Unable to map a declared batter from the imported match.');
      const localPlayer = await db.getFirstAsync<{ player_id: number }>(
        `SELECT player_id FROM match_players
         WHERE match_id=? AND player_name=? COLLATE BINARY
         LIMIT 1`,
        imported.matchId, sourcePlayer.playerName,
      );
      if (!localPlayer) throw new Error(`Unable to map imported player ${sourcePlayer.playerName}.`);
      await db.runAsync(
        `INSERT OR IGNORE INTO innings_retirements(innings_id, match_id, player_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        localInningsId,
        imported.matchId,
        localPlayer.player_id,
        retirement.reason || 'DECLARED',
        retirement.createdAt || new Date().toISOString(),
      );
    }
  }

  return imported;
}
