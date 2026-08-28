import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CLOUD_SNAPSHOT_ID,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '../config/cloud';
import { buildLocalSnapshot, restoreLocalSnapshot, snapshotSummary } from '../data/cloudSnapshot';
import { getLocalSyncState, LocalSyncState, markCloudSynced } from '../data/v15Core';

export type CloudSnapshotRow = {
  id: string;
  version: number;
  payload: unknown;
  updated_at: string | null;
  updated_by: string | null;
};

export type CloudSyncStatus = {
  cloudVersion: number;
  cloudUpdatedAt: string | null;
  cloudHasBackup: boolean;
  localDirty: boolean;
  localUpdatedAt: string | null;
  lastSyncedAt: string | null;
  lastCloudVersion: number;
  summary: { players: number; teams: number; seasons: number; matches: number; deliveries: number } | null;
};

export class CloudSyncConflictError extends Error {
  constructor(
    message: string,
    public readonly direction: 'save' | 'refresh',
    public readonly status: CloudSyncStatus,
  ) {
    super(message);
    this.name = 'CloudSyncConflictError';
  }
}

function apiHeaders(accessToken?: string) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function responseError(response: Response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.message || body?.msg || body?.error_description || body?.error || '';
  } catch {
    detail = await response.text().catch(() => '');
  }
  return detail ? `${response.status}: ${detail}` : `${response.status} ${response.statusText}`;
}

export async function fetchCloudSnapshot(): Promise<CloudSnapshotRow> {
  const url = `${SUPABASE_URL}/rest/v1/app_snapshots?id=eq.${encodeURIComponent(CLOUD_SNAPSHOT_ID)}&select=id,version,payload,updated_at,updated_by&limit=1`;
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`Unable to read cloud data (${await responseError(response)}).`);
  const rows = await response.json() as CloudSnapshotRow[];
  const row = rows[0];
  if (!row) throw new Error('Cloud snapshot record was not found.');
  return row;
}

async function authenticateAdmin() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Cloud admin authentication failed (${await responseError(response)}).`);
  const body = await response.json() as { access_token?: string; user?: { id?: string } };
  if (!body.access_token || !body.user?.id) throw new Error('Cloud admin authentication returned an incomplete session.');
  return { accessToken: body.access_token, userId: body.user.id };
}

function makeStatus(cloud: CloudSnapshotRow, local: LocalSyncState): CloudSyncStatus {
  const hasBackup = cloud.version > 0 && !!cloud.payload && (cloud.payload as any)?.kind === 'cricket-zone-app-snapshot';
  return {
    cloudVersion: cloud.version,
    cloudUpdatedAt: cloud.updated_at,
    cloudHasBackup: hasBackup,
    localDirty: local.dirty === 1,
    localUpdatedAt: local.localUpdatedAt,
    lastSyncedAt: local.lastSyncedAt,
    lastCloudVersion: local.lastCloudVersion,
    summary: hasBackup ? snapshotSummary(cloud.payload) : null,
  };
}

export async function getCloudSyncStatus(db: SQLiteDatabase): Promise<CloudSyncStatus> {
  const [cloud, local] = await Promise.all([fetchCloudSnapshot(), getLocalSyncState(db)]);
  return makeStatus(cloud, local);
}

export async function saveToCloud(db: SQLiteDatabase, force = false) {
  const [cloud, local] = await Promise.all([fetchCloudSnapshot(), getLocalSyncState(db)]);
  const status = makeStatus(cloud, local);

  if (!force && cloud.version > local.lastCloudVersion) {
    throw new CloudSyncConflictError(
      'The cloud contains a newer version than this device. Refresh first, or explicitly overwrite the newer cloud data.',
      'save',
      status,
    );
  }

  const snapshot = await buildLocalSnapshot(db);
  const auth = await authenticateAdmin();
  const nextVersion = cloud.version + 1;
  const now = new Date().toISOString();
  const url = `${SUPABASE_URL}/rest/v1/app_snapshots?id=eq.${encodeURIComponent(CLOUD_SNAPSHOT_ID)}&version=eq.${cloud.version}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...apiHeaders(auth.accessToken),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      version: nextVersion,
      payload: snapshot,
      updated_at: now,
      updated_by: auth.userId,
    }),
  });
  if (!response.ok) throw new Error(`Unable to save cloud data (${await responseError(response)}).`);
  const rows = await response.json() as CloudSnapshotRow[];
  const saved = rows[0];
  if (!saved) {
    throw new CloudSyncConflictError(
      'Cloud data changed while this device was saving. Refresh the latest cloud state and try again.',
      'save',
      await getCloudSyncStatus(db),
    );
  }

  await markCloudSynced(db, saved.version, saved.updated_at);
  return { row: saved, summary: snapshotSummary(snapshot) };
}

export async function refreshFromCloud(db: SQLiteDatabase, force = false) {
  const [cloud, local] = await Promise.all([fetchCloudSnapshot(), getLocalSyncState(db)]);
  const status = makeStatus(cloud, local);
  if (!status.cloudHasBackup) throw new Error('No cloud backup has been saved yet. Save data from an Admin device first.');

  if (!force && local.dirty === 1) {
    throw new CloudSyncConflictError(
      'This device contains local changes that have not been saved to cloud. Refreshing will replace them.',
      'refresh',
      status,
    );
  }

  await restoreLocalSnapshot(db, cloud.payload, cloud.version, cloud.updated_at);
  return { row: cloud, summary: snapshotSummary(cloud.payload) };
}
