import type { MatchPlayerSwitch } from '../data/v16Core';

export type MatchSetupDraft = {
  seasonId: number | null;
  seasonRoundId: number | null;
  teamAId: number | null;
  teamBId: number | null;
  overs: number;
  battingFirstTeamId: number | null;
  teamAPlayerIds: number[];
  teamBPlayerIds: number[];
  switches: MatchPlayerSwitch[];
};

export function createEmptyMatchSetupDraft(): MatchSetupDraft {
  return {
    seasonId: null,
    seasonRoundId: null,
    teamAId: null,
    teamBId: null,
    overs: 6,
    battingFirstTeamId: null,
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    switches: [],
  };
}
