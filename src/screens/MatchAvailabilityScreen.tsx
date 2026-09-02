import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getTeamV12 } from '../data/v12Core';
import { Team } from '../types';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';
import type { MatchSetupDraft } from './matchSetupDraft';

const MAX_MATCH_PLAYERS = 16;
const MIN_MATCH_PLAYERS = 2;

type EffectivePlayer = {
  player: Team['players'][number];
  sourceTeam: 'A' | 'B';
};

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
  const switchMap = useMemo(() => new Map(draft.switches.map(move => [move.playerId, move])), [draft.switches]);

  const effectiveTeamAPlayers = useMemo<EffectivePlayer[]>(() => {
    if (!teamA || !teamB) return [];
    const own = teamA.players
      .filter(player => switchMap.get(player.id)?.toTeamId !== teamB.id)
      .map(player => ({ player, sourceTeam: 'A' as const }));
    const incoming = teamB.players
      .filter(player => selectedB.has(player.id) && switchMap.get(player.id)?.toTeamId === teamA.id)
      .map(player => ({ player, sourceTeam: 'B' as const }));
    return [...own, ...incoming];
  }, [teamA, teamB, selectedB, switchMap]);

  const effectiveTeamBPlayers = useMemo<EffectivePlayer[]>(() => {
    if (!teamA || !teamB) return [];
    const own = teamB.players
      .filter(player => switchMap.get(player.id)?.toTeamId !== teamA.id)
      .map(player => ({ player, sourceTeam: 'B' as const }));
    const incoming = teamA.players
      .filter(player => selectedA.has(player.id) && switchMap.get(player.id)?.toTeamId === teamB.id)
      .map(player => ({ player, sourceTeam: 'A' as const }));
    return [...own, ...incoming];
  }, [teamA, teamB, selectedA, switchMap]);

  const isSelected = (item: EffectivePlayer) => item.sourceTeam === 'A'
    ? selectedA.has(item.player.id)
    : selectedB.has(item.player.id);

  const effectiveCountA = effectiveTeamAPlayers.filter(isSelected).length;
  const effectiveCountB = effectiveTeamBPlayers.filter(isSelected).length;

  const toggle = (sourceTeam: 'A' | 'B', playerId: number) => {
    if (!teamA || !teamB) return;
    const current = sourceTeam === 'A' ? draft.teamAPlayerIds : draft.teamBPlayerIds;
    const currentlySelected = current.includes(playerId);
    const move = switchMap.get(playerId);
    const effectiveTeam: 'A' | 'B' = move?.toTeamId === teamA.id
      ? 'A'
      : move?.toTeamId === teamB.id
        ? 'B'
        : sourceTeam;
    const effectiveCount = effectiveTeam === 'A' ? effectiveCountA : effectiveCountB;

    if (currentlySelected && effectiveCount <= MIN_MATCH_PLAYERS) {
      Alert.alert('Minimum team size', 'Keep at least 2 available players selected for each effective match team.');
      return;
    }
    if (!currentlySelected && effectiveCount >= MAX_MATCH_PLAYERS) {
      Alert.alert('Maximum match squad', 'A match can have at most 16 available players per team. Deselect one player before selecting another.');
      return;
    }

    const next = currentlySelected ? current.filter(id => id !== playerId) : [...current, playerId];
    const nextA = sourceTeam === 'A' ? next : draft.teamAPlayerIds;
    const nextB = sourceTeam === 'B' ? next : draft.teamBPlayerIds;
    const active = new Set([...nextA, ...nextB]);
    onChange({
      ...draft,
      teamAPlayerIds: nextA,
      teamBPlayerIds: nextB,
      switches: draft.switches.filter(shuffle => active.has(shuffle.playerId)),
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
          <ScreenHeader title="Available Players" subtitle="Step 3 of 3 • Match-day squad" onBack={onBack} />
          <Empty text="Loading team players…" />
        </ScrollView>
      </View>
    );
  }

  const canStart = effectiveCountA >= MIN_MATCH_PLAYERS && effectiveCountA <= MAX_MATCH_PLAYERS
    && effectiveCountB >= MIN_MATCH_PLAYERS && effectiveCountB <= MAX_MATCH_PLAYERS;

  const renderTeam = (teamName: string, teamBankCount: number, players: EffectivePlayer[], selectedCount: number) => (
    <>
      <Text style={styles.section}>{teamName}</Text>
      <Card style={styles.teamCard}>
        <View style={styles.teamHeader}>
          <Text style={styles.teamCount}>{selectedCount}/{MAX_MATCH_PLAYERS} selected</Text>
          <Text style={styles.hint}>{teamBankCount} in Team Bank</Text>
        </View>
        <View style={styles.chips}>
          {players.map(item => (
            <Chip
              key={`${item.sourceTeam}-${item.player.id}`}
              label={item.player.name}
              selected={isSelected(item)}
              onPress={() => toggle(item.sourceTeam, item.player.id)}
            />
          ))}
        </View>
      </Card>
    </>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="Available Players" subtitle="Step 3 of 3 • Match-day squad" onBack={onBack} />

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>Select today's available players</Text>
          <Text style={styles.helper}>Up to the first 16 players from each Team Bank squad are selected by default. Deselect anyone unavailable as needed. A match can carry up to 16 available players per side, while no more than 11 unique players may bat and no more than 11 unique players may bowl in an innings.</Text>
        </Card>

        {renderTeam(teamA.name, teamA.players.length, effectiveTeamAPlayers, effectiveCountA)}
        {renderTeam(teamB.name, teamB.players.length, effectiveTeamBPlayers, effectiveCountB)}

        {draft.switches.length ? (
          <Card style={styles.shuffleSummary}>
            <Text style={styles.shuffleTitle}>{draft.switches.length} match-only shuffle{draft.switches.length === 1 ? '' : 's'} configured</Text>
            <Text style={styles.helper}>The team lists above already reflect these match-only moves. Permanent Team Bank membership is unchanged.</Text>
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
