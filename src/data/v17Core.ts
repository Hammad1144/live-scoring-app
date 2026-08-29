import type { SQLiteDatabase } from 'expo-sqlite';
import { MatchSummary } from '../types';
import { createMatchV16, initDatabaseV16, MatchPlayerSwitch } from './v16Core';

export type SeasonRound = {
  id: number;
  seasonId: number;
  name: string;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  matchCount: number;
};

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some(c => c.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export async function initDatabaseV17(db: SQLiteDatabase) {
  await initDatabaseV16(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS season_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(season_id, name),
      FOREIGN KEY(season_id) REFERENCES seasons(id) ON DELETE CASCADE
    );
  `);
  await ensureColumn(db, 'matches', 'season_round_id', 'season_round_id INTEGER');
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_season_rounds_season ON season_rounds(season_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_matches_season_round ON matches(season_round_id);
  `);

  for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
    const suffix = operation.toLowerCase();
    await db.execAsync(`
      CREATE TRIGGER IF NOT EXISTS trg_cloud_dirty_season_rounds_${suffix}
      AFTER ${operation} ON season_rounds
      BEGIN
        UPDATE cloud_sync_state
        SET dirty = 1,
            local_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = 1;
      END;
    `);
  }
}

function validateOptionalDate(value: string, label: string) {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD format.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
}

export async function createSeasonRound(
  db: SQLiteDatabase,
  seasonId: number,
  name: string,
  startDate = '',
  endDate = '',
): Promise<number> {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Round / week name is required.');
  validateOptionalDate(startDate, 'Start date');
  validateOptionalDate(endDate, 'End date');
  if (startDate && endDate && endDate < startDate) throw new Error('End date cannot be earlier than the start date.');

  const season = await db.getFirstAsync<{ id: number; start_date: string | null; end_date: string | null }>(
    'SELECT id, start_date, end_date FROM seasons WHERE id=?', seasonId,
  );
  if (!season) throw new Error('Season not found.');
  if (season.start_date && startDate && startDate < season.start_date) throw new Error('Round / week cannot start before the season.');
  if (season.end_date && endDate && endDate > season.end_date) throw new Error('Round / week cannot end after the season.');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM season_rounds WHERE season_id=? AND LOWER(name)=LOWER(?) LIMIT 1', seasonId, cleaned,
  );
  if (duplicate) throw new Error('A round / week with this name already exists in the season.');
  const order = await db.getFirstAsync<{ nextOrder: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM season_rounds WHERE season_id=?', seasonId,
  );
  const result = await db.runAsync(
    `INSERT INTO season_rounds(season_id, name, sort_order, start_date, end_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    seasonId,
    cleaned,
    order?.nextOrder ?? 1,
    startDate || null,
    endDate || startDate || null,
    new Date().toISOString(),
  );
  return Number(result.lastInsertRowId);
}

export async function deleteSeasonRound(db: SQLiteDatabase, roundId: number) {
  const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM matches WHERE season_round_id=?', roundId);
  if ((used?.c ?? 0) > 0) throw new Error('This round / week cannot be deleted because it already contains matches.');
  const result = await db.runAsync('DELETE FROM season_rounds WHERE id=?', roundId);
  if (result.changes === 0) throw new Error('Round / week not found.');
}

export async function getSeasonRounds(db: SQLiteDatabase, seasonId: number): Promise<SeasonRound[]> {
  return db.getAllAsync<SeasonRound>(`
    SELECT r.id,
      r.season_id AS seasonId,
      r.name,
      r.sort_order AS sortOrder,
      r.start_date AS startDate,
      r.end_date AS endDate,
      COUNT(m.id) AS matchCount
    FROM season_rounds r
    LEFT JOIN matches m ON m.season_round_id=r.id
    WHERE r.season_id=?
    GROUP BY r.id, r.season_id, r.name, r.sort_order, r.start_date, r.end_date
    ORDER BY r.sort_order ASC, COALESCE(r.start_date, '') ASC, r.id ASC
  `, seasonId);
}

export async function getSeasonRound(db: SQLiteDatabase, roundId: number): Promise<SeasonRound> {
  const row = await db.getFirstAsync<SeasonRound>(`
    SELECT r.id,
      r.season_id AS seasonId,
      r.name,
      r.sort_order AS sortOrder,
      r.start_date AS startDate,
      r.end_date AS endDate,
      COUNT(m.id) AS matchCount
    FROM season_rounds r
    LEFT JOIN matches m ON m.season_round_id=r.id
    WHERE r.id=?
    GROUP BY r.id, r.season_id, r.name, r.sort_order, r.start_date, r.end_date
  `, roundId);
  if (!row) throw new Error('Round / week not found.');
  return row;
}

function matchSummaryQuery(extraWhere: string) {
  return `
    SELECT m.id, a.name AS teamAName, b.name AS teamBName, m.overs_limit AS oversLimit,
      m.status, m.result_text AS resultText, m.created_at AS createdAt,
      m.season_id AS seasonId, s.name AS seasonName
    FROM matches m
    JOIN teams a ON a.id=m.team_a_id
    JOIN teams b ON b.id=m.team_b_id
    LEFT JOIN seasons s ON s.id=m.season_id
    WHERE ${extraWhere}
    ORDER BY m.id DESC
  `;
}

export async function getSeasonRoundMatches(db: SQLiteDatabase, roundId: number): Promise<MatchSummary[]> {
  return db.getAllAsync<MatchSummary>(matchSummaryQuery('m.season_round_id=?'), roundId);
}

export async function getUnassignedSeasonMatches(db: SQLiteDatabase, seasonId: number): Promise<MatchSummary[]> {
  return db.getAllAsync<MatchSummary>(matchSummaryQuery('m.season_id=? AND m.season_round_id IS NULL'), seasonId);
}

export async function getUnassignedSeasonMatchCount(db: SQLiteDatabase, seasonId: number): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM matches WHERE season_id=? AND season_round_id IS NULL', seasonId,
  );
  return row?.c ?? 0;
}

export async function createMatchV17(
  db: SQLiteDatabase,
  teamAId: number,
  teamBId: number,
  oversLimit: number,
  battingFirstTeamId: number,
  seasonId: number | null,
  seasonRoundId: number | null,
  switches: MatchPlayerSwitch[] = [],
): Promise<number> {
  if (seasonId == null && seasonRoundId != null) throw new Error('A round / week requires a season.');
  if (seasonId != null && seasonRoundId == null) throw new Error('Select a round / week for this season match.');
  if (seasonId != null && seasonRoundId != null) {
    const round = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM season_rounds WHERE id=? AND season_id=?', seasonRoundId, seasonId,
    );
    if (!round) throw new Error('Selected round / week does not belong to the selected season.');
  }

  const matchId = await createMatchV16(db, teamAId, teamBId, oversLimit, battingFirstTeamId, seasonId, switches);
  if (seasonRoundId != null) await db.runAsync('UPDATE matches SET season_round_id=? WHERE id=?', seasonRoundId, matchId);
  return matchId;
}
