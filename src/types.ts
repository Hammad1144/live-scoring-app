export type Player = { id: number; name: string };
export type TeamSummary = { id: number; name: string; playerCount: number; captainName?: string | null; viceCaptainName?: string | null };
export type Team = { id: number; name: string; players: Player[]; captainId?: number | null; viceCaptainId?: number | null };

export type MatchStatus = 'IN_PROGRESS' | 'COMPLETE';
export type MatchSummary = {
  id: number;
  teamAName: string;
  teamBName: string;
  oversLimit: number;
  status: MatchStatus;
  resultText: string | null;
  createdAt: string;
};

export type MatchRow = {
  id: number;
  team_a_id: number;
  team_b_id: number;
  overs_limit: number;
  batting_first_team_id: number;
  status: MatchStatus;
  current_innings: number;
  result_text: string | null;
  created_at: string;
  completed_at: string | null;
  import_key?: string | null;
  team_a_name_snapshot?: string | null;
  team_b_name_snapshot?: string | null;
};

export type InningsRow = {
  id: number;
  match_id: number;
  innings_no: number;
  batting_team_id: number;
  bowling_team_id: number;
  runs: number;
  wickets: number;
  legal_balls: number;
  wides: number;
  no_balls: number;
  byes: number;
  leg_byes: number;
  striker_id: any;
  non_striker_id: any;
  bowler_id: number | null;
  last_bowler_id: number | null;
  completed: number;
  target: number | null;
};

export type DeliveryInput = {
  batRuns?: number;
  wideRuns?: number;
  noBallRuns?: number;
  byeRuns?: number;
  legByeRuns?: number;
  legalBall: boolean;
  wicket?: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: number | null;
  creditedBowler?: boolean;
  runningRunsForStrike?: number;
  deadRun?: boolean;
  fielderId?: number | null;
};

export type WicketType = 'Bowled' | 'Caught' | 'Run Out' | 'Stumped';

export type LiveBatterStats = {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
};

export type LiveBowlerStats = {
  legalBalls: number;
  runs: number;
  wickets: number;
  currentOverRuns: number;
};

export type LiveMatch = {
  match: MatchRow;
  innings: InningsRow;
  battingTeamName: string;
  bowlingTeamName: string;
  strikerName: string | null;
  nonStrikerName: string | null;
  bowlerName: string | null;
  strikerStats: LiveBatterStats;
  nonStrikerStats: LiveBatterStats;
  bowlerStats: LiveBowlerStats;
  teamSize: number;
  currentOver: DeliveryView[];
};

export type DeliveryView = {
  id: number;
  seq: number;
  legal_ball: number;
  bat_runs: number;
  wide_runs: number;
  no_ball_runs: number;
  bye_runs: number;
  leg_bye_runs: number;
  total_runs: number;
  wicket: number;
  wicket_type: string | null;
  dead_run?: number;
  fielder_id?: number | null;
};

export type RecordResult = {
  inningsCompleted: boolean;
  matchCompleted: boolean;
  needsInningsSetup: boolean;
  needsBatter: boolean;
  needsBowler: boolean;
  message?: string;
};

export type BatterLine = {
  playerId: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string;
};

export type BowlerLine = {
  playerId: number;
  name: string;
  legalBalls: number;
  runs: number;
  wickets: number;
};

export type InningsScorecard = {
  inningsId: number;
  inningsNo: number;
  teamName: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  batters: BatterLine[];
  bowlers: BowlerLine[];
  overs: { overNo: number; balls: string[] }[];
};

export type MatchDetail = {
  id: number;
  title: string;
  oversLimit: number;
  status: MatchStatus;
  resultText: string | null;
  createdAt: string;
  innings: InningsScorecard[];
};

export type LeaderboardRow = {
  playerId: number;
  name: string;
  value: number;
  secondary?: string;
};

export type PortableMatchPackage = {
  kind: 'local-cricket-scorer-match';
  schemaVersion: 1;
  sourceKey: string;
  exportedAt: string;
  match: {
    sourceMatchId: number;
    teamAId: number;
    teamBId: number;
    teamAName: string;
    teamBName: string;
    oversLimit: number;
    battingFirstTeamId: number;
    status: 'COMPLETE';
    currentInnings: number;
    resultText: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  matchPlayers: Array<{
    teamId: number;
    playerId: number;
    playerName: string;
    battingOrder: number;
    isCaptain: number;
    isViceCaptain: number;
  }>;
  innings: Array<{
    sourceInningsId: number;
    inningsNo: number;
    battingTeamId: number;
    bowlingTeamId: number;
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
    target: number | null;
  }>;
  deliveries: Array<{
    sourceInningsId: number;
    seq: number;
    overNo: number;
    ballInOver: number;
    strikerId: number;
    nonStrikerId: number;
    bowlerId: number;
    batRuns: number;
    wideRuns: number;
    noBallRuns: number;
    byeRuns: number;
    legByeRuns: number;
    totalRuns: number;
    legalBall: number;
    wicket: number;
    wicketType: string | null;
    dismissedPlayerId: number | null;
    creditedBowler: number;
    stateBeforeJson: string;
    createdAt: string;
    deadRun?: number;
    fielderId?: number | null;
  }>;
};
