import { DeliveryInput, DeliveryView } from '../types';

export function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export function economy(runs: number, legalBalls: number): number {
  if (!legalBalls) return 0;
  return runs / (legalBalls / 6);
}

export function strikeRate(runs: number, balls: number): number {
  return balls ? (runs / balls) * 100 : 0;
}

export function deliveryLabel(d: DeliveryView): string {
  if (d.wicket) {
    const runs = d.total_runs ? `+${d.total_runs}` : '';
    return `W${runs}`;
  }
  if (d.wide_runs) return `${d.wide_runs === 1 ? '' : d.wide_runs}Wd`;
  if (d.no_ball_runs) {
    const extra = d.total_runs - d.no_ball_runs;
    if (d.dead_run) return 'Nb+1D';
    return extra ? `Nb+${extra}` : 'Nb';
  }
  if (d.bye_runs) return `${d.bye_runs}B`;
  if (d.leg_bye_runs) return `${d.leg_bye_runs}Lb`;
  if (d.dead_run) return '1D';
  return String(d.bat_runs);
}

export function normalizeDelivery(input: DeliveryInput) {
  const batRuns = input.batRuns ?? 0;
  const wideRuns = input.wideRuns ?? 0;
  const noBallRuns = input.noBallRuns ?? 0;
  const byeRuns = input.byeRuns ?? 0;
  const legByeRuns = input.legByeRuns ?? 0;
  return {
    batRuns,
    wideRuns,
    noBallRuns,
    byeRuns,
    legByeRuns,
    legalBall: input.legalBall,
    wicket: input.wicket ?? false,
    wicketType: input.wicketType ?? null,
    dismissedPlayerId: input.dismissedPlayerId ?? null,
    creditedBowler: input.creditedBowler ?? false,
    runningRunsForStrike: input.runningRunsForStrike ?? 0,
    deadRun: input.deadRun ?? false,
    fielderId: input.fielderId ?? null,
  };
}
