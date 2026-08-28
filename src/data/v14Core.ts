import type { SQLiteDatabase } from 'expo-sqlite';
import { createMatch } from './database';
import { initDatabaseV13 } from './v13Core';
import { MatchSummary, PlayerProfileStats, Season, SeasonRankingRow } from '../types';

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some(c => c.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export async function initDatabaseV14(db: SQLiteDatabase) {
  await initDatabaseV13(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await ensureColumn(db, 'matches', 'season_id', 'season_id INTEGER');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);');
}

function validateDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD format.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
}

export async function createSeason(db: SQLiteDatabase, name: string, startDate: string, endDate: string): Promise<number> {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Season name is required.');
  validateDate(startDate, 'Start date');
  validateDate(endDate, 'End date');
  if (endDate < startDate) throw new Error('End date cannot be earlier than the start date.');
  const duplicate = await db.getFirstAsync<{ id: number }>('SELECT id FROM seasons WHERE LOWER(name)=LOWER(?) LIMIT 1', cleaned);
  if (duplicate) throw new Error('A season with this name already exists.');
  const result = await db.runAsync(
    'INSERT INTO seasons(name, start_date, end_date, created_at) VALUES (?, ?, ?, ?)',
    cleaned, startDate, endDate, new Date().toISOString(),
  );
  return Number(result.lastInsertRowId);
}

export async function deleteSeason(db: SQLiteDatabase, seasonId: number): Promise<void> {
  const row = await db.getFirstAsync<{ matches: number }>('SELECT COUNT(*) AS matches FROM matches WHERE season_id=?', seasonId);
  if ((row?.matches ?? 0) > 0) throw new Error('This season cannot be deleted because it already has matches.');
  const result = await db.runAsync('DELETE FROM seasons WHERE id=?', seasonId);
  if (result.changes === 0) throw new Error('Season not found.');
}

export async function getSeasons(db: SQLiteDatabase): Promise<Season[]> {
  return db.getAllAsync<Season>(`
    SELECT s.id, s.name, s.start_date AS startDate, s.end_date AS endDate, COUNT(m.id) AS matchCount
    FROM seasons s
    LEFT JOIN matches m ON m.season_id=s.id
    GROUP BY s.id, s.name, s.start_date, s.end_date
    ORDER BY COALESCE(s.start_date, '') DESC, s.id DESC
  `);
}

export async function getSeason(db: SQLiteDatabase, seasonId: number): Promise<Season> {
  const row = await db.getFirstAsync<Season>(`
    SELECT s.id, s.name, s.start_date AS startDate, s.end_date AS endDate, COUNT(m.id) AS matchCount
    FROM seasons s LEFT JOIN matches m ON m.season_id=s.id
    WHERE s.id=? GROUP BY s.id, s.name, s.start_date, s.end_date
  `, seasonId);
  if (!row) throw new Error('Season not found.');
  return row;
}

export async function createMatchV14(
  db: SQLiteDatabase,
  teamAId: number,
  teamBId: number,
  oversLimit: number,
  battingFirstTeamId: number,
  seasonId: number | null,
): Promise<number> {
  if (seasonId != null) {
    const season = await db.getFirstAsync<{ id: number }>('SELECT id FROM seasons WHERE id=?', seasonId);
    if (!season) throw new Error('Selected season no longer exists.');
  }
  const matchId = await createMatch(db, teamAId, teamBId, oversLimit, battingFirstTeamId);
  if (seasonId != null) await db.runAsync('UPDATE matches SET season_id=? WHERE id=?', seasonId, matchId);
  return matchId;
}

export async function getSeasonMatches(db: SQLiteDatabase, seasonId: number): Promise<MatchSummary[]> {
  return db.getAllAsync<MatchSummary>(`
    SELECT m.id, a.name AS teamAName, b.name AS teamBName, m.overs_limit AS oversLimit,
      m.status, m.result_text AS resultText, m.created_at AS createdAt,
      m.season_id AS seasonId, s.name AS seasonName
    FROM matches m
    JOIN teams a ON a.id=m.team_a_id
    JOIN teams b ON b.id=m.team_b_id
    LEFT JOIN seasons s ON s.id=m.season_id
    WHERE m.season_id=?
    ORDER BY m.id DESC
  `, seasonId);
}

