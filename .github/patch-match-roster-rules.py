from pathlib import Path

core_path = Path('src/data/v16Core.ts')
core = core_path.read_text()
old_import = "import { getAvailableBowlers, getMatch, getMatchPlayers } from './database';"
new_import = "import { getMatch, getMatchPlayers, setNextBowler } from './database';"
assert old_import in core, 'v16Core database import changed'
core = core.replace(old_import, new_import, 1)

old_block = '''export async function getAvailableBattersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return [];
  const dismissed = await db.getAllAsync<{ id: number }>(
    'SELECT DISTINCT dismissed_player_id AS id FROM deliveries WHERE innings_id=? AND wicket=1 AND dismissed_player_id IS NOT NULL',
    inningsId,
  );
  const retired = await db.getAllAsync<{ id: number }>('SELECT player_id AS id FROM innings_retirements WHERE innings_id=?', inningsId);
  const blocked = new Set<number>([...dismissed.map(x => x.id), ...retired.map(x => x.id)]);
  if (innings.striker_id) blocked.add(Number(innings.striker_id));
  if (innings.non_striker_id) blocked.add(Number(innings.non_striker_id));
  const all = await getMatchPlayers(db, innings.match_id, innings.batting_team_id);
  return all.filter(p => !blocked.has(p.id));
}

export async function getAvailableBowlersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  return getAvailableBowlers(db, inningsId);
}

export async function setNextBatterV16(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const available = await getAvailableBattersV16(db, inningsId);
  if (!available.some(p => p.id === playerId)) throw new Error('That batter is not available in this innings.');
  if (innings.striker_id == null) await db.runAsync('UPDATE innings SET striker_id=? WHERE id=?', playerId, inningsId);
  else if (innings.non_striker_id == null) await db.runAsync('UPDATE innings SET non_striker_id=? WHERE id=?', playerId, inningsId);
  else throw new Error('Both batting ends are already occupied.');
}
'''

new_block = '''const MAX_UNIQUE_BATTERS_PER_INNINGS = 11;
const MAX_UNIQUE_BOWLERS_PER_INNINGS = 11;

async function usedBatterIdsV16(db: SQLiteDatabase, innings: InningsRow): Promise<Set<number>> {
  const deliveries = await db.getAllAsync<{
    strikerId: number | null;
    nonStrikerId: number | null;
    dismissedPlayerId: number | null;
  }>(`
    SELECT striker_id AS strikerId,
      non_striker_id AS nonStrikerId,
      dismissed_player_id AS dismissedPlayerId
    FROM deliveries
    WHERE innings_id=?
  `, innings.id);
  const retirements = await db.getAllAsync<{ id: number }>(
    'SELECT player_id AS id FROM innings_retirements WHERE innings_id=?',
    innings.id,
  );
  const used = new Set<number>();
  const add = (id: number | null | undefined) => { if (id != null) used.add(Number(id)); };
  add(innings.striker_id);
  add(innings.non_striker_id);
  for (const row of deliveries) {
    add(row.strikerId);
    add(row.nonStrikerId);
    add(row.dismissedPlayerId);
  }
  for (const row of retirements) add(row.id);
  return used;
}

async function usedBowlerIdsV16(db: SQLiteDatabase, innings: InningsRow): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ id: number }>(
    'SELECT DISTINCT bowler_id AS id FROM deliveries WHERE innings_id=? AND bowler_id IS NOT NULL',
    innings.id,
  );
  const used = new Set<number>(rows.map(row => Number(row.id)));
  if (innings.bowler_id != null) used.add(Number(innings.bowler_id));
  return used;
}

export async function canIntroduceNewBatterV16(db: SQLiteDatabase, inningsId: number): Promise<boolean> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return false;
  return (await usedBatterIdsV16(db, innings)).size < MAX_UNIQUE_BATTERS_PER_INNINGS;
}

export async function canIntroduceNewBowlerV16(db: SQLiteDatabase, inningsId: number): Promise<boolean> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return false;
  return (await usedBowlerIdsV16(db, innings)).size < MAX_UNIQUE_BOWLERS_PER_INNINGS;
}

export async function getAvailableBattersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return [];
  const dismissed = await db.getAllAsync<{ id: number }>(
    'SELECT DISTINCT dismissed_player_id AS id FROM deliveries WHERE innings_id=? AND wicket=1 AND dismissed_player_id IS NOT NULL',
    inningsId,
  );
  const retired = await db.getAllAsync<{ id: number }>('SELECT player_id AS id FROM innings_retirements WHERE innings_id=?', inningsId);
  const blocked = new Set<number>([...dismissed.map(x => x.id), ...retired.map(x => x.id)]);
  if (innings.striker_id) blocked.add(Number(innings.striker_id));
  if (innings.non_striker_id) blocked.add(Number(innings.non_striker_id));
  const used = await usedBatterIdsV16(db, innings);
  if (used.size >= MAX_UNIQUE_BATTERS_PER_INNINGS) return [];
  const all = await getMatchPlayers(db, innings.match_id, innings.batting_team_id);
  return all.filter(p => !blocked.has(p.id));
}

export async function getAvailableBowlersV16(db: SQLiteDatabase, inningsId: number): Promise<Player[]> {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) return [];
  const all = await getMatchPlayers(db, innings.match_id, innings.bowling_team_id);
  const used = await usedBowlerIdsV16(db, innings);
  return all.filter(player =>
    player.id !== innings.last_bowler_id
    && (used.has(player.id) || used.size < MAX_UNIQUE_BOWLERS_PER_INNINGS)
  );
}

export async function setNextBatterV16(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const innings = await db.getFirstAsync<InningsRow>('SELECT * FROM innings WHERE id=?', inningsId);
  if (!innings) throw new Error('Innings not found.');
  const available = await getAvailableBattersV16(db, inningsId);
  if (!available.some(p => p.id === playerId)) throw new Error('That batter is not available in this innings. A maximum of 11 unique batters may be used.');
  if (innings.striker_id == null) await db.runAsync('UPDATE innings SET striker_id=? WHERE id=?', playerId, inningsId);
  else if (innings.non_striker_id == null) await db.runAsync('UPDATE innings SET non_striker_id=? WHERE id=?', playerId, inningsId);
  else throw new Error('Both batting ends are already occupied.');
}

export async function setNextBowlerV16(db: SQLiteDatabase, inningsId: number, playerId: number) {
  const available = await getAvailableBowlersV16(db, inningsId);
  if (!available.some(player => player.id === playerId)) {
    throw new Error('That bowler is not available. A maximum of 11 unique bowlers may be used in an innings.');
  }
  await setNextBowler(db, inningsId, playerId);
}
'''
assert old_block in core, 'v16Core availability block changed'
core = core.replace(old_block, new_block, 1)
core_path.write_text(core)

