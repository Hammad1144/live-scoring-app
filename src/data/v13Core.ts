import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getLiveMatch as getBaseLiveMatch,
  getMatchDetail as getBaseMatchDetail,
  getMatch,
  getMatchPlayers,
  recordDelivery as recordBaseDelivery,
  undoLastDelivery as undoBaseDelivery,
} from './database';
import { initDatabaseV12 } from './v12Core';
import { deliveryLabel } from '../logic/cricket';
import { DeliveryInput, DeliveryView, InningsRow, LiveMatch, MatchDetail, RecordResult } from '../types';

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some(c => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function initDatabaseV13(db: SQLiteDatabase) {
  await initDatabaseV12(db);
  await ensureColumn(db, 'deliveries', 'dead_run', 'dead_run INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'deliveries', 'fielder_id', 'fielder_id INTEGER');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_deliveries_fielder ON deliveries(fielder_id, wicket_type);');
}

async function validateFieldingAttribution(db: SQLiteDatabase, inningsId: number, input: DeliveryInput) {
  if (!input.wicket) return;
  const needsFielder = input.wicketType === 'Caught' || input.wicketType === 'Run Out' || input.wicketType === 'Stumped';
  if (!needsFielder) return;
  if (!input.fielderId) throw new Error(`Select the player involved in the ${input.wicketType?.toLowerCase() ?? 'wicket'}.`);

  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const fielders = await getMatchPlayers(db, innings.match_id, innings.bowling_team_id);
  if (!fielders.some(p => p.id === input.fielderId)) throw new Error('The selected fielder must belong to the bowling team.');
}

export async function recordDeliveryV13(db: SQLiteDatabase, inningsId: number, rawInput: DeliveryInput): Promise<RecordResult> {
  const input: DeliveryInput = { ...rawInput };
  if (input.deadRun) {
    if ((input.batRuns ?? 0) !== 1) throw new Error('1D must credit exactly one run to the batter.');
    if ((input.wideRuns ?? 0) > 0 || (input.byeRuns ?? 0) > 0 || (input.legByeRuns ?? 0) > 0) {
      throw new Error('1D is available as a batter run on a legal ball or no-ball.');
    }
    input.runningRunsForStrike = 0;
  }

  await validateFieldingAttribution(db, inningsId, input);
  const before = await db.getFirstAsync<{ id: number }>('SELECT COALESCE(MAX(id), 0) AS id FROM deliveries WHERE innings_id = ?', inningsId);
  const result = await recordBaseDelivery(db, inningsId, input);
  const inserted = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM deliveries WHERE innings_id = ? AND id > ? ORDER BY id DESC LIMIT 1',
    inningsId,
    before?.id ?? 0,
  );
  if (inserted) {
    await db.runAsync(
      'UPDATE deliveries SET dead_run = ?, fielder_id = ? WHERE id = ?',
      input.deadRun ? 1 : 0,
      input.fielderId ?? null,
      inserted.id,
    );
  }
  return result;
}

export async function getLiveMatchV13(db: SQLiteDatabase, matchId: number): Promise<LiveMatch> {
  const live = await getBaseLiveMatch(db, matchId);
  const currentOverNo = Math.floor(live.innings.legal_balls / 6) + 1;
  const currentOver = await db.getAllAsync<DeliveryView>(`
    SELECT id, seq, legal_ball, bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs,
      total_runs, wicket, wicket_type, dead_run, fielder_id
    FROM deliveries WHERE innings_id = ? AND over_no = ? ORDER BY seq
  `, live.innings.id, currentOverNo);
  return { ...live, currentOver };
}

async function snapshotName(db: SQLiteDatabase, matchId: number, playerId: number | null): Promise<string | null> {
  if (!playerId) return null;
  const row = await db.getFirstAsync<{ player_name: string }>(
    'SELECT player_name FROM match_players WHERE match_id = ? AND player_id = ? LIMIT 1',
    matchId,
    playerId,
  );
  return row?.player_name ?? null;
}

