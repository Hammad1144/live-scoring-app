import type { SQLiteDatabase } from 'expo-sqlite';
import { markCloudSynced } from './v15Core';

export const SYNC_TABLES = ['players', 'teams', 'team_players', 'seasons', 'season_rounds', 'matches', 'match_players', 'innings', 'deliveries', 'innings_retirements'] as const;
export type SyncTable = typeof SYNC_TABLES[number];

export type CricketCloudSnapshot = {
  kind: 'cricket-zone-app-snapshot';
  schemaVersion: 1 | 2 | 3;
  createdAt: string;
  tables: Record<SyncTable, Record<string, unknown>[]>;
  counts: Record<SyncTable, number>;
};

function assertSnapshot(payload: unknown): asserts payload is CricketCloudSnapshot {
  const value = payload as CricketCloudSnapshot | null;
  if (!value || value.kind !== 'cricket-zone-app-snapshot' || ![1, 2, 3].includes(value.schemaVersion) || !value.tables) {
    throw new Error('The cloud backup format is not supported by this version of Cricket Zone App.');
  }
  const tables = value.tables as Record<string, Record<string, unknown>[]>;
  // v1 pre-dates declared batters. v1/v2 pre-date the Season → Round/Week hierarchy.
  if (!Array.isArray(tables.innings_retirements)) tables.innings_retirements = [];
  if (!Array.isArray(tables.season_rounds)) tables.season_rounds = [];
  for (const table of SYNC_TABLES) {
    if (!Array.isArray(tables[table])) throw new Error(`Cloud backup is missing ${table} data.`);
  }
}

export async function buildLocalSnapshot(db: SQLiteDatabase): Promise<CricketCloudSnapshot> {
  const tables = {} as Record<SyncTable, Record<string, unknown>[]>;
  const counts = {} as Record<SyncTable, number>;

  for (const table of SYNC_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    tables[table] = rows;
    counts[table] = rows.length;
  }

  return {
    kind: 'cricket-zone-app-snapshot',
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    tables,
    counts,
  };
}

async function tableColumns(db: SQLiteDatabase, table: SyncTable) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(columns.map(c => c.name));
}

function safeIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Cloud backup contains an invalid database field.');
  return `"${value}"`;
}

async function insertRows(db: SQLiteDatabase, table: SyncTable, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const currentColumns = await tableColumns(db, table);

  for (const row of rows) {
    const keys = Object.keys(row);
    if (!keys.length) throw new Error(`Cloud backup contains an empty ${table} record.`);
    const unsupported = keys.filter(key => !currentColumns.has(key));
    if (unsupported.length) {
      throw new Error(`Cloud data requires a newer app version (${table}.${unsupported[0]} is not available locally).`);
    }
    const columns = keys.map(safeIdentifier).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(key => row[key] as any);
    await db.runAsync(`INSERT INTO ${safeIdentifier(table)} (${columns}) VALUES (${placeholders})`, ...values);
  }
}

export async function restoreLocalSnapshot(
  db: SQLiteDatabase,
  payload: unknown,
  cloudVersion: number,
  cloudUpdatedAt: string | null,
) {
  assertSnapshot(payload);

  await db.withTransactionAsync(async () => {
    for (const table of [...SYNC_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${safeIdentifier(table)}`);
    }

    for (const table of SYNC_TABLES) {
      await insertRows(db, table, payload.tables[table]);
    }

    // match_players has a role-population trigger. Reapply exported historical role flags
    // after all rows are restored so older match snapshots remain exact.
    for (const row of payload.tables.match_players) {
      if ('is_captain' in row || 'is_vice_captain' in row) {
        await db.runAsync(
          `UPDATE match_players
           SET is_captain = ?, is_vice_captain = ?
           WHERE match_id = ? AND team_id = ? AND player_id = ?`,
          Number(row.is_captain ?? 0),
          Number(row.is_vice_captain ?? 0),
          Number(row.match_id),
          Number(row.team_id),
          Number(row.player_id),
        );
      }
    }
  });

  await markCloudSynced(db, cloudVersion, cloudUpdatedAt);
}

export function snapshotSummary(payload: unknown) {
  assertSnapshot(payload);
  return {
    players: payload.tables.players.length,
    teams: payload.tables.teams.filter(t => Number(t.archived ?? 0) === 0).length,
    seasons: payload.tables.seasons.length,
    matches: payload.tables.matches.length,
    deliveries: payload.tables.deliveries.length,
  };
}