scoring_path = Path('src/screens/ScoringScreenV16.tsx')
scoring = scoring_path.read_text()
old_db_import = "import { getMatchPlayers, setNextBowler } from '../data/database';"
assert old_db_import in scoring, 'ScoringScreen database import changed'
scoring = scoring.replace(old_db_import, "import { getMatchPlayers } from '../data/database';", 1)

old_core_import = '''  createGuestPlayerForMatch,
  getAvailableBattersV16,
  getAvailableBowlersV16,
  recordDeliveryV16 as recordDelivery,
  retireBatterV16,
  setNextBatterV16,
} from '../data/v16Core';'''
new_core_import = '''  canIntroduceNewBatterV16,
  canIntroduceNewBowlerV16,
  createGuestPlayerForMatch,
  getAvailableBattersV16,
  getAvailableBowlersV16,
  recordDeliveryV16 as recordDelivery,
  retireBatterV16,
  setNextBatterV16,
  setNextBowlerV16,
} from '../data/v16Core';'''
assert old_core_import in scoring, 'ScoringScreen v16 import block changed'
scoring = scoring.replace(old_core_import, new_core_import, 1)
assert 'await setNextBowler(db, live.innings.id, p.id);' in scoring, 'ScoringScreen next-bowler call changed'
scoring = scoring.replace('await setNextBowler(db, live.innings.id, p.id);', 'await setNextBowlerV16(db, live.innings.id, p.id);', 1)

old_guest = '''  const addGuestFromPicker = async () => {
    if (!live || !picker || !guestName.trim() || addingGuest) return;
    setAddingGuest(true);
    try {
      const teamId = picker === 'batter' ? live.innings.batting_team_id : live.innings.bowling_team_id;
      const player = await createGuestPlayerForMatch(db, matchId, teamId, guestName);
      setGuestName('');
      await pickPlayer(player);
    } catch (e) {
      Alert.alert('Unable to add guest player', e instanceof Error ? e.message : String(e));
    } finally {
      setAddingGuest(false);
    }
  };'''
new_guest = '''  const addGuestFromPicker = async () => {
    if (!live || !picker || !guestName.trim() || addingGuest) return;
    try {
      const canIntroduce = picker === 'batter'
        ? await canIntroduceNewBatterV16(db, live.innings.id)
        : await canIntroduceNewBowlerV16(db, live.innings.id);
      if (!canIntroduce) {
        Alert.alert(
          picker === 'batter' ? 'Batting limit reached' : 'Bowling limit reached',
          picker === 'batter'
            ? 'This innings has already used 11 unique batters. No additional batter can be introduced.'
            : 'This innings has already used 11 unique bowlers. No additional bowler can be introduced.',
        );
        return;
      }
      setAddingGuest(true);
      const teamId = picker === 'batter' ? live.innings.batting_team_id : live.innings.bowling_team_id;
      const player = await createGuestPlayerForMatch(db, matchId, teamId, guestName);
      setGuestName('');
      await pickPlayer(player);
    } catch (e) {
      Alert.alert('Unable to add guest player', e instanceof Error ? e.message : String(e));
    } finally {
      setAddingGuest(false);
    }
  };'''
assert old_guest in scoring, 'ScoringScreen guest picker block changed'
scoring = scoring.replace(old_guest, new_guest, 1)
scoring_path.write_text(scoring)
