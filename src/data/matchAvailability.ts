import type { SQLiteDatabase } from 'expo-sqlite';
import type { MatchPlayerSwitch } from './v16Core';

type SquadPlayerRow = {
  playerId: number;
  name: string;
  battingOrder: number;
};

const MAX_MATCH_PLAYERS = 11;

function unique(ids: number[]) {
  return [...new Set(ids.map(Number))];
}

async function loadTeamSquad(db: SQLiteDatabase, teamId: number): Promise<SquadPlayerRow[]> {
  return db.getAllAsync<SquadPlayerRow>(`
    SELECT tp.player_id AS playerId, p.name, tp.batting_order AS battingOrder
    FROM team_players tp
    JOIN players p ON p.id=tp.player_id
    WHERE tp.team_id=?
    ORDER BY tp.batting_order, tp.player_id
  `, teamId);
}

function selectedRows(squad: SquadPlayerRow[], selectedIds: number[], teamLabel: string) {
  const ids = unique(selectedIds);
  if (ids.length < 2) throw new Error(`${teamLabel} needs at least 2 available players.`);
  if (ids.length > MAX_MATCH_PLAYERS) throw new Error(`${teamLabel} can have at most 11 players in a match.`);
  const squadIds = new Set(squad.map(player => player.playerId));
  const invalid = ids.filter(id => !squadIds.has(id));
  if (invalid.length) throw new Error(`${teamLabel} availability contains a player who is no longer in the team.`);
  const selected = squad.filter(player => ids.includes(player.playerId));
  if (selected.length !== ids.length) throw new Error(`${teamLabel} availability could not be resolved.`);
  return selected;
}

export async function createMatchWithAvailability(
  db: SQLiteDatabase,
  teamAId: number,
  teamBId: number,
  oversLimit: number,
  battingFirstTeamId: number,
  seasonId: number | null,
  seasonRoundId: number | null,
  teamAPlayerIds: number[],
  teamBPlayerIds: number[],
  switches: MatchPlayerSwitch[] = [],
): Promise<number> {
  if (teamAId === teamBId) throw new Error('Select two different teams.');
  if (!Number.isInteger(oversLimit) || oversLimit < 1 || oversLimit > 10) throw new Error('Match overs must be between 1 and 10.');
  if (![teamAId, teamBId].includes(battingFirstTeamId)) throw new Error('Select which team bats first.');
  if (seasonId == null && seasonRoundId != null) throw new Error('A round / week requires a season.');
  if (seasonId != null && seasonRoundId == null) throw new Error('Select a round / week for this season match.');

  if (seasonId != null) {
    const season = await db.getFirstAsync<{ id: number }>('SELECT id FROM seasons WHERE id=?', seasonId);
    if (!season) throw new Error('Selected season no longer exists.');
    const round = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM season_rounds WHERE id=? AND season_id=?',
      seasonRoundId,
      seasonId,
    );
    if (!round) throw new Error('Selected round / week does not belong to the selected season.');
  }

  const [teamARoster, teamBRoster] = await Promise.all([
    loadTeamSquad(db, teamAId),
    loadTeamSquad(db, teamBId),
  ]);
  const selectedA = selectedRows(teamARoster, teamAPlayerIds, 'Team A');
  const selectedB = selectedRows(teamBRoster, teamBPlayerIds, 'Team B');

  const initialAssignments = new Map<number, number>();
  for (const player of selectedA) initialAssignments.set(player.playerId, teamAId);
  for (const player of selectedB) {
    if (initialAssignments.has(player.playerId)) {
      throw new Error(`${player.name} is selected for both teams. Keep the player available on only one side and use Shuffle if needed.`);
    }
    initialAssignments.set(player.playerId, teamBId);
  }

  const switchByPlayer = new Map<number, MatchPlayerSwitch>();
  for (const move of switches) {
    if (move.fromTeamId === move.toTeamId) continue;
    if (![teamAId, teamBId].includes(move.fromTeamId) || ![teamAId, teamBId].includes(move.toTeamId)) {
      throw new Error('A match-only shuffle references an invalid team.');
    }
    if (initialAssignments.get(move.playerId) !== move.fromTeamId) {
      throw new Error('A shuffled player is not selected as available for the source team.');
    }
    switchByPlayer.set(move.playerId, move);
  }

  const staysA = selectedA.filter(player => switchByPlayer.get(player.playerId)?.toTeamId !== teamBId);
  const staysB = selectedB.filter(player => switchByPlayer.get(player.playerId)?.toTeamId !== teamAId);
  const incomingA = selectedB.filter(player => switchByPlayer.get(player.playerId)?.toTeamId === teamAId);
  const incomingB = selectedA.filter(player => switchByPlayer.get(player.playerId)?.toTeamId === teamBId);
  const finalA = [...staysA, ...incomingA];
  const finalB = [...staysB, ...incomingB];

  if (finalA.length < 2 || finalB.length < 2) throw new Error('Each team needs at least 2 players after the match-only shuffle.');
  if (finalA.length > MAX_MATCH_PLAYERS || finalB.length > MAX_MATCH_PLAYERS) throw new Error('Each team can have at most 11 players after the match-only shuffle.');
  const finalIds = new Set<number>();
  for (const player of [...finalA, ...finalB]) {
    if (finalIds.has(player.playerId)) throw new Error(`${player.name} cannot play for both teams in the same match.`);
    finalIds.add(player.playerId);
  }

  let matchId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO matches(
        team_a_id, team_b_id, overs_limit, batting_first_team_id, status, current_innings,
        created_at, season_id, season_round_id
      ) VALUES (?, ?, ?, ?, 'IN_PROGRESS', 1, ?, ?, ?)`,
      teamAId,
      teamBId,
      oversLimit,
      battingFirstTeamId,
      new Date().toISOString(),
      seasonId,
      seasonRoundId,
    );
    matchId = Number(result.lastInsertRowId);

    // match_players is the authoritative match-day XI. Permanent Team Bank membership stays in team_players.
    const insertRoster = async (teamId: number, players: SquadPlayerRow[]) => {
      for (let index = 0; index < players.length; index++) {
        const player = players[index]!;
        await db.runAsync(
          `INSERT INTO match_players(
            match_id, team_id, player_id, player_name, batting_order, is_captain, is_vice_captain
          ) VALUES (?, ?, ?, ?, ?, 0, 0)`,
          matchId,
          teamId,
          player.playerId,
          player.name,
          index,
        );
      }
    };

    await insertRoster(teamAId, finalA);
    await insertRoster(teamBId, finalB);

    const bowlingTeamId = battingFirstTeamId === teamAId ? teamBId : teamAId;
    await db.runAsync(
      'INSERT INTO innings(match_id, innings_no, batting_team_id, bowling_team_id) VALUES (?, 1, ?, ?)',
      matchId,
      battingFirstTeamId,
      bowlingTeamId,
    );
  });

  return matchId;
}
