import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeason } from '../data/v14Core';
import {
  deleteSeasonRound,
  getSeasonRound,
  getSeasonRoundMatches,
  getSeasonRounds,
  getUnassignedSeasonMatches,
  SeasonRound,
} from '../data/v17Core';
import { assignMatchToSeasonRound } from '../data/seasonRoundAssignments';
import { MatchSummary, Season } from '../types';
import { Card, Chip, Empty, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
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
  const [rounds, setRounds] = useState<SeasonRound[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [moveMatch, setMoveMatch] = useState<MatchSummary | null>(null);

  const load = async () => {
    const [seasonRow, allRounds] = await Promise.all([getSeason(db, seasonId), getSeasonRounds(db, seasonId)]);
    setSeason(seasonRow);
    setRounds(allRounds);
    if (roundId == null) {
      setRound(null);
      setMatches(await getUnassignedSeasonMatches(db, seasonId));
    } else {
      const roundRow = await getSeasonRound(db, roundId);
      setRound(roundRow);
      setMatches(await getSeasonRoundMatches(db, roundId));
    }
  };

  useEffect(() => { load(); }, [db, seasonId, roundId]);

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

  const assign = async (targetRoundId: number) => {
    if (!moveMatch) return;
    try {
      await assignMatchToSeasonRound(db, moveMatch.id, seasonId, targetRoundId);
      setMoveMatch(null);
      await load();
    } catch (e) {
      Alert.alert('Unable to change round / week', e instanceof Error ? e.message : String(e));
    }
  };

  if (!season) return null;
  const title = round?.name ?? 'Unassigned Matches';
  const date = roundDate(round);
  const subtitle = `${season.name}${date ? ` • ${date}` : ''} • ${matches.length} matches`;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

        {roundId == null ? (
          <Card style={styles.notice}>
            <Text style={styles.noticeTitle}>Compatibility Group</Text>
            <Text style={styles.noticeText}>These matches belong to the season but were created before rounds / weeks were introduced. Admins can assign each match to one of the season rounds below.</Text>
          </Card>
        ) : null}

        <Text style={styles.section}>Matches</Text>
        {matches.length === 0 ? (
          <Empty text="No matches have been assigned here yet." />
        ) : matches.map((match, index) => (
          <Card key={match.id} style={styles.matchCard}>
            <Pressable onPress={() => onOpenMatch(match.id)}>
              <Text style={styles.matchNo}>MATCH {index + 1}</Text>
              <Text style={styles.matchTitle}>{match.teamAName} vs {match.teamBName}</Text>
              <Text style={styles.matchMeta}>
                {match.oversLimit} overs • {new Date(match.createdAt).toLocaleDateString()} • {match.status === 'COMPLETE' ? (match.resultText ?? 'Complete') : 'In progress'}
              </Text>
              <Text style={styles.open}>View match summary ›</Text>
            </Pressable>
            {!readOnly && rounds.length > 0 ? (
              <Pressable style={styles.changeRound} onPress={() => setMoveMatch(match)}>
                <Text style={styles.changeRoundText}>{roundId == null ? 'Assign to Round / Week' : 'Change Round / Week'}</Text>
              </Pressable>
            ) : null}
          </Card>
        ))}

        {!readOnly && round && matches.length === 0 ? (
          <PrimaryButton label="Delete Empty Round / Week" onPress={remove} danger />
        ) : null}
      </ScrollView>

      <Modal transparent visible={moveMatch != null} animationType="slide" onRequestClose={() => setMoveMatch(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{roundId == null ? 'Assign Match' : 'Change Round / Week'}</Text>
            <Text style={styles.modalHint}>{moveMatch ? `${moveMatch.teamAName} vs ${moveMatch.teamBName}` : ''}</Text>
            <Text style={styles.modalHint}>Select where this match should appear inside {season.name}.</Text>
            <View style={styles.chips}>
              {rounds.map(option => (
                <Chip
                  key={option.id}
                  label={`${option.name} (${option.matchCount})`}
                  selected={roundId === option.id}
                  disabled={roundId === option.id}
                  onPress={() => assign(option.id)}
                />
              ))}
            </View>
            <SecondaryButton label="Cancel" onPress={() => setMoveMatch(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 50 },
  notice: { borderColor: colors.warning, backgroundColor: '#2b2410' },
  noticeTitle: { color: colors.warning, fontSize: 14, fontWeight: '900' },
  noticeText: { color: colors.muted, marginTop: 6, fontSize: 11, lineHeight: 16 },
  section: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  matchCard: { marginBottom: 8, gap: 10 },
  matchNo: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  matchTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginTop: 5 },
  matchMeta: { color: colors.muted, fontSize: 11, marginTop: 5, lineHeight: 16 },
  open: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 10 },
  changeRound: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, alignItems: 'flex-start' },
  changeRoundText: { color: colors.warning, fontSize: 11, fontWeight: '900' },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end', alignItems: 'center' },
  modalCard: { width: '100%', maxWidth: 620, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, gap: 14, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  modalHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
