import type { SQLiteDatabase } from 'expo-sqlite';

export async function assignMatchToSeasonRound(
  db: SQLiteDatabase,
  matchId: number,
  seasonId: number,
  roundId: number,
) {
  const match = await db.getFirstAsync<{ season_id: number | null }>('SELECT season_id FROM matches WHERE id=?', matchId);
  if (!match) throw new Error('Match not found.');
  if (match.season_id !== seasonId) throw new Error('This match does not belong to the selected season.');

  const round = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM season_rounds WHERE id=? AND season_id=?', roundId, seasonId,
  );
  if (!round) throw new Error('Selected round / week does not belong to this season.');

  await db.runAsync('UPDATE matches SET season_round_id=? WHERE id=?', roundId, matchId);
}
