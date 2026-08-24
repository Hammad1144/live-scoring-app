import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createMatch } from '../data/database';
import { getTeamsV12 as getTeams } from '../data/v12Core';
import { TeamSummary } from '../types';
import { Card, Chip, Empty, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function MatchSetupScreen({ onBack, onCreated, onTeams }: { onBack: () => void; onCreated: (id: number) => void; onTeams: () => void }) {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamA, setTeamA] = useState<number | null>(null);
  const [teamB, setTeamB] = useState<number | null>(null);
  const [overs, setOvers] = useState(6);
  const [batFirst, setBatFirst] = useState<number | null>(null);
  useEffect(() => { getTeams(db).then(setTeams); }, [db]);

  useEffect(() => {
    if (batFirst && batFirst !== teamA && batFirst !== teamB) setBatFirst(null);
  }, [teamA, teamB, batFirst]);

  const start = async () => {
    if (!teamA || !teamB || !batFirst) return Alert.alert('Complete match setup', 'Select both teams and the team batting first.');
    try { const id = await createMatch(db, teamA, teamB, overs, batFirst); onCreated(id); }
    catch (e) { Alert.alert('Cannot start match', e instanceof Error ? e.message : String(e)); }
  };

  if (teams.length < 2) {
    return <ScrollView contentContainerStyle={styles.container}><ScreenHeader title="New Match" onBack={onBack} /><Empty text="Create at least two teams before starting a match." /><PrimaryButton label="Open Team Bank" onPress={onTeams} /></ScrollView>;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="New Match" subtitle="Matches are restricted to 1–10 overs" onBack={onBack} />
      <Text style={styles.section}>Team A</Text>
      <Card><View style={styles.chips}>{teams.map(t => <Chip key={t.id} label={`${t.name} (${t.playerCount})`} selected={teamA === t.id} disabled={teamB === t.id} onPress={() => setTeamA(t.id)} />)}</View></Card>
      <Text style={styles.section}>Team B</Text>
      <Card><View style={styles.chips}>{teams.map(t => <Chip key={t.id} label={`${t.name} (${t.playerCount})`} selected={teamB === t.id} disabled={teamA === t.id} onPress={() => setTeamB(t.id)} />)}</View></Card>
      <Text style={styles.section}>Overs</Text>
      <Card><View style={styles.chips}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <Chip key={n} label={`${n}`} selected={overs === n} onPress={() => setOvers(n)} />)}</View></Card>
      <Text style={styles.section}>Batting first</Text>
      <Card><View style={styles.chips}>
        {teamA ? <Chip label={teams.find(t => t.id === teamA)?.name ?? 'Team A'} selected={batFirst === teamA} onPress={() => setBatFirst(teamA)} /> : null}
        {teamB ? <Chip label={teams.find(t => t.id === teamB)?.name ?? 'Team B'} selected={batFirst === teamB} onPress={() => setBatFirst(teamB)} /> : null}
      </View></Card>
      <PrimaryButton label={`Start ${overs}-Over Match`} onPress={start} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 40 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
