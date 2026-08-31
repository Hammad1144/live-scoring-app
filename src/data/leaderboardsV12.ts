import type { SQLiteDatabase } from 'expo-sqlite';
import { LeaderboardRow } from '../types';

export async function getLeaderboardsV12(db: SQLiteDatabase, seasonId: number | null = null) {
  const scorerRows = await db.getAllAsync<{ playerId: number; name: string; value: number; matches: number }>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp
      JOIN matches m ON m.id=mp.match_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    ), stats AS (
      SELECT MIN(d.striker_id) AS playerId, mp.player_name AS name, SUM(d.bat_runs) AS value
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.striker_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    )
    SELECT s.playerId, s.name, s.value, a.matches
    FROM stats s JOIN appearances a ON a.name=s.name
    WHERE s.value > 0
    ORDER BY s.value DESC, s.name LIMIT 20
  `, seasonId, seasonId, seasonId, seasonId);

  const sixRows = await db.getAllAsync<{ playerId: number; name: string; value: number; matches: number }>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp
      JOIN matches m ON m.id=mp.match_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    ), stats AS (
      SELECT MIN(d.striker_id) AS playerId, mp.player_name AS name,
        SUM(CASE WHEN d.bat_runs=6 THEN 1 ELSE 0 END) AS value
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.striker_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    )
    SELECT s.playerId, s.name, s.value, a.matches
    FROM stats s JOIN appearances a ON a.name=s.name
    WHERE s.value > 0
    ORDER BY s.value DESC, s.name LIMIT 20
  `, seasonId, seasonId, seasonId, seasonId);

  const wicketRows = await db.getAllAsync<{ playerId: number; name: string; value: number; matches: number }>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp
      JOIN matches m ON m.id=mp.match_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    ), stats AS (
      SELECT MIN(d.bowler_id) AS playerId, mp.player_name AS name, SUM(d.credited_bowler) AS value
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.bowler_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    )
    SELECT s.playerId, s.name, s.value, a.matches
    FROM stats s JOIN appearances a ON a.name=s.name
    WHERE s.value > 0
    ORDER BY s.value DESC, s.name LIMIT 20
  `, seasonId, seasonId, seasonId, seasonId);

  const catchRows = await db.getAllAsync<{ playerId: number; name: string; value: number; matches: number }>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp
      JOIN matches m ON m.id=mp.match_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    ), stats AS (
      SELECT MIN(d.fielder_id) AS playerId, mp.player_name AS name, COUNT(*) AS value
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.fielder_id
      WHERE d.wicket=1 AND d.wicket_type='Caught' AND d.fielder_id IS NOT NULL
        AND (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    )
    SELECT s.playerId, s.name, s.value, a.matches
    FROM stats s JOIN appearances a ON a.name=s.name
    WHERE s.value > 0
    ORDER BY s.value DESC, s.name LIMIT 20
  `, seasonId, seasonId, seasonId, seasonId);

  const economyRows = await db.getAllAsync<{ playerId: number; name: string; legalBalls: number; runs: number; matches: number }>(`
    WITH appearances AS (
      SELECT mp.player_name AS name, COUNT(DISTINCT mp.match_id) AS matches
      FROM match_players mp
      JOIN matches m ON m.id=mp.match_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    ), stats AS (
      SELECT MIN(d.bowler_id) AS playerId, mp.player_name AS name,
        SUM(d.legal_ball) AS legalBalls,
        SUM(d.bat_runs + d.wide_runs + d.no_ball_runs) AS runs
      FROM deliveries d
      JOIN matches m ON m.id=d.match_id
      JOIN match_players mp ON mp.match_id=d.match_id AND mp.player_id=d.bowler_id
      WHERE (? IS NULL OR m.season_id=?)
      GROUP BY mp.player_name
    )
    SELECT s.playerId, s.name, s.legalBalls, s.runs, a.matches
    FROM stats s JOIN appearances a ON a.name=s.name
    WHERE s.legalBalls >= 6
    ORDER BY (1.0*s.runs)/(s.legalBalls/6.0) ASC, s.name LIMIT 20
  `, seasonId, seasonId, seasonId, seasonId);

  const matchLabel = (matches: number) => `${matches} match${matches === 1 ? '' : 'es'}`;
  const bestEconomy: LeaderboardRow[] = economyRows.map(r => ({
    playerId: r.playerId,
    name: r.name,
    value: r.runs / (r.legalBalls / 6),
    secondary: `${matchLabel(r.matches)} • ${r.runs} runs / ${Math.floor(r.legalBalls / 6)}.${r.legalBalls % 6} ov`,
  }));

  return {
    topScorers: scorerRows.map(r => ({ playerId: r.playerId, name: r.name, value: r.value, secondary: matchLabel(r.matches) })),
    mostSixes: sixRows.map(r => ({ playerId: r.playerId, name: r.name, value: r.value, secondary: matchLabel(r.matches) })),
    mostWickets: wicketRows.map(r => ({ playerId: r.playerId, name: r.name, value: r.value, secondary: matchLabel(r.matches) })),
    mostCatches: catchRows.map(r => ({ playerId: r.playerId, name: r.name, value: r.value, secondary: matchLabel(r.matches) })),
    bestEconomy,
  };
}
