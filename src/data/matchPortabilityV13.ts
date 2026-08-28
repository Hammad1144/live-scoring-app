import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackage, importMatchPackage } from './matchPortability';
import { PortableMatchPackage } from '../types';

export async function exportMatchPackageV13(db: SQLiteDatabase, matchId: number): Promise<PortableMatchPackage> {
  const payload = await exportMatchPackage(db, matchId);
  const advanced = await db.getAllAsync<{ innings_id: number; seq: number; dead_run: number; fielder_id: number | null }>(`
    SELECT innings_id, seq, COALESCE(dead_run,0) AS dead_run, fielder_id
    FROM deliveries WHERE match_id = ?
  `, matchId);
  const byDelivery = new Map(advanced.map(d => [`${d.innings_id}:${d.seq}`, d]));
  payload.deliveries = payload.deliveries.map(d => {
    const extra = byDelivery.get(`${d.sourceInningsId}:${d.seq}`);
    return { ...d, deadRun: extra?.dead_run ?? 0, fielderId: extra?.fielder_id ?? null };
  });
  return payload;
}

export async function importMatchPackageV13(db: SQLiteDatabase, payload: PortableMatchPackage): Promise<{ matchId: number; title: string }> {
  const imported = await importMatchPackage(db, payload);
  const localInnings = await db.getAllAsync<{ id: number; innings_no: number }>(
    'SELECT id, innings_no FROM innings WHERE match_id = ?',
    imported.matchId,
  );
  const sourceToLocal = new Map<number, number>();
  for (const source of payload.innings) {
    const local = localInnings.find(i => i.innings_no === source.inningsNo);
    if (local) sourceToLocal.set(source.sourceInningsId, local.id);
  }
  for (const delivery of payload.deliveries) {
    const localInningsId = sourceToLocal.get(delivery.sourceInningsId);
    if (!localInningsId) continue;
    await db.runAsync(
      'UPDATE deliveries SET dead_run = ?, fielder_id = ? WHERE innings_id = ? AND seq = ?',
      delivery.deadRun ? 1 : 0,
      delivery.fielderId ?? null,
      localInningsId,
      delivery.seq,
    );
  }
  return imported;
}
