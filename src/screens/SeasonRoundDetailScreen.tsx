import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeason } from '../data/v14Core';
import {
  deleteSeasonRound,
  getSeasonRound,
  getSeasonRoundMatches,
  getUnassignedSeasonMatches,
  SeasonRound,
} from '../data/v17Core';
import { MatchSummary, Season } from '../types';
import { Card, Empty, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

function roundDate(round: SeasonRound | null) {
  if (!round?.startDate && !round?.endDate) return null;
  if (round.startDate === round.endDate || !round.endDate) return round.startDate;
  return `${round.startDate ?? '—'} → ${round.endDate}`;
}

export function SeasonRoundDetailScreen({
  seasonId,
  roundId,
  onBack,
  onOpenMatch,
  onDeleted,
  readOnly = false,
}: {
  seasonId: number;
  roundId: number | null;
  onBack: () => void;
  onOpenMatch: (id: number) => void;
  onDeleted: () => void;
  readOnly?: boolean;
}) {
  const db = useSQLiteContext();
  const [season, setSeason] = useState<Season | null>(null);
  const [round, setRound] = useState<SeasonRound | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);

  useEffect(() => {
    (async () => {
      const seasonRow = await getSeason(db, seasonId);
      setSeason(seasonRow);
      if (roundId == null) {
        setRound(null);
        setMatches(await getUnassignedSeasonMatches(db, seasonId));
      } else {
        const roundRow = await getSeasonRound(db, roundId);
        setRound(roundRow);
        setMatches(await getSeasonRoundMatches(db, roundId));
      }
    })();
  }, [db, seasonId, roundId]);

  const remove = () => {
    if (!round) return;
    Alert.alert(
      'Delete round / week?',
      `${round.name} has no matches and can be safely deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSeasonRound(db, round.id);
              onDeleted();
            } catch (e) {
              Alert.alert('Unable to delete round / week', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  if (!season) return null;
  const title = round?.name ?? 'Unassigned Matches';
  const date = roundDate(round);
  const subtitle = `${season.name}${date ? ` • ${date}` : ''} • ${matches.length} matches`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      {roundId == null ? (
        <Card style={styles.notice}>
          <Text style={styles.noticeTitle}>Compatibility Group</Text>
          <Text style={styles.noticeText}>These matches belong to the season but were created before rounds / weeks were introduced. New season matches must be assigned to a round.</Text>
        </Card>
      ) : null}

      <Text style={styles.section}>Matches</Text>
      {matches.length === 0 ? (
        <Empty text="No matches have been assigned here yet." />
      ) : matches.map((match, index) => (
        <Pressable key={match.id} onPress={() => onOpenMatch(match.id)}>
          <Card style={styles.matchCard}>
            <Text style={styles.matchNo}>MATCH {index + 1}</Text>
            <Text style={styles.matchTitle}>{match.teamAName} vs {match.teamBName}</Text>
            <Text style={styles.matchMeta}>
              {match.oversLimit} overs • {new Date(match.createdAt).toLocaleDateString()} • {match.status === 'COMPLETE' ? (match.resultText ?? 'Complete') : 'In progress'}
            </Text>
            <Text style={styles.open}>View match summary ›</Text>
          </Card>
        </Pressable>
      ))}

      {!readOnly && round && matches.length === 0 ? (
        <PrimaryButton label="Delete Empty Round / Week" onPress={remove} danger />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 50 },
  notice: { borderColor: colors.warning, backgroundColor: '#2b2410' },
  noticeTitle: { color: colors.warning, fontSize: 14, fontWeight: '900' },
  noticeText: { color: colors.muted, marginTop: 6, fontSize: 11, lineHeight: 16 },
  section: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  matchCard: { marginBottom: 8 },
  matchNo: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  matchTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginTop: 5 },
  matchMeta: { color: colors.muted, fontSize: 11, marginTop: 5, lineHeight: 16 },
  open: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 10 },
});
