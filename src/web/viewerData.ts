export type SnapshotRow = Record<string, unknown>;

export type ViewerSnapshot = {
  kind: 'cricket-zone-app-snapshot';
  schemaVersion: number;
  createdAt: string;
  tables: Record<string, SnapshotRow[]>;
  counts?: Record<string, number>;
};

export type LeaderboardKind = 'runs' | 'sixes' | 'wickets' | 'catches' | 'runOuts' | 'economy';

export type LeaderboardEntry = {
  playerId: number;
  name: string;
  value: number;
  matches: number;
  detail?: string;
};

export type SeasonImpactEntry = {
  playerId: number;
  name: string;
  matches: number;
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  totalPoints: number;
};

export type PlayerStats = {
  matches: number;
  batting: {
    innings: number;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    highest: number;
    dismissals: number;
    average: number;
    strikeRate: number;
  };
  bowling: {
    legalBalls: number;
    runs: number;
    wickets: number;
    dotBalls: number;
    economy: number;
    bestWickets: number;
    bestRuns: number;
  };
  fielding: {
    catches: number;
    runOuts: number;
    stumpings: number;
  };
};

export type BatterScore = {
  playerId: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
};

export type BowlerScore = {
  playerId: number;
  name: string;
  legalBalls: number;
  runs: number;
  wickets: number;
};

export function table(snapshot: ViewerSnapshot, name: string): SnapshotRow[] {
  return Array.isArray(snapshot.tables?.[name]) ? snapshot.tables[name]! : [];
}

