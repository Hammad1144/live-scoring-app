import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getTeamV12 } from '../data/v12Core';
import { Team } from '../types';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';
import type { MatchSetupDraft } from './matchSetupDraft';

const MAX_MATCH_PLAYERS = 11;

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function normalizeSelection(team: Team, current: number[]) {
  const squadIds = team.players.map(player => player.id);
  if (current.length === 0) return squadIds.slice(0, MAX_MATCH_PLAYERS);
  return current.filter(id => squadIds.includes(id)).slice(0, MAX_MATCH_PLAYERS);
}

export function MatchAvailabilityScreen({
  draft,
  onChange,
  onBack,
  onShuffle,
  onStart,
}: {
  draft: MatchSetupDraft;
  onChange: (next: MatchSetupDraft) => void;
  onBack: () => void;
  onShuffle: () => void;
  onStart: () => Promise<void>;
}) {
  const db = useSQLiteContext();
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!draft.teamAId || !draft.teamBId) return;
    Promise.all([getTeamV12(db, draft.teamAId), getTeamV12(db, draft.teamBId)]).then(([a, b]) => {
      setTeamA(a);
      setTeamB(b);
    });
  }, [db, draft.teamAId, draft.teamBId]);

  useEffect(() => {
    if (!teamA || !teamB) return;
    const nextA = normalizeSelection(teamA, draft.teamAPlayerIds);
    const nextB = normalizeSelection(teamB, draft.teamBPlayerIds);
    if (!sameIds(nextA, draft.teamAPlayerIds) || !sameIds(nextB, draft.teamBPlayerIds)) {
      const active = new Set([...nextA, ...nextB]);
      onChange({
        ...draft,
        teamAPlayerIds: nextA,
        teamBPlayerIds: nextB,
        switches: draft.switches.filter(move => active.has(move.playerId)),
      });
    }
  }, [teamA, teamB, draft, onChange]);

  const selectedA = useMemo(() => new Set(draft.teamAPlayerIds), [draft.teamAPlayerIds]);
  const selectedB = useMemo(() => new Set(draft.teamBPlayerIds), [draft.teamBPlayerIds]);

  const toggle = (team: 'A' | 'B', playerId: number) => {
    const current = team === 'A' ? draft.teamAPlayerIds : draft.teamBPlayerIds;
    const isSelected = current.includes(playerId);
    if (isSelected && current.length <= 2) {
      Alert.alert('Minimum team size', 'Keep at least 2 available players selected for each team.');
      return;
    }
    if (!isSelected && current.length >= MAX_MATCH_PLAYERS) {
      Alert.alert('Maximum match XI', 'A match can have at most 11 selected players per team. Deselect one player before selecting another.');
      return;
    }
    const next = isSelected ? current.filter(id => id !== playerId) : [...current, playerId];
    const nextA = team === 'A' ? next : draft.teamAPlayerIds;
    const nextB = team === 'B' ? next : draft.teamBPlayerIds;
    const active = new Set([...nextA, ...nextB]);
    onChange({
      ...draft,
      teamAPlayerIds: nextA,
      teamBPlayerIds: nextB,
      switches: draft.switches.filter(move => active.has(move.playerId)),
    });
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await onStart();
    } catch (error) {
      Alert.alert('Cannot start match', error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  if (!teamA || !teamB) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.container}>
          <ScreenHeader title="Available Players" subtitle="Step 3 of 3 • Match-day XI" onBack={onBack} />
          <Empty text="Loading team players…" />
        </ScrollView>
      </View>
    );
  }

  const canStart = draft.teamAPlayerIds.length >= 2 && draft.teamAPlayerIds.length <= MAX_MATCH_PLAYERS
    && draft.teamBPlayerIds.length >= 2 && draft.teamBPlayerIds.length <= MAX_MATCH_PLAYERS;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="Available Players" subtitle="Step 3 of 3 • Match-day XI" onBack={onBack} />

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>Select today's playing squad</Text>
          <Text style={styles.helper}>The first 11 players from each Team Bank squad are selected by default. Deselect anyone unavailable, then select another squad member as needed. Only selected players are added to this match and counted as match participants.</Text>
        </Card>

        <Text style={styles.section}>{teamA.name}</Text>
        <Card style={styles.teamCard}>
          <View style={styles.teamHeader}>
            <Text style={styles.teamCount}>{draft.teamAPlayerIds.length}/{MAX_MATCH_PLAYERS} selected</Text>
            <Text style={styles.hint}>{teamA.players.length} in Team Bank</Text>
          </View>
          <View style={styles.chips}>
            {teamA.players.map(player => (
              <Chip
                key={player.id}
                label={player.name}
                selected={selectedA.has(player.id)}
                onPress={() => toggle('A', player.id)}
              />
            ))}
          </View>
        </Card>

        <Text style={styles.section}>{teamB.name}</Text>
        <Card style={styles.teamCard}>
          <View style={styles.teamHeader}>
            <Text style={styles.teamCount}>{draft.teamBPlayerIds.length}/{MAX_MATCH_PLAYERS} selected</Text>
            <Text style={styles.hint}>{teamB.players.length} in Team Bank</Text>
          </View>
          <View style={styles.chips}>
            {teamB.players.map(player => (
              <Chip
                key={player.id}
                label={player.name}
                selected={selectedB.has(player.id)}
                onPress={() => toggle('B', player.id)}
              />
            ))}
          </View>
        </Card>

        {draft.switches.length ? (
          <Card style={styles.shuffleSummary}>
            <Text style={styles.shuffleTitle}>{draft.switches.length} match-only shuffle{draft.switches.length === 1 ? '' : 's'} configured</Text>
            <Text style={styles.helper}>These players will play for the opposite side in this match only.</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.footerButton, styles.secondaryAction, !canStart && styles.disabled]} disabled={!canStart} onPress={onShuffle}>
          <Text style={styles.secondaryText}>Shuffle</Text>
        </Pressable>
        <Pressable style={[styles.footerButton, styles.primaryAction, (!canStart || starting) && styles.disabled]} disabled={!canStart || starting} onPress={start}>
          <Text style={styles.primaryText}>{starting ? 'Starting…' : 'Start Match'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 24, gap: 12 },
  infoCard: { gap: 6 },
  infoTitle: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  section: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  teamCard: { gap: 12 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  teamCount: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  hint: { color: colors.muted, fontSize: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shuffleSummary: { gap: 4 },
  shuffleTitle: { color: colors.text, fontWeight: '800', fontSize: 13 },
  footer: { flexDirection: 'row', gap: 10, padding: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  footerButton: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryAction: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  primaryAction: { backgroundColor: colors.primary },
  secondaryText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  primaryText: { color: '#052015', fontWeight: '900', fontSize: 14 },
  disabled: { opacity: 0.4 },
});
