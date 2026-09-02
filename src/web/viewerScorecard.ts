import {
  BowlerScore,
  nullableNumber,
  numberValue,
  SnapshotRow,
  table,
  textValue,
  ViewerSnapshot,
} from './viewerData';

export type ViewerBatterScore = {
  playerId: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string;
};

export type ViewerOver = {
  overNo: number;
  balls: string[];
};

export type ViewerInningsScorecard = {
  batters: ViewerBatterScore[];
  bowlers: BowlerScore[];
  overs: ViewerOver[];
};

function matchPlayerName(snapshot: ViewerSnapshot, matchId: number, playerId: number | null): string | null {
  if (playerId == null) return null;
  const row = table(snapshot, 'match_players').find(item =>
    numberValue(item, 'match_id') === matchId && numberValue(item, 'player_id') === playerId,
  );
  return row ? textValue(row, 'player_name') || null : null;
}

function deliveryLabel(delivery: SnapshotRow): string {
  if (numberValue(delivery, 'wicket') === 1) {
    const totalRuns = numberValue(delivery, 'total_runs');
    return `W${totalRuns ? `+${totalRuns}` : ''}`;
  }
  const wides = numberValue(delivery, 'wide_runs');
  if (wides) return `${wides === 1 ? '' : wides}Wd`;
  const noBalls = numberValue(delivery, 'no_ball_runs');
  if (noBalls) {
    const extra = numberValue(delivery, 'total_runs') - noBalls;
    if (numberValue(delivery, 'dead_run') === 1) return 'Nb+1D';
    return extra ? `Nb+${extra}` : 'Nb';
  }
  const byes = numberValue(delivery, 'bye_runs');
  if (byes) return `${byes}B`;
  const legByes = numberValue(delivery, 'leg_bye_runs');
  if (legByes) return `${legByes}Lb`;
  if (numberValue(delivery, 'dead_run') === 1) return '1D';
  return String(numberValue(delivery, 'bat_runs'));
}

function dismissalText(
  snapshot: ViewerSnapshot,
  matchId: number,
  playerId: number,
  deliveries: SnapshotRow[],
  retiredIds: Set<number>,
): string {
  if (retiredIds.has(playerId)) return 'declared';

  const dismissal = deliveries.find(delivery =>
    numberValue(delivery, 'wicket') === 1 && nullableNumber(delivery, 'dismissed_player_id') === playerId,
  );
  if (!dismissal) return 'not out';

  const type = textValue(dismissal, 'wicket_type');
  const bowlerId = nullableNumber(dismissal, 'bowler_id');
  const fielderId = nullableNumber(dismissal, 'fielder_id');
  const bowler = matchPlayerName(snapshot, matchId, bowlerId);
  const fielder = matchPlayerName(snapshot, matchId, fielderId);

  switch (type) {
    case 'Caught':
      return fielderId != null && fielderId === bowlerId
        ? `c & b ${bowler ?? ''}`.trim()
        : `c ${fielder ?? 'fielder'} b ${bowler ?? ''}`.trim();
    case 'Run Out':
      return fielder ? `run out (${fielder})` : 'run out';
    case 'Stumped':
      return `st ${fielder ?? 'keeper'} b ${bowler ?? ''}`.trim();
    case 'Bowled':
      return `b ${bowler ?? ''}`.trim();
    default:
      return type ? type.toLowerCase() : 'out';
  }
}

