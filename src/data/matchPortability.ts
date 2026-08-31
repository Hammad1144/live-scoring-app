import type { SQLiteDatabase } from 'expo-sqlite';
import { getMatch } from './database';
import { InningsRow, PortableMatchPackage } from '../types';

async function teamName(db: SQLiteDatabase, teamId: number) {
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM teams WHERE id = ?', teamId);
  return row?.name ?? 'Team';
}

export async function endMatch(db: SQLiteDatabase, matchId: number) {
  const match = await getMatch(db, matchId);
  if (match.status === 'COMPLETE') throw new Error('This match is already complete.');
  await db.runAsync('UPDATE innings SET completed = 1 WHERE match_id = ? AND innings_no = ?', matchId, match.current_innings);
  await db.runAsync(
    'UPDATE matches SET status = ?, result_text = ?, completed_at = ? WHERE id = ?',
    'COMPLETE', 'Match ended manually', new Date().toISOString(), matchId,
  );
}

export async function deleteMatch(db: SQLiteDatabase, matchId: number) {
  const match = await getMatch(db, matchId);
  const teamIds = [match.team_a_id, match.team_b_id];
  // Matches own their innings, deliveries, match-player roster and declaration rows through
  // cascading foreign keys. Deleting the match is therefore safe for both completed and
  // in-progress matches and does not alter permanent Team Bank or Player Bank records.
  await db.runAsync('DELETE FROM matches WHERE id = ?', matchId);
  for (const teamId of teamIds) {
    const archived = await db.getFirstAsync<{ archived: number }>('SELECT archived FROM teams WHERE id = ?', teamId);
    if (archived?.archived) {
      const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM matches WHERE team_a_id = ? OR team_b_id = ?', teamId, teamId);
      if ((used?.c ?? 0) === 0) await db.runAsync('DELETE FROM teams WHERE id = ?', teamId);
    }
  }
}

export async function exportMatchPackage(db: SQLiteDatabase, matchId: number): Promise<PortableMatchPackage> {
  const match = await getMatch(db, matchId);
  if (match.status !== 'COMPLETE') throw new Error('End or complete the match before exporting its summary.');
  const [teamAName, teamBName] = await Promise.all([teamName(db, match.team_a_id), teamName(db, match.team_b_id)]);
  const matchPlayers = await db.getAllAsync<any>('SELECT * FROM match_players WHERE match_id = ? ORDER BY team_id, batting_order', matchId);
  const innings = await db.getAllAsync<InningsRow>('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_no', matchId);
  const deliveries = await db.getAllAsync<any>('SELECT * FROM deliveries WHERE match_id = ? ORDER BY innings_id, seq', matchId);
  const sourceKey = match.import_key ?? `local:${match.id}:${match.created_at}:${teamAName}:${teamBName}`;
  if (!match.import_key) await db.runAsync('UPDATE matches SET import_key = ? WHERE id = ?', sourceKey, matchId);

  return {
    kind: 'local-cricket-scorer-match', schemaVersion: 1, sourceKey, exportedAt: new Date().toISOString(),
    match: {
      sourceMatchId: match.id, teamAId: match.team_a_id, teamBId: match.team_b_id, teamAName, teamBName,
      oversLimit: match.overs_limit, battingFirstTeamId: match.batting_first_team_id, status: 'COMPLETE',
      currentInnings: match.current_innings, resultText: match.result_text, createdAt: match.created_at, completedAt: match.completed_at,
    },
    matchPlayers: matchPlayers.map(r => ({
      teamId: r.team_id, playerId: r.player_id, playerName: r.player_name, battingOrder: r.batting_order,
      isCaptain: r.is_captain ?? 0, isViceCaptain: r.is_vice_captain ?? 0,
    })),
    innings: innings.map(i => ({
      sourceInningsId: i.id, inningsNo: i.innings_no, battingTeamId: i.batting_team_id, bowlingTeamId: i.bowling_team_id,
      runs: i.runs, wickets: i.wickets, legalBalls: i.legal_balls, wides: i.wides, noBalls: i.no_balls,
      byes: i.byes, legByes: i.leg_byes, strikerId: i.striker_id, nonStrikerId: i.non_striker_id,
      bowlerId: i.bowler_id, lastBowlerId: i.last_bowler_id, completed: i.completed, target: i.target,
    })),
    deliveries: deliveries.map(d => ({
      sourceInningsId: d.innings_id, seq: d.seq, overNo: d.over_no, ballInOver: d.ball_in_over,
      strikerId: d.striker_id, nonStrikerId: d.non_striker_id, bowlerId: d.bowler_id,
      batRuns: d.bat_runs, wideRuns: d.wide_runs, noBallRuns: d.no_ball_runs, byeRuns: d.bye_runs,
      legByeRuns: d.leg_bye_runs, totalRuns: d.total_runs, legalBall: d.legal_ball, wicket: d.wicket,
      wicketType: d.wicket_type, dismissedPlayerId: d.dismissed_player_id, creditedBowler: d.credited_bowler,
      stateBeforeJson: d.state_before_json, createdAt: d.created_at,
    })),
  };
}

