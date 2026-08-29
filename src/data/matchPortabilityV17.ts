import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackageV16, importMatchPackageV16 } from './matchPortabilityV16';

type BasePackage = Awaited<ReturnType<typeof exportMatchPackageV16>>;

export type PortableMatchPackageV17 = BasePackage & {
  seasonRound?: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    sortOrder: number;
  } | null;
};

export async function exportMatchPackageV17(db: SQLiteDatabase, matchId: number): Promise<PortableMatchPackageV17> {
  const payload = await exportMatchPackageV16(db, matchId) as PortableMatchPackageV17;
  const round = await db.getFirstAsync<{ name: string; start_date: string | null; end_date: string | null; sort_order: number }>(`
    SELECT r.name, r.start_date, r.end_date, r.sort_order
    FROM matches m JOIN season_rounds r ON r.id=m.season_round_id
    WHERE m.id=?
  `, matchId);
  payload.seasonRound = round ? {
    name: round.name,
    startDate: round.start_date,
    endDate: round.end_date,
    sortOrder: round.sort_order,
  } : null;
  return payload;
}

export async function importMatchPackageV17(
  db: SQLiteDatabase,
  payload: PortableMatchPackageV17,
): Promise<{ matchId: number; title: string }> {
  const imported = await importMatchPackageV16(db, payload);
  if (!payload.seasonRound?.name?.trim()) return imported;

  const match = await db.getFirstAsync<{ season_id: number | null }>('SELECT season_id FROM matches WHERE id=?', imported.matchId);
  if (!match?.season_id) return imported;

  let round = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM season_rounds WHERE season_id=? AND name=? COLLATE BINARY LIMIT 1',
    match.season_id,
    payload.seasonRound.name,
  );
  if (!round) {
    const order = await db.getFirstAsync<{ nextOrder: number }>(
      'SELECT COALESCE(MAX(sort_order),0)+1 AS nextOrder FROM season_rounds WHERE season_id=?',
      match.season_id,
    );
    const inserted = await db.runAsync(
      `INSERT INTO season_rounds(season_id, name, sort_order, start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      match.season_id,
      payload.seasonRound.name.trim(),
      order?.nextOrder ?? payload.seasonRound.sortOrder ?? 1,
      payload.seasonRound.startDate ?? null,
      payload.seasonRound.endDate ?? payload.seasonRound.startDate ?? null,
      new Date().toISOString(),
    );
    round = { id: Number(inserted.lastInsertRowId) };
  }

  await db.runAsync('UPDATE matches SET season_round_id=? WHERE id=?', round.id, imported.matchId);
  return imported;
}