// Cricket Zone season impact score.
// Batting: run +1, four bonus +4, six bonus +6.
// Bowling: wicket +10, bowled bonus +5, bowling dot ball +1.
// Fielding: catch +8, stumping +10, run-out involvement +6.
export async function getSeasonImpactRanking(db: SQLiteDatabase, seasonId: number): Promise<SeasonRankingRow[]> {
  return db.getAllAsync<SeasonRankingRow>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp JOIN matches m ON m.id=mp.match_id
      WHERE m.season_id=? GROUP BY mp.player_name
    ),
    batting AS (
      SELECT mp.player_name AS name,
        SUM(d.bat_runs)
        + 4 * SUM(CASE WHEN d.bat_runs=4 THEN 1 ELSE 0 END)
        + 6 * SUM(CASE WHEN d.bat_runs=6 THEN 1 ELSE 0 END) AS points
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.striker_id
      WHERE m.season_id=? GROUP BY mp.player_name
    ),
    bowling AS (
      SELECT mp.player_name AS name,
        10 * SUM(d.credited_bowler)
        + 5 * SUM(CASE WHEN d.wicket=1 AND d.wicket_type='Bowled' AND d.credited_bowler=1 THEN 1 ELSE 0 END)
        + SUM(CASE WHEN d.legal_ball=1 AND d.bat_runs=0 AND d.wide_runs=0 AND d.no_ball_runs=0 THEN 1 ELSE 0 END) AS points
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.bowler_id
      WHERE m.season_id=? GROUP BY mp.player_name
    ),
    fielding AS (
      SELECT mp.player_name AS name,
        8 * SUM(CASE WHEN d.wicket_type='Caught' THEN 1 ELSE 0 END)
        + 10 * SUM(CASE WHEN d.wicket_type='Stumped' THEN 1 ELSE 0 END)
        + 6 * SUM(CASE WHEN d.wicket_type='Run Out' THEN 1 ELSE 0 END) AS points
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.fielder_id
      WHERE m.season_id=? AND d.wicket=1 AND d.fielder_id IS NOT NULL
      GROUP BY mp.player_name
    )
    SELECT a.name, a.matches,
      COALESCE(b.points,0) AS battingPoints,
      COALESCE(bo.points,0) AS bowlingPoints,
      COALESCE(f.points,0) AS fieldingPoints,
      COALESCE(b.points,0)+COALESCE(bo.points,0)+COALESCE(f.points,0) AS totalPoints
    FROM appearances a
    LEFT JOIN batting b ON b.name=a.name
    LEFT JOIN bowling bo ON bo.name=a.name
    LEFT JOIN fielding f ON f.name=a.name
    ORDER BY totalPoints DESC, a.name
  `, seasonId, seasonId, seasonId, seasonId);
}

export async function getPlayerProfileStats(db: SQLiteDatabase, playerName: string, seasonId: number | null): Promise<PlayerProfileStats> {
  const scope = '(? IS NULL OR m.season_id=?)';
  const appearances = await db.getFirstAsync<{ matches: number }>(`
    SELECT COUNT(DISTINCT mp.match_id) AS matches
    FROM match_players mp JOIN matches m ON m.id=mp.match_id
    WHERE mp.player_name=? AND ${scope}
  `, playerName, seasonId, seasonId);

  const batting = await db.getFirstAsync<{ innings: number; runs: number; balls: number; fours: number; sixes: number; highest: number }>(`
    WITH per_innings AS (
      SELECT d.innings_id,
        SUM(d.bat_runs) AS runs,
        SUM(CASE WHEN d.legal_ball=1 THEN 1 ELSE 0 END) AS balls,
        SUM(CASE WHEN d.bat_runs=4 THEN 1 ELSE 0 END) AS fours,
        SUM(CASE WHEN d.bat_runs=6 THEN 1 ELSE 0 END) AS sixes
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.striker_id
      WHERE mp.player_name=? AND ${scope}
      GROUP BY d.innings_id
    )
    SELECT COUNT(*) AS innings, COALESCE(SUM(runs),0) AS runs, COALESCE(SUM(balls),0) AS balls,
      COALESCE(SUM(fours),0) AS fours, COALESCE(SUM(sixes),0) AS sixes, COALESCE(MAX(runs),0) AS highest
    FROM per_innings
  `, playerName, seasonId, seasonId);

  const dismissals = await db.getFirstAsync<{ c: number }>(`
    SELECT COUNT(*) AS c
    FROM deliveries d JOIN matches m ON m.id=d.match_id
    JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.dismissed_player_id
    WHERE d.wicket=1 AND mp.player_name=? AND ${scope}
  `, playerName, seasonId, seasonId);

  const bowling = await db.getFirstAsync<{ legalBalls: number; runs: number; wickets: number; dotBalls: number }>(`
    SELECT COALESCE(SUM(d.legal_ball),0) AS legalBalls,
      COALESCE(SUM(d.bat_runs+d.wide_runs+d.no_ball_runs),0) AS runs,
      COALESCE(SUM(d.credited_bowler),0) AS wickets,
      COALESCE(SUM(CASE WHEN d.legal_ball=1 AND d.bat_runs=0 AND d.wide_runs=0 AND d.no_ball_runs=0 THEN 1 ELSE 0 END),0) AS dotBalls
    FROM deliveries d JOIN matches m ON m.id=d.match_id
    JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.bowler_id
    WHERE mp.player_name=? AND ${scope}
  `, playerName, seasonId, seasonId);

  const best = await db.getFirstAsync<{ wickets: number; runs: number }>(`
    SELECT SUM(d.credited_bowler) AS wickets, SUM(d.bat_runs+d.wide_runs+d.no_ball_runs) AS runs
    FROM deliveries d JOIN matches m ON m.id=d.match_id
    JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.bowler_id
    WHERE mp.player_name=? AND ${scope}
    GROUP BY d.innings_id
    ORDER BY wickets DESC, runs ASC LIMIT 1
  `, playerName, seasonId, seasonId);

  const fielding = await db.getFirstAsync<{ catches: number; runOuts: number; stumpings: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN d.wicket_type='Caught' THEN 1 ELSE 0 END),0) AS catches,
      COALESCE(SUM(CASE WHEN d.wicket_type='Run Out' THEN 1 ELSE 0 END),0) AS runOuts,
      COALESCE(SUM(CASE WHEN d.wicket_type='Stumped' THEN 1 ELSE 0 END),0) AS stumpings
    FROM deliveries d JOIN matches m ON m.id=d.match_id
    JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.fielder_id
    WHERE d.wicket=1 AND mp.player_name=? AND ${scope}
  `, playerName, seasonId, seasonId);

  const runs = batting?.runs ?? 0;
  const balls = batting?.balls ?? 0;
  const outs = dismissals?.c ?? 0;
  const legalBalls = bowling?.legalBalls ?? 0;
  const conceded = bowling?.runs ?? 0;
  const catches = fielding?.catches ?? 0;
  const runOuts = fielding?.runOuts ?? 0;
  const stumpings = fielding?.stumpings ?? 0;

  return {
    matches: appearances?.matches ?? 0,
    batting: {
      innings: batting?.innings ?? 0,
      runs,
      balls,
      fours: batting?.fours ?? 0,
      sixes: batting?.sixes ?? 0,
      highest: batting?.highest ?? 0,
      dismissals: outs,
      average: outs ? runs / outs : runs,
      strikeRate: balls ? (runs / balls) * 100 : 0,
    },
    bowling: {
      legalBalls,
      runs: conceded,
      wickets: bowling?.wickets ?? 0,
      dotBalls: bowling?.dotBalls ?? 0,
      economy: legalBalls ? conceded / (legalBalls / 6) : 0,
      bestWickets: best?.wickets ?? 0,
      bestRuns: best?.runs ?? 0,
    },
    fielding: {
      catches,
      runOuts,
      stumpings,
      totalDismissals: catches + runOuts + stumpings,
    },
  };
}