export async function getMatchDetailV13(db: SQLiteDatabase, matchId: number): Promise<MatchDetail> {
  const detail = await getBaseMatchDetail(db, matchId);
  for (const innings of detail.innings) {
    const deliveries = await db.getAllAsync<any>(`
      SELECT id, seq, over_no, legal_ball, bat_runs, wide_runs, no_ball_runs, bye_runs, leg_bye_runs,
        total_runs, wicket, wicket_type, dismissed_player_id, bowler_id, fielder_id, dead_run
      FROM deliveries WHERE innings_id = ? ORDER BY seq
    `, innings.inningsId);

    const overMap = new Map<number, string[]>();
    for (const delivery of deliveries) {
      const list = overMap.get(delivery.over_no) ?? [];
      list.push(deliveryLabel(delivery));
      overMap.set(delivery.over_no, list);
    }
    innings.overs = [...overMap.entries()].map(([overNo, balls]) => ({ overNo, balls }));

    for (const batter of innings.batters) {
      const dismissal = deliveries.find(d => d.wicket === 1 && d.dismissed_player_id === batter.playerId);
      if (!dismissal) continue;
      const bowler = await snapshotName(db, matchId, dismissal.bowler_id ?? null);
      const fielder = await snapshotName(db, matchId, dismissal.fielder_id ?? null);
      switch (dismissal.wicket_type) {
        case 'Caught':
          batter.dismissal = dismissal.fielder_id === dismissal.bowler_id
            ? `c & b ${bowler ?? ''}`.trim()
            : `c ${fielder ?? 'fielder'} b ${bowler ?? ''}`.trim();
          break;
        case 'Run Out':
          batter.dismissal = fielder ? `run out (${fielder})` : 'run out';
          break;
        case 'Stumped':
          batter.dismissal = `st ${fielder ?? 'keeper'} b ${bowler ?? ''}`.trim();
          break;
        case 'Bowled':
          batter.dismissal = `b ${bowler ?? ''}`.trim();
          break;
        default:
          break;
      }
    }
  }
  return detail;
}

export async function reopenMatchForEditing(db: SQLiteDatabase, matchId: number) {
  const match = await getMatch(db, matchId);
  if (match.status !== 'COMPLETE') throw new Error('Only a completed match needs to be reopened for editing.');
  const current = await db.getFirstAsync<InningsRow>(
    'SELECT * FROM innings WHERE match_id = ? AND innings_no = ?',
    matchId,
    match.current_innings,
  );
  if (!current) throw new Error('Current innings not found.');
  await db.runAsync(
    `UPDATE matches SET status='IN_PROGRESS', result_text=NULL, completed_at=NULL WHERE id=?`,
    matchId,
  );
  await db.runAsync('UPDATE innings SET completed=0 WHERE id=?', current.id);
}

export async function undoLastDeliveryV13(db: SQLiteDatabase, inningsId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id = ?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM deliveries WHERE innings_id = ?', inningsId);
  if ((count?.c ?? 0) > 0) {
    await undoBaseDelivery(db, inningsId);
    return;
  }

  if (innings.innings_no !== 2) throw new Error('There is no delivery to undo.');
  const first = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE match_id = ? AND innings_no = 1', innings.match_id);
  if (!first) throw new Error('First innings not found.');
  const firstCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM deliveries WHERE innings_id = ?', first.id);
  if ((firstCount?.c ?? 0) === 0) throw new Error('There is no delivery to undo.');

  await db.runAsync('DELETE FROM innings WHERE id = ?', innings.id);
  await db.runAsync(
    `UPDATE matches SET current_innings=1, status='IN_PROGRESS', result_text=NULL, completed_at=NULL WHERE id=?`,
    innings.match_id,
  );
  await db.runAsync('UPDATE innings SET completed=0 WHERE id=?', first.id);
  await undoBaseDelivery(db, first.id);
}
