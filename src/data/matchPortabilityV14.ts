import type { SQLiteDatabase } from 'expo-sqlite';
import { exportMatchPackageV13 } from './matchPortabilityV13';
import { PortableMatchPackage } from '../types';

export async function exportMatchPackageV14(db: SQLiteDatabase, matchId: number): Promise<PortableMatchPackage> {
  const payload = await exportMatchPackageV13(db, matchId);
  const season = await db.getFirstAsync<{ name: string; start_date: string | null; end_date: string | null }>(`
    SELECT s.name, s.start_date, s.end_date
    FROM matches m JOIN seasons s ON s.id=m.season_id
    WHERE m.id=?
  `, matchId);
  payload.season = season ? { name: season.name, startDate: season.start_date, endDate: season.end_date } : null;
  return payload;
}

function validatePayload(payload: PortableMatchPackage) {
  if (!payload || payload.kind !== 'local-cricket-scorer-match' || payload.schemaVersion !== 1) throw new Error('Unsupported match export format.');
  if (!payload.sourceKey || !payload.match || payload.match.status !== 'COMPLETE') throw new Error('Only completed Cricket Scorer match summaries can be imported.');
  if (!Number.isInteger(payload.match.oversLimit) || payload.match.oversLimit < 1 || payload.match.oversLimit > 10) throw new Error('Imported match has an invalid over limit.');
  if (!payload.match.teamAName?.trim() || !payload.match.teamBName?.trim()) throw new Error('Imported match is missing team names.');
  if (!Array.isArray(payload.matchPlayers) || !Array.isArray(payload.innings) || !Array.isArray(payload.deliveries)) throw new Error('Imported match data is incomplete.');
}

function mapped(map: Map<number, number>, id: number | null | undefined) {
  if (id == null) return null;
  const value = map.get(id);
  if (value == null) throw new Error(`Unable to map imported player ${id}.`);
  return value;
}

function mapStateJson(value: string, playerMap: Map<number, number>) {
  try {
    const state = JSON.parse(value || '{}');
    for (const key of ['strikerId', 'nonStrikerId', 'bowlerId', 'lastBowlerId']) {
      if (typeof state[key] === 'number') state[key] = mapped(playerMap, state[key]);
    }
    return JSON.stringify(state);
  } catch {
    return '{}';
  }
}

