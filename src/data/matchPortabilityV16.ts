import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackageV14, importMatchPackageV14 } from './matchPortabilityV14';
import { PortableMatchPackage } from '../types';

type PortableRetirement = {
  sourceInningsId: number;
  playerId: number;
  reason: string;
  createdAt: string;
};

type PortableMatchPackageV16 = PortableMatchPackage & {
  retirements?: PortableRetirement[];
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
  return payload;
}

export async function importMatchPackageV16(
  db: SQLiteDatabase,
  payload: PortableMatchPackageV16,
): Promise<{ matchId: number; title: string }> {
  const imported = await importMatchPackageV14(db, payload);
  const retirements = payload.retirements ?? [];
  if (!retirements.length) return imported;

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

  return imported;
}
