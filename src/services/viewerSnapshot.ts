import {
  VIEWER_CLOUD_SNAPSHOT_ID,
  VIEWER_SUPABASE_PUBLISHABLE_KEY,
  VIEWER_SUPABASE_URL,
} from '../config/viewerCloud';
import { ViewerSnapshot } from '../web/viewerData';

type CloudSnapshotRow = {
  id: string;
  version: number;
  payload: unknown;
  updated_at: string | null;
};

export type ViewerCloudSnapshot = {
  version: number;
  updatedAt: string | null;
  payload: ViewerSnapshot;
};

function assertViewerSnapshot(payload: unknown): asserts payload is ViewerSnapshot {
  const value = payload as ViewerSnapshot | null;
  if (!value || value.kind !== 'cricket-zone-app-snapshot' || !value.tables) {
    throw new Error('The cloud data format is not supported by this viewer.');
  }
  for (const tableName of ['players', 'teams', 'seasons', 'matches', 'match_players', 'innings', 'deliveries']) {
    if (!Array.isArray(value.tables[tableName])) throw new Error(`Cloud data is missing ${tableName}.`);
  }
  if (!Array.isArray(value.tables.season_rounds)) value.tables.season_rounds = [];
}

function normalizeViewerSnapshot(payload: ViewerSnapshot): ViewerSnapshot {
  const matches = (payload.tables.matches ?? []).map(match => {
    const status = typeof match.status === 'string' ? match.status.trim().toUpperCase() : '';

    // Android stores finished matches as COMPLETE. The original desktop viewer
    // expected COMPLETED, so normalize the canonical Android value at the shared
    // web ingestion layer. The PWA mobile viewer already accepts both values.
    if (status === 'COMPLETE') return { ...match, status: 'COMPLETED' };
    return match;
  });

  return {
    ...payload,
    tables: {
      ...payload.tables,
      matches,
    },
  };
}

export async function fetchViewerCloudSnapshot(): Promise<ViewerCloudSnapshot> {
  const url = `${VIEWER_SUPABASE_URL}/rest/v1/app_snapshots?id=eq.${encodeURIComponent(VIEWER_CLOUD_SNAPSHOT_ID)}&select=id,version,payload,updated_at&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        apikey: VIEWER_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Unable to load viewer data (${response.status}).`);
    const rows = await response.json() as CloudSnapshotRow[];
    const row = rows[0];
    if (!row) throw new Error('Cloud snapshot record was not found.');
    assertViewerSnapshot(row.payload);
    return {
      version: row.version,
      updatedAt: row.updated_at,
      payload: normalizeViewerSnapshot(row.payload),
    };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new Error('Cloud request timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
