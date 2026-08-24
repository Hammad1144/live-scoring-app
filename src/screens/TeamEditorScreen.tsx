import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPlayers, getTeam, saveTeam } from '../data/database';
import { Player } from '../types';
import { Card, Chip, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function TeamEditorScreen({ teamId, onBack, onSaved }: { teamId?: number; onBack: () => void; onSaved: () => void }) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    (async () => {
      setPlayers(await getPlayers(db));
      if (teamId) { const t = await getTeam(db, teamId); setName(t.name); setSelected(t.players.map(p => p.id)); }
    })();
  }, [db, teamId]);

  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 11 ? [...s, id] : s);
  const save = async () => {
    try { await saveTeam(db, name, selected, teamId); onSaved(); }
    catch (e) { Alert.alert('Unable to save team', e instanceof Error ? e.message : String(e)); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={teamId ? 'Edit Team' : 'Create Team'} subtitle="Select 2–11 players. Selection order is the default batting order." onBack={onBack} />
      <Field label="TEAM NAME" value={name} onChangeText={setName} placeholder="e.g. Karachi Strikers" />
      <View style={styles.row}><Text style={styles.section}>Squad</Text><Text style={styles.count}>{selected.length}/11 selected</Text></View>
      <Card><View style={styles.chips}>{players.map(p => <Chip key={p.id} label={p.name} selected={selected.includes(p.id)} onPress={() => toggle(p.id)} disabled={!selected.includes(p.id) && selected.length >= 11} />)}</View></Card>
      <PrimaryButton label="Save Team" onPress={save} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.text, fontSize: 18, fontWeight: '800' },
  count: { color: colors.primary, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
