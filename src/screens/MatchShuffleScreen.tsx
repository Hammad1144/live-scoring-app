import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getTeamV12 } from '../data/v12Core';
import type { MatchPlayerSwitch } from '../data/v16Core';
import { Team } from '../types';
import { Card, Chip, Empty, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';
import type { MatchSetupDraft } from './matchSetupDraft';

const MAX_MATCH_PLAYERS = 11;

export function MatchShuffleScreen({
  draft,
  onChange,
  onBack,
  onDone,
}: {
  draft: MatchSetupDraft;
  onChange: (next: MatchSetupDraft) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const db = useSQLiteContext();
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);

  useEffect(() => {
    if (!draft.teamAId || !draft.teamBId) return;
    Promise.all([getTeamV12(db, draft.teamAId), getTeamV12(db, draft.teamBId)]).then(([a, b]) => {
      setTeamA(a);
      setTeamB(b);
    });
  }, [db, draft.teamAId, draft.teamBId]);

  const switchMap = useMemo(() => new Map(draft.switches.map(move => [move.playerId, move])), [draft.switches]);
  const selectedA = useMemo(() => new Set(draft.teamAPlayerIds), [draft.teamAPlayerIds]);
  const selectedB = useMemo(() => new Set(draft.teamBPlayerIds), [draft.teamBPlayerIds]);

  const switchedFromA = draft.switches.filter(move => move.fromTeamId === draft.teamAId && move.toTeamId === draft.teamBId).length;
  const switchedFromB = draft.switches.filter(move => move.fromTeamId === draft.teamBId && move.toTeamId === draft.teamAId).length;
  const effectiveA = draft.teamAPlayerIds.length - switchedFromA + switchedFromB;
  const effectiveB = draft.teamBPlayerIds.length - switchedFromB + switchedFromA;

  const toggle = (playerId: number, fromTeamId: number, toTeamId: number) => {
    const existing = switchMap.get(playerId);
    if (existing?.fromTeamId === fromTeamId && existing.toTeamId === toTeamId) {
      onChange({ ...draft, switches: draft.switches.filter(move => move.playerId !== playerId) });
      return;
    }

    const currentSourceCount = fromTeamId === draft.teamAId ? effectiveA : effectiveB;
    const currentTargetCount = toTeamId === draft.teamAId ? effectiveA : effectiveB;
    if (currentSourceCount <= 2) {
      Alert.alert('Minimum team size', 'This shuffle would leave fewer than 2 players on the source team.');
      return;
    }
    if (currentTargetCount >= MAX_MATCH_PLAYERS) {
      Alert.alert('Maximum match XI', 'This shuffle would create more than 11 players on the receiving team. Move a player the other way or reduce the selected XI first.');
      return;
    }

    const next: MatchPlayerSwitch = { playerId, fromTeamId, toTeamId };
    onChange({ ...draft, switches: [...draft.switches.filter(move => move.playerId !== playerId), next] });
  };

  if (!teamA || !teamB || !draft.teamAId || !draft.teamBId) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="Shuffle Players" subtitle="Match-only team changes" onBack={onBack} />
        <Empty text="Loading selected players…" />
      </ScrollView>
    );
  }

  const availableA = teamA.players.filter(player => selectedA.has(player.id));
  const availableB = teamB.players.filter(player => selectedB.has(player.id));
  const valid = effectiveA >= 2 && effectiveA <= MAX_MATCH_PLAYERS && effectiveB >= 2 && effectiveB <= MAX_MATCH_PLAYERS;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="Shuffle Players" subtitle="Optional • This match only" onBack={onBack} />

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>Lend available players for this match</Text>
          <Text style={styles.helper}>Shuffle only changes the match roster. Team Bank membership, player identity, career statistics and future matches stay unchanged. Each side must remain between 2 and 11 players.</Text>
          <View style={styles.countRow}>
            <Text style={styles.countText}>{teamA.name}: {effectiveA}</Text>
            <Text style={styles.countText}>{teamB.name}: {effectiveB}</Text>
          </View>
        </Card>

        <Text style={styles.section}>{teamA.name} → {teamB.name}</Text>
        <Card style={styles.teamCard}>
          <Text style={styles.helper}>Select an available {teamA.name} player to play for {teamB.name} in this match.</Text>
          <View style={styles.chips}>
            {availableA.map(player => (
              <Chip
                key={player.id}
                label={player.name}
                selected={switchMap.get(player.id)?.toTeamId === teamB.id}
                onPress={() => toggle(player.id, teamA.id, teamB.id)}
              />
            ))}
          </View>
        </Card>

        <Text style={styles.section}>{teamB.name} → {teamA.name}</Text>
        <Card style={styles.teamCard}>
          <Text style={styles.helper}>Select an available {teamB.name} player to play for {teamA.name} in this match.</Text>
          <View style={styles.chips}>
            {availableB.map(player => (
              <Chip
                key={player.id}
                label={player.name}
                selected={switchMap.get(player.id)?.toTeamId === teamA.id}
                onPress={() => toggle(player.id, teamB.id, teamA.id)}
              />
            ))}
          </View>
        </Card>

        {draft.switches.length ? (
          <SecondaryButton label="Reset Shuffle" onPress={() => onChange({ ...draft, switches: [] })} />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Apply & Return" disabled={!valid} onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 24, gap: 12, backgroundColor: colors.bg },
  infoCard: { gap: 8 },
  infoTitle: { color: colors.primary, fontWeight: '900', fontSize: 15 },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  countText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  section: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  teamCard: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { padding: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
