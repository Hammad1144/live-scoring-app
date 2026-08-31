import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeasons } from '../data/v14Core';
import { getSeasonRounds, SeasonRound } from '../data/v17Core';
import { Season } from '../types';
import { Card, Chip, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';
import type { MatchSetupDraft } from './matchSetupDraft';

export function MatchSetupScreen({
  draft,
  onChange,
  onBack,
  onContinue,
  onSeasons,
}: {
  draft: MatchSetupDraft;
  onChange: (next: MatchSetupDraft) => void;
  onBack: () => void;
  onContinue: () => void;
  onSeasons: () => void;
}) {
  const db = useSQLiteContext();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [rounds, setRounds] = useState<SeasonRound[]>([]);

  useEffect(() => { getSeasons(db).then(setSeasons); }, [db]);
  useEffect(() => {
    if (draft.seasonId == null) {
      setRounds([]);
      return;
    }
    getSeasonRounds(db, draft.seasonId).then(setRounds);
  }, [db, draft.seasonId]);

  const selectSeason = (seasonId: number | null) => {
    onChange({ ...draft, seasonId, seasonRoundId: null });
  };

  const canContinue = draft.seasonId == null || draft.seasonRoundId != null;
  const selectedSeason = seasons.find(season => season.id === draft.seasonId);
  const selectedRound = rounds.find(round => round.id === draft.seasonRoundId);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="New Match" subtitle="Step 1 of 3 • Season & round" onBack={onBack} />

        <Text style={styles.section}>Season</Text>
        <Card style={styles.cardGap}>
          <View style={styles.chips}>
            <Chip label="No Season" selected={draft.seasonId == null} onPress={() => selectSeason(null)} />
            {seasons.map(season => (
              <Chip
                key={season.id}
                label={season.name}
                selected={draft.seasonId === season.id}
                onPress={() => selectSeason(season.id)}
              />
            ))}
          </View>
          <Text style={styles.helper}>Choose No Season for casual matches, or place the match inside a season and round/week.</Text>
        </Card>

        {draft.seasonId != null ? (
          <>
            <Text style={styles.section}>Round / Week</Text>
            <Card style={styles.cardGap}>
              {rounds.length ? (
                <View style={styles.chips}>
                  {rounds.map(round => (
                    <Chip
                      key={round.id}
                      label={`${round.name} (${round.matchCount})`}
                      selected={draft.seasonRoundId === round.id}
                      onPress={() => onChange({ ...draft, seasonRoundId: round.id })}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.helper}>This season has no rounds / weeks yet. Create one before continuing.</Text>
              )}
              <Text style={styles.helper}>Every season match belongs to one round/week so weekly match days stay organized.</Text>
            </Card>
          </>
        ) : null}

        <SecondaryButton label="Manage Seasons & Rounds" onPress={onSeasons} />

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>MATCH CONTEXT</Text>
          <Text style={styles.summaryValue}>{selectedSeason?.name ?? 'No Season'}</Text>
          <Text style={styles.summaryMeta}>{selectedRound?.name ?? (draft.seasonId == null ? 'Casual / unassigned match' : 'Select a round / week')}</Text>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" disabled={!canContinue} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 24, gap: 12 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardGap: { gap: 10 },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  summaryCard: { marginTop: 4, gap: 4 },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  summaryMeta: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  footer: { padding: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
