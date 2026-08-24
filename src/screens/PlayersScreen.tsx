import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPlayers, renamePlayer } from '../data/database';
import { Player } from '../types';
import { Card, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function PlayersScreen({ onBack }: { onBack: () => void }) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const load = async () => { const rows = await getPlayers(db); setPlayers(rows); setDrafts(Object.fromEntries(rows.map(p => [p.id, p.name]))); };
  useEffect(() => { load(); }, [db]);

  const save = async (p: Player) => {
    try { await renamePlayer(db, p.id, drafts[p.id] ?? p.name); await load(); }
    catch (e) { Alert.alert('Unable to save', e instanceof Error ? e.message : String(e)); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Player Bank" subtitle="24 reusable local player slots" onBack={onBack} />
      {players.map(p => <Card key={p.id} style={styles.playerCard}>
        <View style={styles.number}><Text style={styles.numberText}>{p.id}</Text></View>
        <View style={{ flex: 1 }}><Field label={`PLAYER ${p.id}`} value={drafts[p.id] ?? ''} onChangeText={v => setDrafts(d => ({ ...d, [p.id]: v }))} /></View>
        <View style={{ width: 72 }}><PrimaryButton label="Save" onPress={() => save(p)} /></View>
      </Card>)}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, paddingBottom: 40 },
  playerCard: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 10 },
  number: { width: 38, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface2 },
  numberText: { color: colors.primary, fontWeight: '900' },
});