function validatePortableMatch(payload: PortableMatchPackage) {
  if (!payload || payload.kind !== 'local-cricket-scorer-match' || payload.schemaVersion !== 1) throw new Error('Unsupported match export format.');
  if (!payload.sourceKey || !payload.match || payload.match.status !== 'COMPLETE') throw new Error('Only completed Cricket Scorer match summaries can be imported.');
  if (!Number.isInteger(payload.match.oversLimit) || payload.match.oversLimit < 1 || payload.match.oversLimit > 10) throw new Error('Imported match has an invalid over limit.');
  if (!payload.match.teamAName?.trim() || !payload.match.teamBName?.trim()) throw new Error('Imported match is missing team names.');
  if (!Array.isArray(payload.matchPlayers) || !Array.isArray(payload.innings) || !Array.isArray(payload.deliveries)) throw new Error('Imported match data is incomplete.');
  const teamIds = new Set([payload.match.teamAId, payload.match.teamBId]);
  if (!teamIds.has(payload.match.battingFirstTeamId)) throw new Error('Imported batting-first team is invalid.');
  if (payload.matchPlayers.some(p => !teamIds.has(p.teamId) || !p.playerName?.trim())) throw new Error('Imported player snapshot is invalid.');
  if (payload.innings.some(i => !teamIds.has(i.battingTeamId) || !teamIds.has(i.bowlingTeamId))) throw new Error('Imported innings team mapping is invalid.');
}

async function resolveArchiveTeam(db: SQLiteDatabase, displayName: string): Promise<{ id: number; created: boolean }> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM teams WHERE name = ? LIMIT 1', displayName);
  if (existing) return { id: existing.id, created: false };
  const result = await db.runAsync('INSERT INTO teams(name, archived) VALUES (?, 1)', displayName);
  return { id: Number(result.lastInsertRowId), created: true };
}

export async function importMatchPackage(db: SQLiteDatabase, payload: PortableMatchPackage): Promise<{ matchId: number; title: string }> {
  validatePortableMatch(payload);
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM matches WHERE import_key = ?', payload.sourceKey);
  if (existing) throw new Error('This match summary has already been imported on this device.');

  let teamA: { id: number; created: boolean } | null = null;
  let teamB: { id: number; created: boolean } | null = null;
  let newMatchId: number | null = null;
  try {
    teamA = await resolveArchiveTeam(db, payload.match.teamAName);
    teamB = await resolveArchiveTeam(db, payload.match.teamBName);
    const teamMap = new Map<number, number>([[payload.match.teamAId, teamA.id], [payload.match.teamBId, teamB.id]]);
    const mappedBattingFirst = teamMap.get(payload.match.battingFirstTeamId);
    if (!mappedBattingFirst) throw new Error('Unable to map imported teams.');

    const result = await db.runAsync(`
      INSERT INTO matches(team_a_id, team_b_id, overs_limit, batting_first_team_id, status, current_innings,
        result_text, created_at, completed_at, import_key)
      VALUES (?, ?, ?, ?, 'COMPLETE', ?, ?, ?, ?, ?)
    `, teamA.id, teamB.id, payload.match.oversLimit, mappedBattingFirst, payload.match.currentInnings,
      payload.match.resultText, payload.match.createdAt, payload.match.completedAt, payload.sourceKey);
    newMatchId = Number(result.lastInsertRowId);

    for (const p of payload.matchPlayers) {
      const mappedTeam = teamMap.get(p.teamId);
      if (!mappedTeam) throw new Error('Unable to map an imported player team.');
      await db.runAsync(`
        INSERT INTO match_players(match_id, team_id, player_id, player_name, batting_order, is_captain, is_vice_captain)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, mappedTeam, p.playerId, p.playerName, p.battingOrder, p.isCaptain ? 1 : 0, p.isViceCaptain ? 1 : 0);
    }

    const inningsMap = new Map<number, number>();
    for (const i of payload.innings) {
      const battingTeam = teamMap.get(i.battingTeamId);
      const bowlingTeam = teamMap.get(i.bowlingTeamId);
      if (!battingTeam || !bowlingTeam) throw new Error('Unable to map imported innings teams.');
      const inningsResult = await db.runAsync(`
        INSERT INTO innings(match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls,
          wides, no_balls, byes, leg_byes, striker_id, non_striker_id, bowler_id, last_bowler_id, completed, target)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, i.inningsNo, battingTeam, bowlingTeam, i.runs, i.wickets, i.legalBalls,
        i.wides, i.noBalls, i.byes, i.legByes, i.strikerId, i.nonStrikerId, i.bowlerId, i.lastBowlerId, i.completed, i.target);
      inningsMap.set(i.sourceInningsId, Number(inningsResult.lastInsertRowId));
    }

    for (const d of payload.deliveries) {
      const mappedInningsId = inningsMap.get(d.sourceInningsId);
      if (!mappedInningsId) throw new Error('Unable to map imported delivery innings.');
      await db.runAsync(`
        INSERT INTO deliveries(match_id, innings_id, seq, over_no, ball_in_over, striker_id, non_striker_id, bowler_id,
          bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs, total_runs, legal_ball, wicket, wicket_type,
          dismissed_player_id, credited_bowler, state_before_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, mappedInningsId, d.seq, d.overNo, d.ballInOver, d.strikerId, d.nonStrikerId, d.bowlerId,
        d.batRuns, d.wideRuns, d.noBallRuns, d.byeRuns, d.legByeRuns, d.totalRuns, d.legalBall, d.wicket,
        d.wicketType, d.dismissedPlayerId, d.creditedBowler, d.stateBeforeJson, d.createdAt);
    }

    return { matchId: newMatchId, title: `${payload.match.teamAName} vs ${payload.match.teamBName}` };
  } catch (error) {
    if (newMatchId != null) await db.runAsync('DELETE FROM matches WHERE id = ?', newMatchId).catch(() => undefined);
    for (const team of [teamA, teamB]) {
      if (team?.created) await db.runAsync('DELETE FROM teams WHERE id = ?', team.id).catch(() => undefined);
    }
    throw error;
  }
}