export async function importMatchPackageV14(db: SQLiteDatabase, payload: PortableMatchPackage): Promise<{ matchId: number; title: string }> {
  validatePayload(payload);
  const duplicate = await db.getFirstAsync<{ id: number }>('SELECT id FROM matches WHERE import_key=?', payload.sourceKey);
  if (duplicate) throw new Error('This match summary has already been imported on this device.');

  const uniqueNames = [...new Set(payload.matchPlayers.map(p => p.playerName.trim()).filter(Boolean))];
  if (uniqueNames.length !== payload.matchPlayers.map(p => p.playerName.trim()).filter(Boolean).length &&
      new Set(payload.matchPlayers.map(p => `${p.playerId}:${p.playerName}`)).size !== payload.matchPlayers.length) {
    // Duplicate appearances across different teams are allowed only when their source player identity is consistent.
  }
  const existingPlayers = new Map<string, number>();
  for (const name of uniqueNames) {
    const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM players WHERE name=? COLLATE BINARY LIMIT 1', name);
    if (row) existingPlayers.set(name, row.id);
  }
  const missingNames = uniqueNames.filter(name => !existingPlayers.has(name));
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM players');
  if ((count?.c ?? 0) + missingNames.length > 30) {
    throw new Error(`Import needs ${missingNames.length} new player${missingNames.length === 1 ? '' : 's'}, which would exceed the 30-player bank limit.`);
  }

  const createdPlayerIds: number[] = [];
  const createdTeamIds: number[] = [];
  const restoredArchivedTeamIds: number[] = [];
  let createdSeasonId: number | null = null;
  let newMatchId: number | null = null;

  try {
    for (const name of missingNames) {
      const inserted = await db.runAsync('INSERT INTO players(name) VALUES (?)', name);
      const id = Number(inserted.lastInsertRowId);
      existingPlayers.set(name, id);
      createdPlayerIds.push(id);
    }

    const playerMap = new Map<number, number>();
    const sourceNames = new Map<number, string>();
    for (const p of payload.matchPlayers) {
      const prior = sourceNames.get(p.playerId);
      if (prior && prior !== p.playerName) throw new Error('Imported player identity is inconsistent.');
      sourceNames.set(p.playerId, p.playerName);
      const localId = existingPlayers.get(p.playerName);
      if (!localId) throw new Error(`Unable to create imported player ${p.playerName}.`);
      playerMap.set(p.playerId, localId);
    }

    let seasonId: number | null = null;
    if (payload.season?.name?.trim()) {
      const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM seasons WHERE name=? COLLATE BINARY LIMIT 1', payload.season.name);
      if (existing) seasonId = existing.id;
      else {
        const inserted = await db.runAsync(
          'INSERT INTO seasons(name, start_date, end_date, created_at) VALUES (?, ?, ?, ?)',
          payload.season.name, payload.season.startDate ?? null, payload.season.endDate ?? null, new Date().toISOString(),
        );
        seasonId = Number(inserted.lastInsertRowId);
        createdSeasonId = seasonId;
      }
    }

    const resolveTeam = async (sourceTeamId: number, name: string) => {
      const players = payload.matchPlayers.filter(p => p.teamId === sourceTeamId).sort((a, b) => a.battingOrder - b.battingOrder);
      const captain = players.find(p => p.isCaptain)?.playerId ?? null;
      const viceCaptain = players.find(p => p.isViceCaptain)?.playerId ?? null;
      const existing = await db.getFirstAsync<{ id: number; archived: number }>('SELECT id, COALESCE(archived,0) AS archived FROM teams WHERE name=? COLLATE BINARY LIMIT 1', name);
      if (existing) {
        if (existing.archived) restoredArchivedTeamIds.push(existing.id);
        return { id: existing.id, created: false, players, captain, viceCaptain };
      }
      const inserted = await db.runAsync(
        'INSERT INTO teams(name, captain_player_id, vice_captain_player_id, archived) VALUES (?, ?, ?, 0)',
        name, mapped(playerMap, captain), mapped(playerMap, viceCaptain),
      );
      const id = Number(inserted.lastInsertRowId);
      createdTeamIds.push(id);
      return { id, created: true, players, captain, viceCaptain };
    };

    const teamA = await resolveTeam(payload.match.teamAId, payload.match.teamAName);
    const teamB = await resolveTeam(payload.match.teamBId, payload.match.teamBName);
    if (teamA.id === teamB.id) throw new Error('Imported teams resolve to the same local team name.');
    const teamMap = new Map<number, number>([[payload.match.teamAId, teamA.id], [payload.match.teamBId, teamB.id]]);

    for (const team of [teamA, teamB]) {
      const existingRoster = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM team_players WHERE team_id=?', team.id);
      if (team.created || (existingRoster?.c ?? 0) === 0) {
        if (!team.created) await db.runAsync('DELETE FROM team_players WHERE team_id=?', team.id);
        for (const p of team.players) {
          await db.runAsync(
            'INSERT OR IGNORE INTO team_players(team_id, player_id, batting_order) VALUES (?, ?, ?)',
            team.id, mapped(playerMap, p.playerId), p.battingOrder,
          );
        }
        await db.runAsync(
          'UPDATE teams SET captain_player_id=?, vice_captain_player_id=? WHERE id=?',
          mapped(playerMap, team.captain), mapped(playerMap, team.viceCaptain), team.id,
        );
      }
    }

    const battingFirst = teamMap.get(payload.match.battingFirstTeamId);
    if (!battingFirst) throw new Error('Unable to map imported batting-first team.');
    const matchResult = await db.runAsync(`
      INSERT INTO matches(team_a_id, team_b_id, overs_limit, batting_first_team_id, status, current_innings,
        result_text, created_at, completed_at, import_key, season_id)
      VALUES (?, ?, ?, ?, 'COMPLETE', ?, ?, ?, ?, ?, ?)
    `, teamA.id, teamB.id, payload.match.oversLimit, battingFirst, payload.match.currentInnings,
      payload.match.resultText, payload.match.createdAt, payload.match.completedAt, payload.sourceKey, seasonId);
    newMatchId = Number(matchResult.lastInsertRowId);

    for (const p of payload.matchPlayers) {
      const localTeam = teamMap.get(p.teamId);
      if (!localTeam) throw new Error('Unable to map imported player team.');
      await db.runAsync(`
        INSERT INTO match_players(match_id, team_id, player_id, player_name, batting_order, is_captain, is_vice_captain)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, localTeam, mapped(playerMap, p.playerId), p.playerName, p.battingOrder, p.isCaptain ? 1 : 0, p.isViceCaptain ? 1 : 0);
      await db.runAsync(
        'UPDATE match_players SET is_captain=?, is_vice_captain=? WHERE match_id=? AND team_id=? AND player_id=?',
        p.isCaptain ? 1 : 0, p.isViceCaptain ? 1 : 0, newMatchId, localTeam, mapped(playerMap, p.playerId),
      );
    }

    const inningsMap = new Map<number, number>();
    for (const i of payload.innings) {
      const battingTeam = teamMap.get(i.battingTeamId);
      const bowlingTeam = teamMap.get(i.bowlingTeamId);
      if (!battingTeam || !bowlingTeam) throw new Error('Unable to map imported innings teams.');
      const inserted = await db.runAsync(`
        INSERT INTO innings(match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, wides,
          no_balls, byes, leg_byes, striker_id, non_striker_id, bowler_id, last_bowler_id, completed, target)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, i.inningsNo, battingTeam, bowlingTeam, i.runs, i.wickets, i.legalBalls, i.wides,
        i.noBalls, i.byes, i.legByes, mapped(playerMap, i.strikerId), mapped(playerMap, i.nonStrikerId),
        mapped(playerMap, i.bowlerId), mapped(playerMap, i.lastBowlerId), i.completed, i.target);
      inningsMap.set(i.sourceInningsId, Number(inserted.lastInsertRowId));
    }

    for (const d of payload.deliveries) {
      const inningsId = inningsMap.get(d.sourceInningsId);
      if (!inningsId) throw new Error('Unable to map imported delivery innings.');
      await db.runAsync(`
        INSERT INTO deliveries(match_id, innings_id, seq, over_no, ball_in_over, striker_id, non_striker_id, bowler_id,
          bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs, total_runs, legal_ball, wicket,
          wicket_type, dismissed_player_id, credited_bowler, state_before_json, created_at, dead_run, fielder_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, newMatchId, inningsId, d.seq, d.overNo, d.ballInOver, mapped(playerMap, d.strikerId), mapped(playerMap, d.nonStrikerId),
        mapped(playerMap, d.bowlerId), d.batRuns, d.wideRuns, d.noBallRuns, d.byeRuns, d.legByeRuns, d.totalRuns,
        d.legalBall, d.wicket, d.wicketType, mapped(playerMap, d.dismissedPlayerId), d.creditedBowler,
        mapStateJson(d.stateBeforeJson, playerMap), d.createdAt, d.deadRun ? 1 : 0, mapped(playerMap, d.fielderId));
    }

    for (const id of restoredArchivedTeamIds) await db.runAsync('UPDATE teams SET archived=0 WHERE id=?', id);
    return { matchId: newMatchId, title: `${payload.match.teamAName} vs ${payload.match.teamBName}` };
  } catch (error) {
    if (newMatchId) await db.runAsync('DELETE FROM matches WHERE id=?', newMatchId).catch(() => undefined);
    for (const id of createdTeamIds.reverse()) await db.runAsync('DELETE FROM teams WHERE id=?', id).catch(() => undefined);
    for (const id of createdPlayerIds.reverse()) await db.runAsync('DELETE FROM players WHERE id=?', id).catch(() => undefined);
    if (createdSeasonId) await db.runAsync('DELETE FROM seasons WHERE id=?', createdSeasonId).catch(() => undefined);
    throw error;
  }
}
