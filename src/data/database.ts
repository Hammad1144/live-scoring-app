import type { SQLiteDatabase } from 'expo-sqlite';
import {
  BatterLine,
  BowlerLine,
  DeliveryInput,
  InningsRow,
  LeaderboardRow,
  LiveMatch,
  MatchDetail,
  MatchRow,
  MatchSummary,
  Player,
  RecordResult,
  Team,
  TeamSummary,
} from '../types';
import { deliveryLabel, normalizeDelivery } from '../logic/cricket';

type StateSnapshot = {
  runs: number;
  wickets: number;
  legalBalls: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  strikerId: number | null;
  nonStrikerId: number | null;
  bowlerId: number | null;
  lastBowlerId: number | null;
  completed: number;
};

export async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS team_players (
      team_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      batting_order INTEGER NOT NULL,
      PRIMARY KEY (team_id, player_id),
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY(player_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_a_id INTEGER NOT NULL,
      team_b_id INTEGER NOT NULL,
      overs_limit INTEGER NOT NULL CHECK(overs_limit BETWEEN 1 AND 10),
      batting_first_team_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      current_innings INTEGER NOT NULL DEFAULT 1,
      result_text TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(team_a_id) REFERENCES teams(id),
      FOREIGN KEY(team_b_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS match_players (
      match_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      batting_order INTEGER NOT NULL,
      PRIMARY KEY(match_id, team_id, player_id),
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS innings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      innings_no INTEGER NOT NULL,
      batting_team_id INTEGER NOT NULL,
      bowling_team_id INTEGER NOT NULL,
      runs INTEGER NOT NULL DEFAULT 0,
      wickets INTEGER NOT NULL DEFAULT 0,
      legal_balls INTEGER NOT NULL DEFAULT 0,
      wides INTEGER NOT NULL DEFAULT 0,
      no_balls INTEGER NOT NULL DEFAULT 0,
      byes INTEGER NOT NULL DEFAULT 0,
      leg_byes INTEGER NOT NULL DEFAULT 0,
      striker_id INTEGER,
      non_striker_id INTEGER,
      bowler_id INTEGER,
      last_bowler_id INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      target INTEGER,
      UNIQUE(match_id, innings_no),
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      innings_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      over_no INTEGER NOT NULL,
      ball_in_over INTEGER NOT NULL,
      striker_id INTEGER NOT NULL,
      non_striker_id INTEGER NOT NULL,
      bowler_id INTEGER NOT NULL,
      bat_runs INTEGER NOT NULL DEFAULT 0,
      wide_runs INTEGER NOT NULL DEFAULT 0,
      no_ball_runs INTEGER NOT NULL DEFAULT 0,
      bye_runs INTEGER NOT NULL DEFAULT 0,
      leg_bye_runs INTEGER NOT NULL DEFAULT 0,
      total_runs INTEGER NOT NULL DEFAULT 0,
      legal_ball INTEGER NOT NULL,
      wicket INTEGER NOT NULL DEFAULT 0,
      wicket_type TEXT,
      dismissed_player_id INTEGER,
      credited_bowler INTEGER NOT NULL DEFAULT 0,
      state_before_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY(innings_id) REFERENCES innings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_innings ON deliveries(innings_id, seq);
  `);

  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM players');
  if ((count?.c ?? 0) === 0) {
    for (let i = 1; i <= 24; i++) {
      await db.runAsync('INSERT INTO players(id, name) VALUES (?, ?)', i, `Player ${i}`);
    }
  }
}

export async function getPlayers(db: SQLiteDatabase): Promise<Player[]> {
  return db.getAllAsync<Player>('SELECT id, name FROM players ORDER BY id');
}

export async function renamePlayer(db: SQLiteDatabase, id: number, name: string) {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Player name cannot be empty.');
  await db.runAsync('UPDATE players SET name = ? WHERE id = ?', cleaned, id);
}

export async function getTeams(db: SQLiteDatabase): Promise<TeamSummary[]> {
  return db.getAllAsync<TeamSummary>(`
    SELECT t.id, t.name, COUNT(tp.player_id) AS playerCount
    FROM teams t
    LEFT JOIN team_players tp ON tp.team_id = t.id
    GROUP BY t.id, t.name
    ORDER BY t.name COLLATE NOCASE
  `);
}

export async function getTeam(db: SQLiteDatabase, teamId: number): Promise<Team> {
  const row = await db.getFirstAsync<{ id: number; name: string }>('SELECT id, name FROM teams WHERE id = ?', teamId);
  if (!row) throw new Error('Team not found.');
  const players = await db.getAllAsync<Player>(`
    SELECT p.id, p.name FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? ORDER BY tp.batting_order
  `, teamId);
  return { id: row.id, name: row.name, players };
}

export async function saveTeam(db: SQLiteDatabase, name: string, playerIds: number[], teamId?: number) {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Team name is required.');
  if (playerIds.length < 2 || playerIds.length > 11) throw new Error('Select between 2 and 11 players.');
  const uniqueIds = [...new Set(playerIds)];
  if (uniqueIds.length !== playerIds.length) throw new Error('Duplicate players are not allowed.');

  let id = teamId;
  if (id) {
    await db.runAsync('UPDATE teams SET name = ? WHERE id = ?', cleaned, id);
    await db.runAsync('DELETE FROM team_players WHERE team_id = ?', id);
  } else {
    const result = await db.runAsync('INSERT INTO teams(name) VALUES (?)', cleaned);
    id = Number(result.lastInsertRowId);
  }
  for (let i = 0; i < uniqueIds.length; i++) {
    await db.runAsync('INSERT INTO team_players(team_id, player_id, batting_order) VALUES (?, ?, ?)', id, uniqueIds[i]!, i);
  }
  return id;
}

export async function deleteTeam(db: SQLiteDatabase, teamId: number) {
  const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM matches WHERE team_a_id = ? OR team_b_id = ?', teamId, teamId);
  if ((used?.c ?? 0) > 0) throw new Error('This team is used in match history and cannot be deleted.');
  await db.runAsync('DELETE FROM teams WHERE id = ?', teamId);
}

async function snapshotMatchPlayers(db: SQLiteDatabase, matchId: number, teamId: number) {
  const rows = await db.getAllAsync<{ player_id: number; name: string; batting_order: number }>(`
    SELECT tp.player_id, p.name, tp.batting_order
    FROM team_players tp JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? ORDER BY tp.batting_order
  `, teamId);
  for (const row of rows) {
    await db.runAsync(
      'INSERT INTO match_players(match_id, team_id, player_id, player_name, batting_order) VALUES (?, ?, ?, ?, ?)',
      matchId, teamId, row.player_id, row.name, row.batting_order,
    );
  }
}

export async function createMatch(
  db: SQLiteDatabase,
  teamAId: number,
  teamBId: number,
  oversLimit: number,
  battingFirstTeamId: number,
): Promise<number> {
  if (teamAId === teamBId) throw new Error('Select two different teams.');
  if (!Number.isInteger(oversLimit) || oversLimit < 1 || oversLimit > 10) throw new Error('Match overs must be between 1 and 10.');
  if (![teamAId, teamBId].includes(battingFirstTeamId)) throw new Error('Batting-first team is invalid.');

  const overlap = await db.getAllAsync<{ player_id: number }>(`
    SELECT a.player_id FROM team_players a
    JOIN team_players b ON a.player_id = b.player_id
    WHERE a.team_id = ? AND b.team_id = ?
  `, teamAId, teamBId);
  if (overlap.length) throw new Error('The two teams share one or more players. Use unique players for this match.');

  const counts = await db.getAllAsync<{ team_id: number; c: number }>(`
    SELECT team_id, COUNT(*) AS c FROM team_players WHERE team_id IN (?, ?) GROUP BY team_id
  `, teamAId, teamBId);
  if (counts.length !== 2 || counts.some(x => x.c < 2)) throw new Error('Each team needs at least 2 players.');

  const result = await db.runAsync(
    `INSERT INTO matches(team_a_id, team_b_id, overs_limit, batting_first_team_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    teamAId, teamBId, oversLimit, battingFirstTeamId, new Date().toISOString(),
  );
  const matchId = Number(result.lastInsertRowId);
  await snapshotMatchPlayers(db, matchId, teamAId);
  await snapshotMatchPlayers(db, matchId, teamBId);
  const bowlingTeamId = battingFirstTeamId === teamAId ? teamBId : teamAId;
  await db.runAsync(
    'INSERT INTO innings(match_id, innings_no, batting_team_id, bowling_team_id) VALUES (?, 1, ?, ?)',
    matchId, battingFirstTeamId, bowlingTeamId,
  );
  return matchId;
}

export async function getMatch(db: SQLiteDatabase, matchId: number): Promise<MatchRow> {
  const row = await db.getFirstAsync<MatchRow>('SELECT * FROM matches WHERE id = ?', matchId);
  if (!row) throw new Error('Match not found.');
  return row;
}

export async function getCurrentInnings(db: SQLiteDatabase, matchId: number): Promise<InningsRow> {
  const match = await getMatch(db, matchId);
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE match_id = ? AND innings_no = ?', matchId, match.current_innings);
  if (!innings) throw new Error('Current innings not found.');
  return innings;
}

export async function getMatchPlayers(db: SQLiteDatabase, matchId: number, teamId: number): Promise<Player[]> {
  return db.getAllAsync<Player>(`
    SELECT player_id AS id, player_name AS name FROM match_players
    WHERE match_id = ? AND team_id = ? ORDER BY batting_order
  `, matchId, teamId);
}

export async function configureInnings(db: SQLiteDatabase, inningsId: number, strikerId: number, nonStrikerId: number, bowlerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  if (innings.completed) throw new Error('Innings is already complete.');
  if (strikerId === nonStrikerId) throw new Error('Select two different opening batters.');
  const batters = await getMatchPlayers(db, innings.match_id, innings.batting_team_id);
  const bowlers = await getMatchPlayers(db, innings.match_id, innings.bowling_team_id);
  if (!batters.some(p => p.id === strikerId) || !batters.some(p => p.id === nonStrikerId)) throw new Error('Invalid batting selection.');
  if (!bowlers.some(p => p.id === bowlerId)) throw new Error('Invalid bowler selection.');
  if (innings.last_bowler_id && innings.last_bowler_id === bowlerId) throw new Error('A bowler cannot bowl consecutive overs.');
  await db.runAsync('UPDATE innings SET striker_id = ?, non_striker_id = ?, bowler_id = ? WHERE id = ?', strikerId, nonStrikerId, bowlerId, inningsId);
}

export async function setNextBatter(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const available = await getAvailableBatters(db, inningsId);
  if (!available.some(p => p.id === playerId)) throw new Error('That batter is not available.');
  if (innings.striker_id == null) await db.runAsync('UPDATE innings SET striker_id = ? WHERE id = ?', playerId, inningsId);
  else if (innings.non_striker_id == null) await db.runAsync('UPDATE innings SET non_striker_id = ? WHERE id = ?', playerId, inningsId);
  else throw new Error('Both batting ends are already occupied.');
}

export async function setNextBowler(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const bowlers = await getMatchPlayers(db, innings.match_id, innings.bowling_team_id);
  if (!bowlers.some(p => p.id === playerId)) throw new Error('Invalid bowler.');
  if (innings.last_bowler_id === playerId) throw new Error('A bowler cannot bowl consecutive overs.');
  await db.runAsync('UPDATE innings SET bowler_id = ? WHERE id = ?', playerId, inningsId);
}

export async function getAvailableBatters(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) return [];
  const dismissed = await db.getAllAsync<{ id: number }>('SELECT DISTINCT dismissed_player_id AS id FROM deliveries WHERE innings_id = ? AND wicket = 1 AND dismissed_player_id IS NOT NULL', inningsId);
  const blocked = new Set<number>(dismissed.map(x => x.id));
  if (innings.striker_id) blocked.add(innings.striker_id);
  if (innings.non_striker_id) blocked.add(innings.non_striker_id);
  const all = await getMatchPlayers(db, innings.match_id, innings.batting_team_id);
  return all.filter(p => !blocked.has(p.id));
}

export async function getAvailableBowlers(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) return [];
  const all = await getMatchPlayers(db, innings.match_id, innings.bowling_team_id);
  return all.filter(p => p.id !== innings.last_bowler_id);
}

function beforeState(i: InningsRow): StateSnapshot {
  return {
    runs: i.runs, wickets: i.wickets, legalBalls: i.legal_balls, wides: i.wides,
    noBalls: i.no_balls, byes: i.byes, legByes: i.leg_byes,
    strikerId: i.striker_id, nonStrikerId: i.non_striker_id, bowlerId: i.bowler_id,
    lastBowlerId: i.last_bowler_id, completed: i.completed,
  };
}

export async function recordDelivery(db: SQLiteDatabase, inningsId: number, rawInput: DeliveryInput): Promise<RecordResult> {
  let innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  if (innings.completed) throw new Error('Innings is already complete.');
  if (!innings.striker_id || !innings.non_striker_id || !innings.bowler_id) throw new Error('Select both batters and a bowler before scoring.');

  const match = await getMatch(db, innings.match_id);
  const input = normalizeDelivery(rawInput);
  if ((input.wideRuns > 0 || input.noBallRuns > 0) && input.legalBall) throw new Error('Wide and no-ball deliveries cannot be legal balls.');
  if (input.wideRuns > 0 && input.noBallRuns > 0) throw new Error('A delivery cannot be both wide and no-ball.');
  if (input.byeRuns > 0 && input.legByeRuns > 0) throw new Error('Choose either byes or leg byes.');

  const state = beforeState(innings);
  const totalRuns = input.batRuns + input.wideRuns + input.noBallRuns + input.byeRuns + input.legByeRuns;
  const seqRow = await db.getFirstAsync<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM deliveries WHERE innings_id = ?', inningsId);
  const seq = seqRow?.seq ?? 1;
  const overNo = Math.floor(innings.legal_balls / 6) + 1;
  const ballInOver = (innings.legal_balls % 6) + (input.legalBall ? 1 : 0);

  await db.runAsync(`
    INSERT INTO deliveries(
      match_id, innings_id, seq, over_no, ball_in_over, striker_id, non_striker_id, bowler_id,
      bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs, total_runs, legal_ball,
      wicket, wicket_type, dismissed_player_id, credited_bowler, state_before_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    innings.match_id, inningsId, seq, overNo, ballInOver, innings.striker_id, innings.non_striker_id, innings.bowler_id,
    input.batRuns, input.wideRuns, input.noBallRuns, input.byeRuns, input.legByeRuns, totalRuns, input.legalBall ? 1 : 0,
    input.wicket ? 1 : 0, input.wicketType, input.dismissedPlayerId, input.creditedBowler ? 1 : 0,
    JSON.stringify(state), new Date().toISOString(),
  );

  let striker = innings.striker_id;
  let nonStriker = innings.non_striker_id;
  if (input.runningRunsForStrike % 2 === 1) [striker, nonStriker] = [nonStriker, striker];

  if (input.wicket && input.dismissedPlayerId) {
    if (striker === input.dismissedPlayerId) striker = null;
    if (nonStriker === input.dismissedPlayerId) nonStriker = null;
  }

  const runs = innings.runs + totalRuns;
  const wickets = innings.wickets + (input.wicket ? 1 : 0);
  const legalBalls = innings.legal_balls + (input.legalBall ? 1 : 0);
  const wides = innings.wides + input.wideRuns;
  const noBalls = innings.no_balls + input.noBallRuns;
  const byes = innings.byes + input.byeRuns;
  const legByes = innings.leg_byes + input.legByeRuns;

  const teamSizeRow = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM match_players WHERE match_id = ? AND team_id = ?', innings.match_id, innings.batting_team_id);
  const teamSize = teamSizeRow?.c ?? 2;
  const allOut = wickets >= teamSize - 1;
  const oversDone = legalBalls >= match.overs_limit * 6;
  const chaseDone = innings.innings_no === 2 && innings.target != null && runs >= innings.target;
  const inningsCompleted = allOut || oversDone || chaseDone;

  let lastBowler = innings.last_bowler_id;
  let bowler: number | null = innings.bowler_id;
  const overCompleted = input.legalBall && legalBalls % 6 === 0 && !inningsCompleted;
  if (overCompleted) {
    [striker, nonStriker] = [nonStriker, striker];
    lastBowler = innings.bowler_id;
    bowler = null;
  }

  await db.runAsync(`UPDATE innings SET
    runs=?, wickets=?, legal_balls=?, wides=?, no_balls=?, byes=?, leg_byes=?,
    striker_id=?, non_striker_id=?, bowler_id=?, last_bowler_id=?, completed=? WHERE id=?`,
    runs, wickets, legalBalls, wides, noBalls, byes, legByes,
    striker, nonStriker, bowler, lastBowler, inningsCompleted ? 1 : 0, inningsId,
  );

  if (inningsCompleted) {
    if (innings.innings_no === 1) {
      const secondBatting = innings.bowling_team_id;
      const secondBowling = innings.batting_team_id;
      await db.runAsync(
        `INSERT OR IGNORE INTO innings(match_id, innings_no, batting_team_id, bowling_team_id, target)
         VALUES (?, 2, ?, ?, ?)`,
        innings.match_id, secondBatting, secondBowling, runs + 1,
      );
      await db.runAsync('UPDATE matches SET current_innings = 2 WHERE id = ?', innings.match_id);
      return { inningsCompleted: true, matchCompleted: false, needsInningsSetup: true, needsBatter: false, needsBowler: false, message: `Target: ${runs + 1}` };
    }

    const first = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE match_id = ? AND innings_no = 1', innings.match_id);
    if (!first) throw new Error('First innings not found.');
    let resultText = 'Match tied';
    if (runs >= (innings.target ?? first.runs + 1)) {
      resultText = `${await teamName(db, innings.batting_team_id)} won by ${Math.max(teamSize - wickets, 1)} wicket${Math.max(teamSize - wickets, 1) === 1 ? '' : 's'}`;
    } else if (first.runs > runs) {
      resultText = `${await teamName(db, first.batting_team_id)} won by ${first.runs - runs} run${first.runs - runs === 1 ? '' : 's'}`;
    }
    await db.runAsync('UPDATE matches SET status = ?, result_text = ?, completed_at = ? WHERE id = ?', 'COMPLETE', resultText, new Date().toISOString(), innings.match_id);
    return { inningsCompleted: true, matchCompleted: true, needsInningsSetup: false, needsBatter: false, needsBowler: false, message: resultText };
  }

  innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId) as InningsRow;
  return {
    inningsCompleted: false,
    matchCompleted: false,
    needsInningsSetup: false,
    needsBatter: innings.striker_id == null || innings.non_striker_id == null,
    needsBowler: innings.bowler_id == null,
  };
}

export async function undoLastDelivery(db: SQLiteDatabase, inningsId: number) {
  const last = await db.getFirstAsync<{ id: number; state_before_json: string }>('SELECT id, state_before_json FROM deliveries WHERE innings_id = ? ORDER BY seq DESC LIMIT 1', inningsId);
  if (!last) throw new Error('There is no delivery to undo.');
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const state = JSON.parse(last.state_before_json) as StateSnapshot;
  await db.runAsync('DELETE FROM deliveries WHERE id = ?', last.id);
  await db.runAsync(`UPDATE innings SET runs=?, wickets=?, legal_balls=?, wides=?, no_balls=?, byes=?, leg_byes=?, striker_id=?, non_striker_id=?, bowler_id=?, last_bowler_id=?, completed=? WHERE id=?`,
    state.runs, state.wickets, state.legalBalls, state.wides, state.noBalls, state.byes, state.legByes,
    state.strikerId, state.nonStrikerId, state.bowlerId, state.lastBowlerId, state.completed, inningsId,
  );
}

async function teamName(db: SQLiteDatabase, teamId: number): Promise<string> {
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM teams WHERE id = ?', teamId);
  return row?.name ?? 'Team';
}

async function playerSnapshotName(db: SQLiteDatabase, matchId: number, playerId: number | null): Promise<string | null> {
  if (!playerId) return null;
  const row = await db.getFirstAsync<{ player_name: string }>('SELECT player_name FROM match_players WHERE match_id = ? AND player_id = ? LIMIT 1', matchId, playerId);
  return row?.player_name ?? null;
}

export async function getLiveMatch(db: SQLiteDatabase, matchId: number): Promise<LiveMatch> {
  const match = await getMatch(db, matchId);
  const innings = await getCurrentInnings(db, matchId);
  const currentOverNo = Math.floor(innings.legal_balls / 6) + 1;
  const currentOver = await db.getAllAsync<any>(
    'SELECT id, seq, legal_ball, bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs, total_runs, wicket, wicket_type FROM deliveries WHERE innings_id = ? AND over_no = ? ORDER BY seq',
    innings.id,
    currentOverNo,
  );
  const teamSizeRow = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM match_players WHERE match_id = ? AND team_id = ?',
    matchId,
    innings.batting_team_id,
  );

  const batterStats = async (playerId: number | null) => {
    if (!playerId) return { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const row = await db.getFirstAsync<{ runs: number; balls: number; fours: number; sixes: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN striker_id = ? THEN bat_runs ELSE 0 END), 0) AS runs,
        COALESCE(SUM(CASE WHEN striker_id = ? AND legal_ball = 1 THEN 1 ELSE 0 END), 0) AS balls,
        COALESCE(SUM(CASE WHEN striker_id = ? AND bat_runs = 4 THEN 1 ELSE 0 END), 0) AS fours,
        COALESCE(SUM(CASE WHEN striker_id = ? AND bat_runs = 6 THEN 1 ELSE 0 END), 0) AS sixes
      FROM deliveries
      WHERE innings_id = ?
    `, playerId, playerId, playerId, playerId, innings.id);
    return {
      runs: row?.runs ?? 0,
      balls: row?.balls ?? 0,
      fours: row?.fours ?? 0,
      sixes: row?.sixes ?? 0,
    };
  };

  const bowlerStats = async (playerId: number | null) => {
    if (!playerId) return { legalBalls: 0, runs: 0, wickets: 0, currentOverRuns: 0 };
    const row = await db.getFirstAsync<{ legalBalls: number; runs: number; wickets: number }>(`
      SELECT
        COALESCE(SUM(legal_ball), 0) AS legalBalls,
        COALESCE(SUM(bat_runs + wide_runs + no_ball_runs), 0) AS runs,
        COALESCE(SUM(credited_bowler), 0) AS wickets
      FROM deliveries
      WHERE innings_id = ? AND bowler_id = ?
    `, innings.id, playerId);
    const overRow = await db.getFirstAsync<{ runs: number }>(`
      SELECT COALESCE(SUM(bat_runs + wide_runs + no_ball_runs), 0) AS runs
      FROM deliveries
      WHERE innings_id = ? AND bowler_id = ? AND over_no = ?
    `, innings.id, playerId, currentOverNo);
    return {
      legalBalls: row?.legalBalls ?? 0,
      runs: row?.runs ?? 0,
      wickets: row?.wickets ?? 0,
      currentOverRuns: overRow?.runs ?? 0,
    };
  };

  const [strikerStats, nonStrikerStats, currentBowlerStats] = await Promise.all([
    batterStats(innings.striker_id),
    batterStats(innings.non_striker_id),
    bowlerStats(innings.bowler_id),
  ]);

  return {
    match,
    innings,
    battingTeamName: await teamName(db, innings.batting_team_id),
    bowlingTeamName: await teamName(db, innings.bowling_team_id),
    strikerName: await playerSnapshotName(db, matchId, innings.striker_id),
    nonStrikerName: await playerSnapshotName(db, matchId, innings.non_striker_id),
    bowlerName: await playerSnapshotName(db, matchId, innings.bowler_id),
    strikerStats,
    nonStrikerStats,
    bowlerStats: currentBowlerStats,
    teamSize: teamSizeRow?.c ?? 2,
    currentOver,
  };
}

