import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAvailableBatters,
  getAvailableBowlers,
  getMatchPlayers,
  setNextBatter,
  setNextBowler,
} from '../data/database';
import {
  getLiveMatchV13 as getLiveMatch,
  recordDeliveryV13 as recordDelivery,
  undoLastDeliveryV13 as undoLastDelivery,
} from '../data/v13Core';
import { deliveryLabel, formatOvers } from '../logic/cricket';
import { DeliveryInput, LiveMatch, Player, WicketType } from '../types';
import { Card, Chip, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

type ExtraMode = 'wide' | 'noBall' | 'bye' | 'legBye' | null;
type WicketDelivery = 'legal' | 'wide' | 'noBall';

export function ScoringScreen({
  matchId,
  onBack,
  onNeedSetup,
  onMatchComplete,
}: {
  matchId: number;
  onBack: () => void;
  onNeedSetup: () => void;
  onMatchComplete: () => void;
}) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [extraMode, setExtraMode] = useState<ExtraMode>(null);
  const [nbMode, setNbMode] = useState<'bat' | 'bye' | 'legBye'>('bat');
  const [picker, setPicker] = useState<'batter' | 'bowler' | null>(null);
  const [pickerPlayers, setPickerPlayers] = useState<Player[]>([]);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [wicketDelivery, setWicketDelivery] = useState<WicketDelivery>('legal');
  const [wicketType, setWicketType] = useState<WicketType>('Bowled');
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [wicketRuns, setWicketRuns] = useState(0);
  const [fielderId, setFielderId] = useState<number | null>(null);
  const [fielders, setFielders] = useState<Player[]>([]);

  const load = async () => {
    const next = await getLiveMatch(db, matchId);
    setLive(next);
    if (
      next.match.status === 'IN_PROGRESS' &&
      (!next.innings.striker_id || !next.innings.non_striker_id || !next.innings.bowler_id) &&
      next.innings.legal_balls === 0 &&
      next.innings.runs === 0
    ) {
      onNeedSetup();
    }
  };

  useEffect(() => {
    load();
  }, [db, matchId]);

  const openPicker = async (kind: 'batter' | 'bowler') => {
    if (!live) return;
    setPickerPlayers(
      kind === 'batter'
        ? await getAvailableBatters(db, live.innings.id)
        : await getAvailableBowlers(db, live.innings.id),
    );
    setPicker(kind);
  };

  const handleResult = async (input: DeliveryInput) => {
    if (!live) return;
    try {
      const result = await recordDelivery(db, live.innings.id, input);
      setExtraMode(null);
      setWicketOpen(false);
      setFielderId(null);
      await load();

      if (result.matchCompleted) {
        Alert.alert('Match Complete', result.message ?? 'Match complete.', [
          { text: 'View Scorecard', onPress: onMatchComplete },
        ]);
      } else if (result.needsInningsSetup) {
        Alert.alert('Innings Complete', result.message ?? 'Set up the next innings.', [
          { text: 'Continue', onPress: onNeedSetup },
        ]);
      } else if (result.needsBatter) {
        await openPicker('batter');
      } else if (result.needsBowler) {
        await openPicker('bowler');
      }
    } catch (e) {
      Alert.alert('Scoring error', e instanceof Error ? e.message : String(e));
    }
  };

  const pickPlayer = async (p: Player) => {
    if (!live || !picker) return;
    try {
      if (picker === 'batter') {
        await setNextBatter(db, live.innings.id, p.id);
        setPicker(null);
        const refreshed = await getLiveMatch(db, matchId);
        setLive(refreshed);
        if (!refreshed.innings.bowler_id) await openPicker('bowler');
      } else {
        await setNextBowler(db, live.innings.id, p.id);
        setPicker(null);
        await load();
      }
    } catch (e) {
      Alert.alert('Selection error', e instanceof Error ? e.message : String(e));
    }
  };

  const undo = async () => {
    if (!live) return;
    try {
      await undoLastDelivery(db, live.innings.id);
      await load();
    } catch (e) {
      Alert.alert('Undo', e instanceof Error ? e.message : String(e));
    }
  };

  const wicketTypes = useMemo<WicketType[]>(() => {
    if (wicketDelivery === 'noBall') return ['Run Out'];
    if (wicketDelivery === 'wide') return ['Run Out', 'Stumped'];
    return ['Bowled', 'Caught', 'Run Out', 'Stumped'];
  }, [wicketDelivery]);

  useEffect(() => {
    if (!wicketTypes.includes(wicketType)) setWicketType(wicketTypes[0]!);
  }, [wicketTypes]);

  useEffect(() => {
    if (!live) return;
    if (wicketType !== 'Run Out') setDismissedId(live.innings.striker_id);
    setFielderId(null);
  }, [wicketType]);

  const openWicket = async () => {
    if (!live) return;
    setWicketDelivery('legal');
    setWicketType('Bowled');
    setDismissedId(live.innings.striker_id);
    setWicketRuns(0);
    setFielderId(null);
    setFielders(await getMatchPlayers(db, matchId, live.innings.bowling_team_id));
    setWicketOpen(true);
  };

  const submitWicket = () => {
    if (!live || !dismissedId) return;
    const isRunOut = wicketType === 'Run Out';
    const creditedBowler = !isRunOut;
    const needsFielder = wicketType === 'Caught' || wicketType === 'Run Out' || wicketType === 'Stumped';
    if (needsFielder && !fielderId) {
      Alert.alert('Select player', `Select the player involved in the ${wicketType.toLowerCase()}.`);
      return;
    }

    if (wicketDelivery === 'wide') {
      handleResult({
        legalBall: false,
        wideRuns: 1 + (isRunOut ? wicketRuns : 0),
        wicket: true,
        wicketType,
        dismissedPlayerId: dismissedId,
        creditedBowler,
        runningRunsForStrike: isRunOut ? wicketRuns : 0,
        fielderId,
      });
    } else if (wicketDelivery === 'noBall') {
      handleResult({
        legalBall: false,
        noBallRuns: 1,
        batRuns: isRunOut ? wicketRuns : 0,
        wicket: true,
        wicketType,
        dismissedPlayerId: dismissedId,
        creditedBowler: false,
        runningRunsForStrike: isRunOut ? wicketRuns : 0,
        fielderId,
      });
    } else {
      handleResult({
        legalBall: true,
        batRuns: isRunOut ? wicketRuns : 0,
        wicket: true,
        wicketType,
        dismissedPlayerId: dismissedId,
        creditedBowler,
        runningRunsForStrike: isRunOut ? wicketRuns : 0,
        fielderId,
      });
    }
  };

  if (!live) {
    return (
      <View style={styles.loading}>
        <Text style={styles.muted}>Loading match…</Text>
      </View>
    );
  }

  const { innings, match } = live;
  const chaseRequired = innings.target ? Math.max(innings.target - innings.runs, 0) : null;
  const ballsRemaining = match.overs_limit * 6 - innings.legal_balls;
  const strikerStatLine = `${live.strikerStats.runs} (${live.strikerStats.balls})`;
  const nonStrikerStatLine = `${live.nonStrikerStats.runs} (${live.nonStrikerStats.balls})`;
  const bowlerStatLine = `${formatOvers(live.bowlerStats.legalBalls)} ov • ${live.bowlerStats.runs} R • ${live.bowlerStats.wickets} W`;
  const sheetBottomPadding = Math.max(insets.bottom, 12) + 18;
  const wicketNeedsFielder = wicketType === 'Caught' || wicketType === 'Run Out' || wicketType === 'Stumped';
  const fielderLabel = wicketType === 'Caught' ? 'Caught by' : wicketType === 'Run Out' ? 'Run out by' : 'Stumped by';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <ScreenHeader
            title={`${live.battingTeamName} batting`}
            subtitle={`Innings ${innings.innings_no} • ${match.overs_limit} overs`}
            onBack={onBack}
          />

          <Card style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <Text style={styles.score}>{innings.runs}/{innings.wickets}</Text>
              <Text style={styles.overs}>{formatOvers(innings.legal_balls)} ov</Text>
            </View>

            {innings.target ? (
              <View style={styles.targetBox}>
                <Text style={styles.targetText}>Target {innings.target}</Text>
                <Text style={styles.targetText}>{chaseRequired} needed from {ballsRemaining} balls</Text>
              </View>
            ) : null}

            <View style={styles.batterRow}>
              <View style={styles.batterBlock}>
                <Text style={styles.smallLabel}>STRIKER</Text>
                <Text style={styles.player} numberOfLines={1}>{live.strikerName ?? 'Select batter'} *</Text>
                <Text style={styles.playerStats}>
                  {strikerStatLine}
                  {live.strikerStats.fours || live.strikerStats.sixes
                    ? `  •  ${live.strikerStats.fours}×4  ${live.strikerStats.sixes}×6`
                    : ''}
                </Text>
              </View>

              <View style={[styles.batterBlock, styles.batterBlockRight]}>
                <Text style={[styles.smallLabel, styles.alignRight]}>NON-STRIKER</Text>
                <Text style={[styles.player, styles.alignRight]} numberOfLines={1}>{live.nonStrikerName ?? 'Select batter'}</Text>
                <Text style={[styles.playerStats, styles.alignRight]}>
                  {nonStrikerStatLine}
                  {live.nonStrikerStats.fours || live.nonStrikerStats.sixes
                    ? `  •  ${live.nonStrikerStats.fours}×4  ${live.nonStrikerStats.sixes}×6`
                    : ''}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.bowlerRow}>
              <View style={styles.bowlerBlock}>
                <Text style={styles.smallLabel}>BOWLER</Text>
                <Text style={styles.player} numberOfLines={1}>{live.bowlerName ?? 'Select bowler'}</Text>
                <Text style={styles.playerStats}>{bowlerStatLine}</Text>
              </View>
              <View style={styles.currentOverStat}>
                <Text style={[styles.smallLabel, styles.alignRight]}>THIS OVER</Text>
                <Text style={styles.currentOverRuns}>{live.bowlerStats.currentOverRuns} runs</Text>
                <Text style={styles.extras}>
                  Extras {innings.wides + innings.no_balls + innings.byes + innings.leg_byes}
                </Text>
              </View>
            </View>
          </Card>

          <Text style={styles.section}>This over</Text>
          <Card>
            <View style={styles.ballRow}>
              {live.currentOver.length ? (
                live.currentOver.map(d => (
                  <View key={d.id} style={[styles.ball, d.wicket ? styles.wicketBall : null]}>
                    <Text style={[styles.ballText, d.wicket ? styles.wicketBallText : null]}>
                      {deliveryLabel(d)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No deliveries yet.</Text>
              )}
            </View>
          </Card>

          <Text style={styles.section}>Runs</Text>
          <View style={styles.runGrid}>
            {[0, 1, 2, 3, 4, 6].map(r => (
              <Pressable
                key={r}
                style={({ pressed }) => [styles.runButton, pressed && styles.pressed]}
                onPress={() => handleResult({ legalBall: true, batRuns: r, runningRunsForStrike: r })}
              >
                <Text style={styles.runText}>{r}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.runButton, styles.deadRunButton, pressed && styles.pressed]}
              onPress={() => handleResult({ legalBall: true, batRuns: 1, deadRun: true, runningRunsForStrike: 0 })}
            >
              <Text style={styles.runText}>1D</Text>
              <Text style={styles.deadRunHint}>dead run</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Extras & wicket</Text>
          <View style={styles.actionGrid}>
            <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} onPress={() => setExtraMode('wide')}>
              <Text style={styles.actionText}>Wide</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} onPress={() => setExtraMode('noBall')}>
              <Text style={styles.actionText}>No Ball</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} onPress={() => setExtraMode('bye')}>
              <Text style={styles.actionText}>Bye</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]} onPress={() => setExtraMode('legBye')}>
              <Text style={styles.actionText}>Leg Bye</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, styles.wicketAction, pressed && styles.pressed]}
              onPress={openWicket}
            >
              <Text style={styles.wicketText}>WICKET</Text>
            </Pressable>
          </View>

          <SecondaryButton label="↶ Undo Last Ball" onPress={undo} />
        </View>
      </ScrollView>

      <Modal transparent visible={extraMode != null} animationType="slide" onRequestClose={() => setExtraMode(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, { paddingBottom: sheetBottomPadding }]}>
            <Text style={styles.modalTitle}>
              {extraMode === 'noBall' ? 'No Ball' : extraMode === 'legBye' ? 'Leg Bye' : extraMode === 'bye' ? 'Bye' : 'Wide'}
            </Text>

            {extraMode === 'wide' ? (
              <>
                <Text style={styles.modalHint}>Total wides on this delivery</Text>
                <View style={styles.chips}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Chip
                      key={n}
                      label={`${n} wide${n > 1 ? 's' : ''}`}
                      onPress={() =>
                        handleResult({
                          legalBall: false,
                          wideRuns: n,
                          runningRunsForStrike: Math.max(n - 1, 0),
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            {extraMode === 'bye' || extraMode === 'legBye' ? (
              <>
                <Text style={styles.modalHint}>Runs completed</Text>
                <View style={styles.chips}>
                  {[1, 2, 3, 4].map(n => (
                    <Chip
                      key={n}
                      label={`${n}`}
                      onPress={() =>
                        handleResult({
                          legalBall: true,
                          byeRuns: extraMode === 'bye' ? n : 0,
                          legByeRuns: extraMode === 'legBye' ? n : 0,
                          runningRunsForStrike: n,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            {extraMode === 'noBall' ? (
              <>
                <Text style={styles.modalHint}>Additional runs</Text>
                <View style={styles.chips}>
                  <Chip label="Off bat" selected={nbMode === 'bat'} onPress={() => setNbMode('bat')} />
                  <Chip label="Byes" selected={nbMode === 'bye'} onPress={() => setNbMode('bye')} />
                  <Chip label="Leg byes" selected={nbMode === 'legBye'} onPress={() => setNbMode('legBye')} />
                </View>

                <Text style={styles.modalHint}>Runs excluding the 1 no-ball penalty</Text>
                <View style={styles.chips}>
                  {(nbMode === 'bat' ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4]).map(n => (
                    <Chip
                      key={n}
                      label={`${n}`}
                      onPress={() =>
                        handleResult({
                          legalBall: false,
                          noBallRuns: 1,
                          batRuns: nbMode === 'bat' ? n : 0,
                          byeRuns: nbMode === 'bye' ? n : 0,
                          legByeRuns: nbMode === 'legBye' ? n : 0,
                          runningRunsForStrike: n,
                        })
                      }
                    />
                  ))}
                  {nbMode === 'bat' ? (
                    <Chip
                      label="1D"
                      onPress={() => handleResult({
                        legalBall: false,
                        noBallRuns: 1,
                        batRuns: 1,
                        deadRun: true,
                        runningRunsForStrike: 0,
                      })}
                    />
                  ) : null}
                </View>
                {nbMode === 'bat' ? <Text style={styles.deadRunHelp}>1D credits 1 run to the batter without changing strike.</Text> : null}
              </>
            ) : null}

            <SecondaryButton label="Cancel" onPress={() => setExtraMode(null)} />
          </View>
        </View>
      </Modal>

      <Modal transparent visible={wicketOpen} animationType="slide" onRequestClose={() => setWicketOpen(false)}>
        <View style={styles.modalShade}>
          <ScrollView contentContainerStyle={styles.modalWrap} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalCard, { paddingBottom: sheetBottomPadding }]}>
              <Text style={styles.modalTitle}>Record Wicket</Text>

              <Text style={styles.modalHint}>Delivery</Text>
              <View style={styles.chips}>
                <Chip label="Legal ball" selected={wicketDelivery === 'legal'} onPress={() => setWicketDelivery('legal')} />
                <Chip label="Wide" selected={wicketDelivery === 'wide'} onPress={() => setWicketDelivery('wide')} />
                <Chip label="No ball" selected={wicketDelivery === 'noBall'} onPress={() => setWicketDelivery('noBall')} />
              </View>

              <Text style={styles.modalHint}>Dismissal</Text>
              <View style={styles.chips}>
                {wicketTypes.map(w => (
                  <Chip key={w} label={w} selected={wicketType === w} onPress={() => setWicketType(w)} />
                ))}
              </View>

              {wicketType === 'Run Out' ? (
                <>
                  <Text style={styles.modalHint}>Batter dismissed</Text>
                  <View style={styles.chips}>
                    <Chip
                      label={live.strikerName ?? 'Striker'}
                      selected={dismissedId === innings.striker_id}
                      onPress={() => setDismissedId(innings.striker_id)}
                    />
                    <Chip
                      label={live.nonStrikerName ?? 'Non-striker'}
                      selected={dismissedId === innings.non_striker_id}
                      onPress={() => setDismissedId(innings.non_striker_id)}
                    />
                  </View>
                  <Text style={styles.modalHint}>Completed runs before run out</Text>
                  <View style={styles.chips}>
                    {[0, 1, 2, 3].map(n => (
                      <Chip key={n} label={`${n}`} selected={wicketRuns === n} onPress={() => setWicketRuns(n)} />
                    ))}
                  </View>
                </>
              ) : null}

              {wicketNeedsFielder ? (
                <>
                  <Text style={styles.modalHint}>{fielderLabel}</Text>
                  <ScrollView style={styles.fielderScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                    {fielders.map(p => (
                      <Chip key={p.id} label={p.name} selected={fielderId === p.id} onPress={() => setFielderId(p.id)} />
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <PrimaryButton label="Record Wicket" onPress={submitWicket} danger disabled={wicketNeedsFielder && !fielderId} />
              <SecondaryButton label="Cancel" onPress={() => setWicketOpen(false)} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal transparent visible={picker != null} animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalShade}>
          <View style={[styles.modalCard, { paddingBottom: sheetBottomPadding }]}>
            <Text style={styles.modalTitle}>{picker === 'batter' ? 'Select Next Batter' : 'Select Next Bowler'}</Text>
            <Text style={styles.modalHint}>
              {picker === 'bowler'
                ? 'The previous-over bowler is excluded.'
                : 'Dismissed/current batters are excluded.'}
            </Text>
            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {pickerPlayers.map(p => (
                <Chip key={p.id} label={p.name} onPress={() => pickPlayer(p)} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 620,
    gap: 12,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCard: { padding: 18 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  score: { color: colors.text, fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  overs: { color: colors.primary, fontSize: 18, fontWeight: '800', marginBottom: 7 },
  targetBox: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  targetText: { color: colors.warning, fontWeight: '800', fontSize: 12 },
  batterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, gap: 16 },
  batterBlock: { flex: 1, minWidth: 0 },
  batterBlockRight: { alignItems: 'flex-end' },
  bowlerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 },
  bowlerBlock: { flex: 1, minWidth: 0 },
  currentOverStat: { alignItems: 'flex-end' },
  smallLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, fontWeight: '800' },
  player: { color: colors.text, fontWeight: '800', marginTop: 4, fontSize: 15, maxWidth: '100%' },
  playerStats: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 5 },
  currentOverRuns: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  extras: { color: colors.muted, fontSize: 11, marginTop: 4 },
  alignRight: { textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  muted: { color: colors.muted },
  ballRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 38, alignItems: 'center' },
  ball: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  wicketBall: { backgroundColor: colors.danger },
  ballText: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  wicketBallText: { color: colors.white },
  runGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  runButton: {
    width: '23.5%',
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadRunButton: { borderColor: colors.primary },
  runText: { color: colors.text, fontSize: 24, fontWeight: '900' },
  deadRunHint: { color: colors.primary, fontSize: 9, fontWeight: '800', marginTop: 1 },
  deadRunHelp: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  actionButton: {
    width: '48.5%',
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wicketAction: { width: '100%', borderColor: colors.danger, backgroundColor: '#3a1718' },
  actionText: { color: colors.text, fontWeight: '800' },
  wicketText: { color: '#ff9b9b', fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.72 },
  modalShade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalWrap: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  modalHint: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerScroll: { maxHeight: 280 },
  fielderScroll: { maxHeight: 160 },
});
