import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeason, getSeasonImpactRanking } from '../data/v14Core';
import { createSeasonRound, getSeasonRounds, getUnassignedSeasonMatchCount, SeasonRound } from '../data/v17Core';
import { Season, SeasonRankingRow } from '../types';
import { Card, Chip, Empty, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { DatePickerField } from '../components/DatePickerField';
import { colors } from '../theme';

type SeasonTab = 'matches' | 'rankings';

function dateLabel(round: SeasonRound) {
  if (!round.startDate && !round.endDate) return 'No dates set';
  if (round.startDate === round.endDate || !round.endDate) return round.startDate ?? 'No dates set';
  return `${round.startDate ?? '—'} → ${round.endDate}`;
}

export function SeasonDetailScreen({
  seasonId,
  onBack,
  onOpenRound,
  onOpenPlayer,
  readOnly = false,
}: {
  seasonId: number;
  onBack: () => void;
  onOpenRound: (roundId: number | null) => void;
  onOpenPlayer: (name: string, seasonId: number) => void;
  readOnly?: boolean;
}) {
  const db = useSQLiteContext();
  const [tab, setTab] = useState<SeasonTab>('matches');
  const [season, setSeason] = useState<Season | null>(null);
  const [rounds, setRounds] = useState<SeasonRound[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [ranking, setRanking] = useState<SeasonRankingRow[]>([]);
  const [roundName, setRoundName] = useState('');
  const [roundStart, setRoundStart] = useState('');
  const [roundEnd, setRoundEnd] = useState('');

  const load = async () => {
    const [s, r, u, rank] = await Promise.all([
      getSeason(db, seasonId),
      getSeasonRounds(db, seasonId),
      getUnassignedSeasonMatchCount(db, seasonId),
      getSeasonImpactRanking(db, seasonId),
    ]);
    setSeason(s);
    setRounds(r);
    setUnassignedCount(u);
    setRanking(rank.slice(0, 10));
  };

  useEffect(() => { load(); }, [db, seasonId]);

  const addRound = async () => {
    try {
      await createSeasonRound(db, seasonId, roundName, roundStart, roundEnd);
      setRoundName('');
      setRoundStart('');
      setRoundEnd('');
      await load();
    } catch (e) {
      Alert.alert('Unable to add round / week', e instanceof Error ? e.message : String(e));
    }
  };

  if (!season) return null;

  const assignedMatches = rounds.reduce((sum, round) => sum + round.matchCount, 0);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title={season.name}
        subtitle={`${season.startDate ?? '—'} → ${season.endDate ?? '—'} • ${season.matchCount} matches`}
        onBack={onBack}
      />

      <View style={styles.tabs}>
        <Chip label={`Matches (${season.matchCount})`} selected={tab === 'matches'} onPress={() => setTab('matches')} />
        <Chip label="Player Rankings" selected={tab === 'rankings'} onPress={() => setTab('rankings')} />
      </View>

      {tab === 'matches' ? (
        <>
          <Card style={styles.info}>
            <Text style={styles.infoTitle}>Season Match Structure</Text>
            <Text style={styles.infoText}>
              Organize the season into flexible rounds such as Week 1, Week 2, Finals or Tournament A. Matches live inside a round, while rankings continue to use the complete season.
            </Text>
            <Text style={styles.structureMeta}>{rounds.length} rounds / weeks • {assignedMatches} assigned matches</Text>
          </Card>

          {!readOnly ? (
            <Card style={styles.form}>
              <Text style={styles.section}>Add Round / Week</Text>
              <Text style={styles.formHint}>Use any name that fits your format: Week 1, Match Day 2, Tournament A, Semi Finals, etc.</Text>
              <Field label="ROUND / WEEK NAME" value={roundName} onChangeText={setRoundName} placeholder="e.g. Week 1" />
              <View style={styles.dateRow}>
                <DatePickerField label="START DATE (OPTIONAL)" value={roundStart} onChange={setRoundStart} />
                <DatePickerField label="END DATE (OPTIONAL)" value={roundEnd} onChange={setRoundEnd} />
              </View>
              <PrimaryButton label="+ Add Round / Week" onPress={addRound} disabled={!roundName.trim()} />
            </Card>
          ) : null}

          <View style={styles.sectionRow}>
            <Text style={styles.section}>Rounds / Weeks</Text>
            <Text style={styles.sectionCount}>{rounds.length}</Text>
          </View>

          {rounds.length === 0 && unassignedCount === 0 ? (
            <Empty text={readOnly ? 'No rounds or matches are available in this season yet.' : 'Create the first round / week, then assign new matches to it.'} />
          ) : (
            <>
              {rounds.map((round, index) => (
                <Pressable key={round.id} onPress={() => onOpenRound(round.id)}>
                  <Card style={styles.roundCard}>
                    <View style={styles.roundBadge}><Text style={styles.roundBadgeText}>{index + 1}</Text></View>
                    <View style={styles.roundMain}>
                      <Text style={styles.roundName}>{round.name}</Text>
                      <Text style={styles.roundMeta}>{dateLabel(round)}</Text>
                    </View>
                    <View style={styles.roundCount}>
                      <Text style={styles.roundCountValue}>{round.matchCount}</Text>
                      <Text style={styles.roundCountLabel}>matches</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Card>
                </Pressable>
              ))}

              {unassignedCount > 0 ? (
                <Pressable onPress={() => onOpenRound(null)}>
                  <Card style={[styles.roundCard, styles.unassignedCard]}>
                    <View style={styles.roundBadge}><Text style={styles.roundBadgeText}>!</Text></View>
                    <View style={styles.roundMain}>
                      <Text style={styles.roundName}>Unassigned Matches</Text>
                      <Text style={styles.roundMeta}>Matches created before the round / week structure was introduced.</Text>
                    </View>
                    <View style={styles.roundCount}>
                      <Text style={styles.roundCountValue}>{unassignedCount}</Text>
                      <Text style={styles.roundCountLabel}>matches</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Card>
                </Pressable>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <Card style={styles.info}>
            <Text style={styles.infoTitle}>Top Player of the Season</Text>
            <Text style={styles.infoText}>Top 10 players using the season scoring model across batting, bowling and fielding. All rounds / weeks in this season are included.</Text>
          </Card>

          {ranking.length === 0 ? <Empty text="No season performance data yet." /> : ranking.map((r, index) => (
            <Pressable key={r.name} onPress={() => onOpenPlayer(r.name, seasonId)}>
              <Card style={styles.rankCard}>
                <View style={styles.rankBadge}><Text style={styles.rankNo}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.player}>{r.name}</Text>
                  <Text style={styles.breakdown}>{r.matches} matches • Bat {r.battingPoints} • Bowl {r.bowlingPoints} • Field {r.fieldingPoints}</Text>
                </View>
                <Text style={styles.points}>{r.totalPoints}</Text>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 50 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border },
  info: { backgroundColor: '#0e2b1f' },
  infoTitle: { color: colors.primary, fontWeight: '900', fontSize: 16 },
  infoText: { color: colors.muted, marginTop: 7, lineHeight: 18, fontSize: 12 },
  structureMeta: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 10 },
  form: { gap: 12 },
  formHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  dateRow: { flexDirection: 'row', gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionCount: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  roundCard: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  unassignedCard: { borderColor: colors.warning },
  roundBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundBadgeText: { color: colors.primary, fontWeight: '900' },
  roundMain: { flex: 1, minWidth: 0 },
  roundName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  roundMeta: { color: colors.muted, fontSize: 10, marginTop: 4, lineHeight: 14 },
  roundCount: { alignItems: 'center', minWidth: 50 },
  roundCountValue: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  roundCountLabel: { color: colors.muted, fontSize: 9 },
  chevron: { color: colors.muted, fontSize: 26, marginLeft: 2 },
  rankCard: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rankNo: { color: colors.primary, fontWeight: '900' },
  player: { color: colors.text, fontWeight: '900', fontSize: 15 },
  breakdown: { color: colors.muted, fontSize: 10, marginTop: 4 },
  points: { color: colors.primary, fontSize: 23, fontWeight: '900' },
});