export async function getMatchSummaries(db: SQLiteDatabase): Promise<MatchSummary[]> {
  return db.getAllAsync<MatchSummary>(`
    SELECT m.id, a.name AS teamAName, b.name AS teamBName, m.overs_limit AS oversLimit,
      m.status, m.result_text AS resultText, m.created_at AS createdAt
    FROM matches m JOIN teams a ON a.id=m.team_a_id JOIN teams b ON b.id=m.team_b_id
    ORDER BY m.id DESC
  `);
}

export async function getMatchDetail(db: SQLiteDatabase, matchId: number): Promise<MatchDetail> {
  const match = await getMatch(db, matchId);
  const teamA = await teamName(db, match.team_a_id);
  const teamB = await teamName(db, match.team_b_id);
  const inningsRows = await db.getAllAsync<InningsRow>('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_no', matchId);
  const scorecards = [];
  for (const inn of inningsRows) {
    const roster = await getMatchPlayers(db, matchId, inn.batting_team_id);
    const batters: BatterLine[] = [];
    for (const p of roster) {
      const stats = await db.getFirstAsync<{ runs: number; balls: number; fours: number; sixes: number }>(`
        SELECT COALESCE(SUM(CASE WHEN striker_id=? THEN bat_runs ELSE 0 END),0) AS runs,
          COALESCE(SUM(CASE WHEN striker_id=? AND legal_ball=1 THEN 1 ELSE 0 END),0) AS balls,
          COALESCE(SUM(CASE WHEN striker_id=? AND bat_runs=4 THEN 1 ELSE 0 END),0) AS fours,
          COALESCE(SUM(CASE WHEN striker_id=? AND bat_runs=6 THEN 1 ELSE 0 END),0) AS sixes
        FROM deliveries WHERE innings_id=?`, p.id, p.id, p.id, p.id, inn.id);
      const dismissal = await db.getFirstAsync<{ wicket_type: string; bowler_id: number | null }>('SELECT wicket_type, bowler_id FROM deliveries WHERE innings_id=? AND dismissed_player_id=? AND wicket=1 ORDER BY seq LIMIT 1', inn.id, p.id);
      let dismissalText = 'not out';
      if (dismissal) {
        if (dismissal.wicket_type === 'Run Out') dismissalText = 'run out';
        else {
          const bowlerName = dismissal.bowler_id ? await playerSnapshotName(db, matchId, dismissal.bowler_id) : null;
          dismissalText = dismissal.wicket_type === 'Caught' ? `c & b ${bowlerName ?? ''}`.trim() : `${dismissal.wicket_type.toLowerCase()} b ${bowlerName ?? ''}`.trim();
        }
      }
      batters.push({ playerId: p.id, name: p.name, runs: stats?.runs ?? 0, balls: stats?.balls ?? 0, fours: stats?.fours ?? 0, sixes: stats?.sixes ?? 0, dismissal: dismissalText });
    }

    const bowlersRaw = await db.getAllAsync<{ playerId: number; legalBalls: number; runs: number; wickets: number }>(`
      SELECT bowler_id AS playerId, SUM(legal_ball) AS legalBalls,
        SUM(bat_runs + wide_runs + no_ball_runs) AS runs,
        SUM(credited_bowler) AS wickets
      FROM deliveries WHERE innings_id=? GROUP BY bowler_id ORDER BY bowler_id`, inn.id);
    const bowlers: BowlerLine[] = [];
    for (const b of bowlersRaw) {
      const name = await playerSnapshotName(db, matchId, b.playerId);
      bowlers.push({ ...b, name: name ?? `Player ${b.playerId}` });
    }

    const deliveries = await db.getAllAsync<any>('SELECT id, seq, over_no, legal_ball, bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs, total_runs, wicket, wicket_type FROM deliveries WHERE innings_id=? ORDER BY seq', inn.id);
    const overMap = new Map<number, string[]>();
    for (const d of deliveries) {
      const list = overMap.get(d.over_no) ?? [];
      list.push(deliveryLabel(d));
      overMap.set(d.over_no, list);
    }
    scorecards.push({
      inningsId: inn.id, inningsNo: inn.innings_no, teamName: await teamName(db, inn.batting_team_id),
      runs: inn.runs, wickets: inn.wickets, legalBalls: inn.legal_balls, wides: inn.wides,
      noBalls: inn.no_balls, byes: inn.byes, legByes: inn.leg_byes, batters, bowlers,
      overs: [...overMap.entries()].map(([overNo, balls]) => ({ overNo, balls })),
    });
  }
  return { id: match.id, title: `${teamA} vs ${teamB}`, oversLimit: match.overs_limit, status: match.status, resultText: match.result_text, createdAt: match.created_at, innings: scorecards };
}

