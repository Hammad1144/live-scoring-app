import type { SQLiteDatabase } from 'expo-sqlite';
import { initDatabaseV17 } from './v17Core';

/**
 * Cricket wicket-margin rule for a successful chase:
 * a batting side can lose at most (match roster size - 1) wickets, because one
 * batter must remain not out. Therefore wickets remaining are:
 *   (team size - 1) - wickets lost
 *
 * Older app versions used teamSize - wickets, which overstated every chase win
 * by one wicket (for example, an 11-player side at 50/2 was shown as winning by
 * 9 wickets instead of 8).
 */
function correctedResultExpression(matchRef: string) {
  const secondRuns = `(SELECT i2.runs FROM innings i2 WHERE i2.match_id=${matchRef} AND i2.innings_no=2)`;
  const secondTarget = `(SELECT i2.target FROM innings i2 WHERE i2.match_id=${matchRef} AND i2.innings_no=2)`;
  const firstRuns = `(SELECT i1.runs FROM innings i1 WHERE i1.match_id=${matchRef} AND i1.innings_no=1)`;
  const secondTeam = `(SELECT i2.batting_team_id FROM innings i2 WHERE i2.match_id=${matchRef} AND i2.innings_no=2)`;
  const secondWickets = `(SELECT i2.wickets FROM innings i2 WHERE i2.match_id=${matchRef} AND i2.innings_no=2)`;
  const firstTeam = `(SELECT i1.batting_team_id FROM innings i1 WHERE i1.match_id=${matchRef} AND i1.innings_no=1)`;
  const teamSize = `(SELECT COUNT(*) FROM match_players mp WHERE mp.match_id=${matchRef} AND mp.team_id=${secondTeam})`;
  const wicketsRemaining = `MAX(((${teamSize}) - 1) - (${secondWickets}), 1)`;

  return `CASE
    WHEN ${secondRuns} >= COALESCE(${secondTarget}, (${firstRuns}) + 1) THEN
      (SELECT t.name FROM teams t WHERE t.id=${secondTeam}) ||
      ' won by ' || (${wicketsRemaining}) || ' wicket' ||
      CASE WHEN (${wicketsRemaining}) = 1 THEN '' ELSE 's' END
    WHEN ${firstRuns} > ${secondRuns} THEN
      (SELECT t.name FROM teams t WHERE t.id=${firstTeam}) ||
      ' won by ' || ((${firstRuns}) - (${secondRuns})) || ' run' ||
      CASE WHEN ((${firstRuns}) - (${secondRuns})) = 1 THEN '' ELSE 's' END
    ELSE 'Match tied'
  END`;
}

export async function repairCompletedMatchResults(db: SQLiteDatabase) {
  const expression = correctedResultExpression('matches.id');
  await db.execAsync(`
    UPDATE matches
    SET result_text = ${expression}
    WHERE status='COMPLETE'
      AND EXISTS (SELECT 1 FROM innings i1 WHERE i1.match_id=matches.id AND i1.innings_no=1)
      AND EXISTS (SELECT 1 FROM innings i2 WHERE i2.match_id=matches.id AND i2.innings_no=2)
      AND COALESCE(result_text, '') <> COALESCE((${expression}), '');
  `);
}

async function installCorrectResultTrigger(db: SQLiteDatabase) {
  const expression = correctedResultExpression('NEW.id');
  await db.execAsync(`
    DROP TRIGGER IF EXISTS trg_correct_completed_match_result;
    CREATE TRIGGER trg_correct_completed_match_result
    AFTER UPDATE OF status ON matches
    WHEN NEW.status='COMPLETE'
    BEGIN
      UPDATE matches
      SET result_text = ${expression}
      WHERE id=NEW.id
        AND EXISTS (SELECT 1 FROM innings i1 WHERE i1.match_id=NEW.id AND i1.innings_no=1)
        AND EXISTS (SELECT 1 FROM innings i2 WHERE i2.match_id=NEW.id AND i2.innings_no=2);
    END;
  `);
}

export async function initDatabaseV18(db: SQLiteDatabase) {
  await initDatabaseV17(db);
  await installCorrectResultTrigger(db);
  await repairCompletedMatchResults(db);
}
