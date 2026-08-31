import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getTeamsV12 as getTeams } from '../data/v12Core';
import { TeamSummary } from '../types';
import { Card, Chip, Empty, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';
import type { MatchSetupDraft } from './matchSetupDraft';

export function MatchTeamsSetupScreen({
  draft,
  onChange,
  onBack,
  onContinue,
  onTeams,
}: {
  draft: MatchSetupDraft;
  onChange: (next: MatchSetupDraft) => void;
  onBack: () => void;
  onContinue: () => void;
  onTeams: () => void;
}) {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<TeamSummary[]>([]);

  useEffect(() => { getTeams(db).then(setTeams); }, [db]);

  const selectTeamA = (teamId: number) => {
    const battingFirstTeamId = draft.battingFirstTeamId === draft.teamAId ? teamId : draft.battingFirstTeamId;
    onChange({
      ...draft,
      teamAId: teamId,
      battingFirstTeamId: battingFirstTeamId === draft.teamBId ? battingFirstTeamId : battingFirstTeamId,
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      switches: [],
    });
  };

  const selectTeamB = (teamId: number) => {
    const battingFirstTeamId = draft.battingFirstTeamId === draft.teamBId ? teamId : draft.battingFirstTeamId;
    onChange({
      ...draft,
      teamBId: teamId,
      battingFirstTeamId,
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      switches: [],
    });
  };

  useEffect(() => {
    if (draft.battingFirstTeamId != null && draft.battingFirstTeamId !== draft.teamAId && draft.battingFirstTeamId !== draft.teamBId) {
      onChange({ ...draft, battingFirstTeamId: null });
    }
  }, [draft, onChange]);

  const canContinue = Boolean(
    draft.teamAId &&
    draft.teamBId &&
    draft.teamAId !== draft.teamBId &&
    draft.battingFirstTeamId &&
    [draft.teamAId, draft.teamBId].includes(draft.battingFirstTeamId),
  );

  const teamAName = teams.find(team => team.id === draft.teamAId)?.name ?? 'Team A';
  const teamBName = teams.find(team => team.id === draft.teamBId)?.name ?? 'Team B';

  if (teams.length < 2) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.container}>
          <ScreenHeader title="New Match" subtitle="Step 2 of 3 • Teams & match settings" onBack={onBack} />
          <Empty text="Create at least two teams before continuing." />
          <SecondaryButton label="Open Team Bank" onPress={onTeams} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title="New Match" subtitle="Step 2 of 3 • Teams & match settings" onBack={onBack} />

        <Text style={styles.section}>Team A</Text>
        <Card><View style={styles.chips}>
          {teams.map(team => (
            <Chip
              key={team.id}
              label={`${team.name} (${team.playerCount})`}
              selected={draft.teamAId === team.id}
              disabled={draft.teamBId === team.id}
              onPress={() => selectTeamA(team.id)}
            />
          ))}
        </View></Card>

        <Text style={styles.section}>Team B</Text>
        <Card><View style={styles.chips}>
          {teams.map(team => (
            <Chip
              key={team.id}
              label={`${team.name} (${team.playerCount})`}
              selected={draft.teamBId === team.id}
              disabled={draft.teamAId === team.id}
              onPress={() => selectTeamB(team.id)}
            />
          ))}
        </View></Card>

        <SecondaryButton label="Manage Team Bank" onPress={onTeams} />

        <Text style={styles.section}>Overs</Text>
        <Card><View style={styles.chips}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map(value => (
            <Chip key={value} label={`${value}`} selected={draft.overs === value} onPress={() => onChange({ ...draft, overs: value })} />
          ))}
        </View></Card>

        <Text style={styles.section}>Batting first</Text>
        <Card><View style={styles.chips}>
          {draft.teamAId ? <Chip label={teamAName} selected={draft.battingFirstTeamId === draft.teamAId} onPress={() => onChange({ ...draft, battingFirstTeamId: draft.teamAId })} /> : null}
          {draft.teamBId ? <Chip label={teamBName} selected={draft.battingFirstTeamId === draft.teamBId} onPress={() => onChange({ ...draft, battingFirstTeamId: draft.teamBId })} /> : null}
        </View></Card>

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>MATCH FORMAT</Text>
          <Text style={styles.summaryValue}>{teamAName} vs {teamBName}</Text>
          <Text style={styles.summaryMeta}>{draft.overs} over{draft.overs === 1 ? '' : 's'} • {draft.battingFirstTeamId ? `${draft.battingFirstTeamId === draft.teamAId ? teamAName : teamBName} batting first` : 'Select batting first'}</Text>
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
  summaryCard: { marginTop: 4, gap: 4 },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  summaryMeta: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  footer: { padding: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
