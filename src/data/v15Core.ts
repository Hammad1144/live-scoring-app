import type { SQLiteDatabase } from 'expo-sqlite';
import { initDatabaseV14 } from './v14Core';

const SYNC_TABLES = ['players', 'teams', 'team_players', 'seasons', 'matches', 'match_players', 'innings', 'deliveries'] as const;

export type LocalSyncState = {
  dirty: number;
  localUpdatedAt: string | null;
  lastCloudVersion: number;
  lastCloudUpdatedAt: string | null;
  lastSyncedAt: string | null;
};

async function hasLocalCricketData(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ c: number }>(`
    SELECT
      (SELECT COUNT(*) FROM players)
      + (SELECT COUNT(*) FROM teams)
      + (SELECT COUNT(*) FROM seasons)
      + (SELECT COUNT(*) FROM matches) AS c
  `);
  return (row?.c ?? 0) > 0;
}

export async function initDatabaseV15(db: SQLiteDatabase) {
  await initDatabaseV14(db);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      dirty INTEGER NOT NULL DEFAULT 0,
      local_updated_at TEXT,
      last_cloud_version INTEGER NOT NULL DEFAULT 0,
      last_cloud_updated_at TEXT,
      last_synced_at TEXT
    );
  `);

  const state = await db.getFirstAsync<{ id: number }>('SELECT id FROM cloud_sync_state WHERE id = 1');
  if (!state) {
    const populated = await hasLocalCricketData(db);
    await db.runAsync(
      `INSERT INTO cloud_sync_state(id, dirty, local_updated_at, last_cloud_version, last_cloud_updated_at, last_synced_at)
       VALUES (1, ?, ?, 0, NULL, NULL)`,
      populated ? 1 : 0,
      populated ? new Date().toISOString() : null,
    );
  }

  for (const table of SYNC_TABLES) {
    for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      const suffix = operation.toLowerCase();
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS trg_cloud_dirty_${table}_${suffix}
        AFTER ${operation} ON ${table}
        BEGIN
          UPDATE cloud_sync_state
          SET dirty = 1,
              local_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = 1;
        END;
      `);
    }
  }
}

export async function getLocalSyncState(db: SQLiteDatabase): Promise<LocalSyncState> {
  const row = await db.getFirstAsync<any>(`
    SELECT dirty,
      local_updated_at AS localUpdatedAt,
      last_cloud_version AS lastCloudVersion,
      last_cloud_updated_at AS lastCloudUpdatedAt,
      last_synced_at AS lastSyncedAt
    FROM cloud_sync_state WHERE id = 1
  `);
  return {
    dirty: row?.dirty ?? 0,
    localUpdatedAt: row?.localUpdatedAt ?? null,
    lastCloudVersion: row?.lastCloudVersion ?? 0,
    lastCloudUpdatedAt: row?.lastCloudUpdatedAt ?? null,
    lastSyncedAt: row?.lastSyncedAt ?? null,
  };
}

export async function markCloudSynced(
  db: SQLiteDatabase,
  version: number,
  cloudUpdatedAt: string | null,
) {
  await db.runAsync(
    `UPDATE cloud_sync_state
     SET dirty = 0,
         last_cloud_version = ?,
         last_cloud_updated_at = ?,
         last_synced_at = ?
     WHERE id = 1`,
    version,
    cloudUpdatedAt,
    new Date().toISOString(),
  );
}