export async function getLeaderboards(db: SQLiteDatabase) {
  const scorerRows = await db.getAllAsync<{ playerId: number; name: string; value: number }>(`
    SELECT d.striker_id AS playerId, p.name, SUM(d.bat_runs) AS value
    FROM deliveries d JOIN players p ON p.id=d.striker_id
    GROUP BY d.striker_id, p.name HAVING value > 0 ORDER BY value DESC, p.name LIMIT 20
  `);
  const sixRows = await db.getAllAsync<{ playerId: number; name: string; value: number }>(`
    SELECT d.striker_id AS playerId, p.name, SUM(CASE WHEN d.bat_runs=6 THEN 1 ELSE 0 END) AS value
    FROM deliveries d JOIN players p ON p.id=d.striker_id
    GROUP BY d.striker_id, p.name HAVING value > 0 ORDER BY value DESC, p.name LIMIT 20
  `);
  const wicketRows = await db.getAllAsync<{ playerId: number; name: string; value: number }>(`
    SELECT d.bowler_id AS playerId, p.name, SUM(d.credited_bowler) AS value
    FROM deliveries d JOIN players p ON p.id=d.bowler_id
    GROUP BY d.bowler_id, p.name HAVING value > 0 ORDER BY value DESC, p.name LIMIT 20
  `);
  const economyRows = await db.getAllAsync<{ playerId: number; name: string; legalBalls: number; runs: number }>(`
    SELECT d.bowler_id AS playerId, p.name, SUM(d.legal_ball) AS legalBalls,
      SUM(d.bat_runs + d.wide_runs + d.no_ball_runs) AS runs
    FROM deliveries d JOIN players p ON p.id=d.bowler_id
    GROUP BY d.bowler_id, p.name HAVING legalBalls >= 6 ORDER BY (1.0*runs)/(legalBalls/6.0) ASC, p.name LIMIT 20
  `);
  const economyRowsMapped: LeaderboardRow[] = economyRows.map(r => ({ playerId: r.playerId, name: r.name, value: r.runs / (r.legalBalls / 6), secondary: `${r.runs} runs / ${Math.floor(r.legalBalls / 6)}.${r.legalBalls % 6} ov` }));
  return {
    topScorers: scorerRows as LeaderboardRow[],
    mostSixes: sixRows as LeaderboardRow[],
    mostWickets: wicketRows as LeaderboardRow[],
    bestEconomy: economyRowsMapped,
  };
}