export function viewerInningsScorecard(snapshot: ViewerSnapshot, inningsId: number): ViewerInningsScorecard {
  const innings = table(snapshot, 'innings').find(row => numberValue(row, 'id') === inningsId);
  if (!innings) return { batters: [], bowlers: [], overs: [] };

  const matchId = numberValue(innings, 'match_id');
  const battingTeamId = numberValue(innings, 'batting_team_id');
  const bowlingTeamId = numberValue(innings, 'bowling_team_id');
  const deliveries = table(snapshot, 'deliveries')
    .filter(row => numberValue(row, 'innings_id') === inningsId)
    .sort((a, b) => numberValue(a, 'seq') - numberValue(b, 'seq'));
  const retirements = table(snapshot, 'innings_retirements')
    .filter(row => numberValue(row, 'innings_id') === inningsId)
    .sort((a, b) => numberValue(a, 'id') - numberValue(b, 'id'));

  const battingRows = table(snapshot, 'match_players')
    .filter(row => numberValue(row, 'match_id') === matchId && numberValue(row, 'team_id') === battingTeamId);
  const bowlingRows = table(snapshot, 'match_players')
    .filter(row => numberValue(row, 'match_id') === matchId && numberValue(row, 'team_id') === bowlingTeamId);

  const batterOrder = new Map<number, number>();
  const bowlerOrder = new Map<number, number>();
  const participatedBatters = new Set<number>();
  let nextBatterOrder = 0;
  let nextBowlerOrder = 0;

  const markBatter = (playerId: number | null) => {
    if (playerId == null || playerId <= 0) return;
    participatedBatters.add(playerId);
    if (!batterOrder.has(playerId)) batterOrder.set(playerId, nextBatterOrder++);
  };
  const markBowler = (playerId: number | null) => {
    if (playerId == null || playerId <= 0 || bowlerOrder.has(playerId)) return;
    bowlerOrder.set(playerId, nextBowlerOrder++);
  };

  const events: Array<
    | { kind: 'delivery'; at: string; seq: number; row: SnapshotRow }
    | { kind: 'retirement'; at: string; seq: number; row: SnapshotRow }
  > = [
    ...deliveries.map(row => ({ kind: 'delivery' as const, at: textValue(row, 'created_at'), seq: numberValue(row, 'seq'), row })),
    ...retirements.map((row, index) => ({ kind: 'retirement' as const, at: textValue(row, 'created_at'), seq: index, row })),
  ];
  events.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? a.seq - b.seq : a.kind === 'retirement' ? -1 : 1));

  for (const event of events) {
    if (event.kind === 'retirement') {
      markBatter(nullableNumber(event.row, 'player_id'));
      continue;
    }
    markBatter(nullableNumber(event.row, 'striker_id'));
    markBatter(nullableNumber(event.row, 'non_striker_id'));
    markBatter(nullableNumber(event.row, 'dismissed_player_id'));
    markBowler(nullableNumber(event.row, 'bowler_id'));
  }

  const retiredIds = new Set(retirements.map(row => numberValue(row, 'player_id')));
  const rosterBattingIndex = new Map(battingRows.map((row, index) => [numberValue(row, 'player_id'), index]));
  const batters: ViewerBatterScore[] = battingRows.map(row => {
    const playerId = numberValue(row, 'player_id');
    const faced = deliveries.filter(delivery => numberValue(delivery, 'striker_id') === playerId);
    return {
      playerId,
      name: textValue(row, 'player_name'),
      runs: faced.reduce((sum, delivery) => sum + numberValue(delivery, 'bat_runs'), 0),
      balls: faced.reduce((sum, delivery) => sum + numberValue(delivery, 'legal_ball'), 0),
      fours: faced.filter(delivery => numberValue(delivery, 'bat_runs') === 4).length,
      sixes: faced.filter(delivery => numberValue(delivery, 'bat_runs') === 6).length,
      dismissal: dismissalText(snapshot, matchId, playerId, deliveries, retiredIds),
    };
  })
    .filter(row => participatedBatters.has(row.playerId))
    .sort((a, b) => {
      const aOrder = batterOrder.get(a.playerId);
      const bOrder = batterOrder.get(b.playerId);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return (rosterBattingIndex.get(a.playerId) ?? 0) - (rosterBattingIndex.get(b.playerId) ?? 0);
    });

  const rosterBowlingIndex = new Map(bowlingRows.map((row, index) => [numberValue(row, 'player_id'), index]));
  const bowlers: BowlerScore[] = bowlingRows.map(row => {
    const playerId = numberValue(row, 'player_id');
    const bowled = deliveries.filter(delivery => numberValue(delivery, 'bowler_id') === playerId);
    return {
      playerId,
      name: textValue(row, 'player_name'),
      legalBalls: bowled.reduce((sum, delivery) => sum + numberValue(delivery, 'legal_ball'), 0),
      runs: bowled.reduce((sum, delivery) => sum + numberValue(delivery, 'bat_runs') + numberValue(delivery, 'wide_runs') + numberValue(delivery, 'no_ball_runs'), 0),
      wickets: bowled.reduce((sum, delivery) => sum + numberValue(delivery, 'credited_bowler'), 0),
    };
  })
    .filter(row => bowlerOrder.has(row.playerId))
    .sort((a, b) => {
      const aOrder = bowlerOrder.get(a.playerId);
      const bOrder = bowlerOrder.get(b.playerId);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return (rosterBowlingIndex.get(a.playerId) ?? 0) - (rosterBowlingIndex.get(b.playerId) ?? 0);
    });

  const overMap = new Map<number, string[]>();
  for (const delivery of deliveries) {
    const overNo = numberValue(delivery, 'over_no');
    const balls = overMap.get(overNo) ?? [];
    balls.push(deliveryLabel(delivery));
    overMap.set(overNo, balls);
  }
  const overs = [...overMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([overNo, balls]) => ({ overNo, balls }));

  return { batters, bowlers, overs };
}