export function numberValue(row: SnapshotRow | undefined | null, key: string): number {
  if (!row) return 0;
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function nullableNumber(row: SnapshotRow | undefined | null, key: string): number | null {
  if (!row || row[key] == null || row[key] === '') return null;
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

export function textValue(row: SnapshotRow | undefined | null, key: string): string {
  if (!row || row[key] == null) return '';
  return String(row[key]);
}

export function formatOvers(legalBalls: number): string {
  const balls = Math.max(0, Math.floor(legalBalls));
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function formatDate(value: unknown): string {
  if (!value) return '—';
  const text = String(value);
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getTeamName(snapshot: ViewerSnapshot, teamId: number): string {
  return textValue(table(snapshot, 'teams').find(row => numberValue(row, 'id') === teamId), 'name') || `Team ${teamId}`;
}

export function getSeasonName(snapshot: ViewerSnapshot, seasonId: number | null): string {
  if (seasonId == null) return 'Unassigned';
  return textValue(table(snapshot, 'seasons').find(row => numberValue(row, 'id') === seasonId), 'name') || `Season ${seasonId}`;
}

export function getPlayerName(snapshot: ViewerSnapshot, playerId: number): string {
  const global = table(snapshot, 'players').find(row => numberValue(row, 'id') === playerId);
  if (global) return textValue(global, 'name') || `Player ${playerId}`;
  const matchPlayer = table(snapshot, 'match_players').find(row => numberValue(row, 'player_id') === playerId);
  return textValue(matchPlayer, 'player_name') || `Player ${playerId}`;
}

export function matchTitle(snapshot: ViewerSnapshot, match: SnapshotRow): string {
  return `${getTeamName(snapshot, numberValue(match, 'team_a_id'))} vs ${getTeamName(snapshot, numberValue(match, 'team_b_id'))}`;
}

export function inningsScore(innings: SnapshotRow): string {
  return `${numberValue(innings, 'runs')}/${numberValue(innings, 'wickets')} (${formatOvers(numberValue(innings, 'legal_balls'))})`;
}

export function getMatchInnings(snapshot: ViewerSnapshot, matchId: number): SnapshotRow[] {
  return table(snapshot, 'innings')
    .filter(row => numberValue(row, 'match_id') === matchId)
    .sort((a, b) => numberValue(a, 'innings_no') - numberValue(b, 'innings_no'));
}

export function scopedMatchIds(snapshot: ViewerSnapshot, seasonId: number | null): Set<number> {
  return new Set(
    table(snapshot, 'matches')
      .filter(row => seasonId == null || nullableNumber(row, 'season_id') === seasonId)
      .map(row => numberValue(row, 'id')),
  );
}

function matchPlayerNameMap(snapshot: ViewerSnapshot) {
  const map = new Map<string, string>();
  for (const row of table(snapshot, 'match_players')) {
    map.set(`${numberValue(row, 'match_id')}:${numberValue(row, 'player_id')}`, textValue(row, 'player_name'));
  }
  return map;
}

function appearanceMap(snapshot: ViewerSnapshot, matchIds: Set<number>) {
  const namesByMatches = new Map<string, Set<number>>();
  const ids = new Map<string, number>();
  for (const row of table(snapshot, 'match_players')) {
    const matchId = numberValue(row, 'match_id');
    if (!matchIds.has(matchId)) continue;
    const name = textValue(row, 'player_name');
    if (!name) continue;
    if (!namesByMatches.has(name)) namesByMatches.set(name, new Set());
    namesByMatches.get(name)!.add(matchId);
    if (!ids.has(name)) ids.set(name, numberValue(row, 'player_id'));
  }
  return {
    matches: new Map([...namesByMatches.entries()].map(([name, idsSet]) => [name, idsSet.size])),
    ids,
  };
}

export function computeLeaderboard(
  snapshot: ViewerSnapshot,
  kind: LeaderboardKind,
  seasonId: number | null,
): LeaderboardEntry[] {
  const matchIds = scopedMatchIds(snapshot, seasonId);
  const nameMap = matchPlayerNameMap(snapshot);
  const appearances = appearanceMap(snapshot, matchIds);
  const values = new Map<string, { playerId: number; value: number; legalBalls: number; runs: number }>();

  const getName = (matchId: number, playerId: number) => nameMap.get(`${matchId}:${playerId}`) || getPlayerName(snapshot, playerId);
  const add = (name: string, playerId: number, amount: number) => {
    const current = values.get(name) ?? { playerId, value: 0, legalBalls: 0, runs: 0 };
    current.value += amount;
    values.set(name, current);
  };

  for (const delivery of table(snapshot, 'deliveries')) {
    const matchId = numberValue(delivery, 'match_id');
    if (!matchIds.has(matchId)) continue;

    if (kind === 'runs' || kind === 'sixes') {
      const playerId = numberValue(delivery, 'striker_id');
      const name = getName(matchId, playerId);
      const amount = kind === 'runs' ? numberValue(delivery, 'bat_runs') : (numberValue(delivery, 'bat_runs') === 6 ? 1 : 0);
      if (amount) add(name, playerId, amount);
      continue;
    }

    if (kind === 'wickets') {
      const playerId = numberValue(delivery, 'bowler_id');
      const amount = numberValue(delivery, 'credited_bowler');
      if (amount) add(getName(matchId, playerId), playerId, amount);
      continue;
    }

    if (kind === 'catches' || kind === 'runOuts') {
      const requiredType = kind === 'catches' ? 'Caught' : 'Run Out';
      if (numberValue(delivery, 'wicket') !== 1 || textValue(delivery, 'wicket_type') !== requiredType) continue;
      const playerId = nullableNumber(delivery, 'fielder_id');
      if (playerId == null) continue;
      add(getName(matchId, playerId), playerId, 1);
      continue;
    }

    if (kind === 'economy') {
      const playerId = numberValue(delivery, 'bowler_id');
      const name = getName(matchId, playerId);
      const current = values.get(name) ?? { playerId, value: 0, legalBalls: 0, runs: 0 };
      current.legalBalls += numberValue(delivery, 'legal_ball');
      current.runs += numberValue(delivery, 'bat_runs') + numberValue(delivery, 'wide_runs') + numberValue(delivery, 'no_ball_runs');
      values.set(name, current);
    }
  }

  const entries: LeaderboardEntry[] = [];
  for (const [name, stat] of values.entries()) {
    const matches = appearances.matches.get(name) ?? 0;
    if (kind === 'economy') {
      if (stat.legalBalls < 6) continue;
      const economy = stat.runs / (stat.legalBalls / 6);
      entries.push({
        playerId: stat.playerId || appearances.ids.get(name) || 0,
        name,
        value: economy,
        matches,
        detail: `${stat.runs} runs / ${formatOvers(stat.legalBalls)} ov`,
      });
    } else if (stat.value > 0) {
      entries.push({ playerId: stat.playerId || appearances.ids.get(name) || 0, name, value: stat.value, matches });
    }
  }

  entries.sort((a, b) => {
    if (kind === 'economy') return a.value - b.value || a.name.localeCompare(b.name);
    return b.value - a.value || a.name.localeCompare(b.name);
  });
  return entries.slice(0, 20);
}

export function computeSeasonImpact(snapshot: ViewerSnapshot, seasonId: number): SeasonImpactEntry[] {
  const matchIds = scopedMatchIds(snapshot, seasonId);
  const names = matchPlayerNameMap(snapshot);
  const appearances = appearanceMap(snapshot, matchIds);
  const points = new Map<string, SeasonImpactEntry>();

  const ensure = (matchId: number, playerId: number) => {
    const name = names.get(`${matchId}:${playerId}`) || getPlayerName(snapshot, playerId);
    const existing = points.get(name);
    if (existing) return existing;
    const created: SeasonImpactEntry = {
      playerId,
      name,
      matches: appearances.matches.get(name) ?? 0,
      battingPoints: 0,
      bowlingPoints: 0,
      fieldingPoints: 0,
      totalPoints: 0,
    };
    points.set(name, created);
    return created;
  };

  for (const [name, matches] of appearances.matches.entries()) {
    points.set(name, {
      playerId: appearances.ids.get(name) ?? 0,
      name,
      matches,
      battingPoints: 0,
      bowlingPoints: 0,
      fieldingPoints: 0,
      totalPoints: 0,
    });
  }

  for (const delivery of table(snapshot, 'deliveries')) {
    const matchId = numberValue(delivery, 'match_id');
    if (!matchIds.has(matchId)) continue;

    const batRuns = numberValue(delivery, 'bat_runs');
    const batter = ensure(matchId, numberValue(delivery, 'striker_id'));
    batter.battingPoints += batRuns + (batRuns === 4 ? 4 : 0) + (batRuns === 6 ? 6 : 0);

    const bowler = ensure(matchId, numberValue(delivery, 'bowler_id'));
    bowler.bowlingPoints += 20 * numberValue(delivery, 'credited_bowler');
    if (numberValue(delivery, 'wicket') === 1 && textValue(delivery, 'wicket_type') === 'Bowled' && numberValue(delivery, 'credited_bowler') === 1) {
      bowler.bowlingPoints += 8;
    }
    if (
      numberValue(delivery, 'legal_ball') === 1 &&
      numberValue(delivery, 'bat_runs') === 0 &&
      numberValue(delivery, 'wide_runs') === 0 &&
      numberValue(delivery, 'no_ball_runs') === 0
    ) {
      bowler.bowlingPoints += 1;
    }

    if (numberValue(delivery, 'wicket') === 1) {
      const fielderId = nullableNumber(delivery, 'fielder_id');
      if (fielderId != null) {
        const fielder = ensure(matchId, fielderId);
        const type = textValue(delivery, 'wicket_type');
        if (type === 'Caught') fielder.fieldingPoints += 8;
        if (type === 'Stumped') fielder.fieldingPoints += 12;
        if (type === 'Run Out') fielder.fieldingPoints += 6;
      }
    }
  }

  for (const entry of points.values()) {
    entry.totalPoints = entry.battingPoints + entry.bowlingPoints + entry.fieldingPoints;
  }

  return [...points.values()].sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
}

export function computePlayerStats(snapshot: ViewerSnapshot, playerId: number, seasonId: number | null): PlayerStats {
  const matchIds = scopedMatchIds(snapshot, seasonId);
  const playerMatches = new Set<number>();
  for (const row of table(snapshot, 'match_players')) {
    if (numberValue(row, 'player_id') === playerId && matchIds.has(numberValue(row, 'match_id'))) {
      playerMatches.add(numberValue(row, 'match_id'));
    }
  }

  let runs = 0;
  let balls = 0;
  let fours = 0;
  let sixes = 0;
  let dismissals = 0;
  let legalBalls = 0;
  let bowlingRuns = 0;
  let wickets = 0;
  let dotBalls = 0;
  let catches = 0;
  let runOuts = 0;
  let stumpings = 0;
  const battingInnings = new Map<number, number>();
  const bowlingInnings = new Map<number, { wickets: number; runs: number }>();

  for (const delivery of table(snapshot, 'deliveries')) {
    const matchId = numberValue(delivery, 'match_id');
    if (!matchIds.has(matchId)) continue;
    const inningsId = numberValue(delivery, 'innings_id');

    if (numberValue(delivery, 'striker_id') === playerId) {
      const batRuns = numberValue(delivery, 'bat_runs');
      runs += batRuns;
      balls += numberValue(delivery, 'legal_ball');
      if (batRuns === 4) fours += 1;
      if (batRuns === 6) sixes += 1;
      battingInnings.set(inningsId, (battingInnings.get(inningsId) ?? 0) + batRuns);
    }

    if (numberValue(delivery, 'wicket') === 1 && nullableNumber(delivery, 'dismissed_player_id') === playerId) {
      dismissals += 1;
    }

    if (numberValue(delivery, 'bowler_id') === playerId) {
      const legal = numberValue(delivery, 'legal_ball');
      const conceded = numberValue(delivery, 'bat_runs') + numberValue(delivery, 'wide_runs') + numberValue(delivery, 'no_ball_runs');
      const credited = numberValue(delivery, 'credited_bowler');
      legalBalls += legal;
      bowlingRuns += conceded;
      wickets += credited;
      if (legal === 1 && conceded === 0) dotBalls += 1;
      const current = bowlingInnings.get(inningsId) ?? { wickets: 0, runs: 0 };
      current.wickets += credited;
      current.runs += conceded;
      bowlingInnings.set(inningsId, current);
    }

    if (numberValue(delivery, 'wicket') === 1 && nullableNumber(delivery, 'fielder_id') === playerId) {
      const type = textValue(delivery, 'wicket_type');
      if (type === 'Caught') catches += 1;
      if (type === 'Run Out') runOuts += 1;
      if (type === 'Stumped') stumpings += 1;
    }
  }

  let bestWickets = 0;
  let bestRuns = 0;
  for (const value of bowlingInnings.values()) {
    if (value.wickets > bestWickets || (value.wickets === bestWickets && (bestWickets === 0 || value.runs < bestRuns))) {
      bestWickets = value.wickets;
      bestRuns = value.runs;
    }
  }

  return {
    matches: playerMatches.size,
    batting: {
      innings: battingInnings.size,
      runs,
      balls,
      fours,
      sixes,
      highest: battingInnings.size ? Math.max(...battingInnings.values()) : 0,
      dismissals,
      average: dismissals > 0 ? runs / dismissals : runs,
      strikeRate: balls > 0 ? (runs / balls) * 100 : 0,
    },
    bowling: {
      legalBalls,
      runs: bowlingRuns,
      wickets,
      dotBalls,
      economy: legalBalls > 0 ? bowlingRuns / (legalBalls / 6) : 0,
      bestWickets,
      bestRuns,
    },
    fielding: { catches, runOuts, stumpings },
  };
}

export function inningsScorecard(snapshot: ViewerSnapshot, inningsId: number): { batters: BatterScore[]; bowlers: BowlerScore[] } {
  const innings = table(snapshot, 'innings').find(row => numberValue(row, 'id') === inningsId);
  if (!innings) return { batters: [], bowlers: [] };
  const matchId = numberValue(innings, 'match_id');
  const battingTeamId = numberValue(innings, 'batting_team_id');
  const bowlingTeamId = numberValue(innings, 'bowling_team_id');
  const deliveries = table(snapshot, 'deliveries')
    .filter(row => numberValue(row, 'innings_id') === inningsId)
    .sort((a, b) => numberValue(a, 'seq') - numberValue(b, 'seq'));

  const battingRows = table(snapshot, 'match_players')
    .filter(row => numberValue(row, 'match_id') === matchId && numberValue(row, 'team_id') === battingTeamId);
  const bowlingRows = table(snapshot, 'match_players')
    .filter(row => numberValue(row, 'match_id') === matchId && numberValue(row, 'team_id') === bowlingTeamId);

  // Match scorecards must follow the order players actually participated in the
  // innings, not the roster/Team Bank order. This mirrors the native Android
  // getMatchDetailV16 behavior: striker first, then non-striker, then each new
  // batter when they first appears; bowlers are ordered by first delivery bowled.
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

  for (const delivery of deliveries) {
    markBatter(nullableNumber(delivery, 'striker_id'));
    markBatter(nullableNumber(delivery, 'non_striker_id'));
    markBatter(nullableNumber(delivery, 'dismissed_player_id'));
    markBowler(nullableNumber(delivery, 'bowler_id'));
  }

  const rosterBattingIndex = new Map(battingRows.map((row, index) => [numberValue(row, 'player_id'), index]));
  const batters: BatterScore[] = battingRows.map(row => {
    const playerId = numberValue(row, 'player_id');
    const faced = deliveries.filter(delivery => numberValue(delivery, 'striker_id') === playerId);
    return {
      playerId,
      name: textValue(row, 'player_name'),
      runs: faced.reduce((sum, delivery) => sum + numberValue(delivery, 'bat_runs'), 0),
      balls: faced.reduce((sum, delivery) => sum + numberValue(delivery, 'legal_ball'), 0),
      fours: faced.filter(delivery => numberValue(delivery, 'bat_runs') === 4).length,
      sixes: faced.filter(delivery => numberValue(delivery, 'bat_runs') === 6).length,
      dismissed: deliveries.some(delivery => numberValue(delivery, 'wicket') === 1 && nullableNumber(delivery, 'dismissed_player_id') === playerId),
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

  return { batters, bowlers };
}
