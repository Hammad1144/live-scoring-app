import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { configureInnings, getCurrentInnings, getMatchPlayers } from '../data/database';
import { InningsRow, Player } from '../types';
import { Card, Chip, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function InningsSetupScreen({ matchId, onBack, onReady }: { matchId: number; onBack: () => void; onReady: () => void }) {
  const db = useSQLiteContext();
  const [innings, setInnings] = useState<InningsRow | null>(null);
  const [batters, setBatters] = useState<Player[]>([]);
  const [bowlers, setBowlers] = useState<Player[]>([]);
  const [striker, setStriker] = useState<number | null>(null);
  const [nonStriker, setNonStriker] = useState<number | null>(null);
  const [bowler, setBowler] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const i = await getCurrentInnings(db, matchId); setInnings(i);
      setBatters(await getMatchPlayers(db, matchId, i.batting_team_id));
      setBowlers(await getMatchPlayers(db, matchId, i.bowling_team_id));
      setStriker(i.striker_id); setNonStriker(i.non_striker_id); setBowler(i.bowler_id);
    })();
  }, [db, matchId]);

  const save = async () => {
    if (!innings || !striker || !nonStriker || !bowler) return Alert.alert('Select players', 'Choose striker, non-striker and opening bowler.');
    try { await configureInnings(db, innings.id, striker, nonStriker, bowler); onReady(); }
    catch (e) { Alert.alert('Cannot start innings', e instanceof Error ? e.message : String(e)); }
  };
  if (!innings) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={`Innings ${innings.innings_no} Setup`} subtitle={innings.target ? `Target: ${innings.target}` : 'Choose opening batters and bowler'} onBack={onBack} />
      <Text style={styles.section}>Striker</Text><Card><View style={styles.chips}>{batters.map(p => <Chip key={p.id} label={p.name} selected={striker === p.id} disabled={nonStriker === p.id} onPress={() => setStriker(p.id)} />)}</View></Card>
      <Text style={styles.section}>Non-striker</Text><Card><View style={styles.chips}>{batters.map(p => <Chip key={p.id} label={p.name} selected={nonStriker === p.id} disabled={striker === p.id} onPress={() => setNonStriker(p.id)} />)}</View></Card>
      <Text style={styles.section}>Opening Bowler</Text><Card><View style={styles.chips}>{bowlers.map(p => <Chip key={p.id} label={p.name} selected={bowler === p.id} disabled={innings.last_bowler_id === p.id} onPress={() => setBowler(p.id)} />)}</View></Card>
      <PrimaryButton label="Start Innings" onPress={save} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({ container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 40 }, section: { color: colors.text, fontSize: 16, fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
