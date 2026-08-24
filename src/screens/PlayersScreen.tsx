import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createPlayer, deletePlayer, getPlayersV12 as getPlayers, renamePlayerV12 as renamePlayer } from '../data/v12Core';
import { Player } from '../types';
import { Card, Empty, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

const MAX_PLAYERS = 30;

export function PlayersScreen({ onBack }: { onBack: () => void }) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState('');

  const load = async () => {
    const rows = await getPlayers(db);
    setPlayers(rows);
    setDrafts(Object.fromEntries(rows.map(p => [p.id, p.name])));
  };
  useEffect(() => { load(); }, [db]);

  const add = async () => {
    try {
      await createPlayer(db, newName);
      setNewName('');
      await load();
    } catch (e) {
      Alert.alert('Unable to add player', e instanceof Error ? e.message : String(e));
    }
  };

  const save = async (p: Player) => {
    try {
      await renamePlayer(db, p.id, drafts[p.id] ?? p.name);
      await load();
    } catch (e) {
      Alert.alert('Unable to save', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (p: Player) => Alert.alert(
    'Delete player?',
    `${p.name} will be removed from the Player Bank. Historical match scorecards keep their saved player snapshot.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deletePlayer(db, p.id); await load(); }
          catch (e) { Alert.alert('Cannot delete player', e instanceof Error ? e.message : String(e)); }
        },
      },
    ],
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Player Bank" subtitle={`Add players manually • ${players.length}/${MAX_PLAYERS} used`} onBack={onBack} />

      <Card style={styles.addCard}>
        <Field label="NEW PLAYER" value={newName} onChangeText={setNewName} placeholder="Enter player name" />
        <PrimaryButton label="+ Add Player" onPress={add} disabled={players.length >= MAX_PLAYERS || !newName.trim()} />
        {players.length >= MAX_PLAYERS ? <Text style={styles.limit}>Maximum 30 players reached.</Text> : null}
      </Card>

      <Text style={styles.section}>Players</Text>
      {players.length === 0 ? <Empty text="No players yet. Add your first player above." /> : players.map((p, index) => (
        <Card key={p.id} style={styles.playerCard}>
          <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
          <View style={styles.field}><Field label="PLAYER NAME" value={drafts[p.id] ?? ''} onChangeText={v => setDrafts(d => ({ ...d, [p.id]: v }))} /></View>
          <View style={styles.actions}>
            <Pressable style={styles.save} onPress={() => save(p)}><Text style={styles.saveText}>Save</Text></Pressable>
            <Pressable onPress={() => remove(p)} hitSlop={10}><Text style={styles.delete}>Delete</Text></Pressable>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, paddingBottom: 40, minHeight: '100%' },
  addCard: { gap: 12, marginBottom: 18 },
  limit: { color: colors.warning, fontSize: 12, textAlign: 'center' },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  number: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surface2 },
  numberText: { color: colors.primary, fontWeight: '900' },
  field: { flex: 1 },
  actions: { width: 64, gap: 10, alignItems: 'center' },
  save: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  saveText: { color: '#052015', fontWeight: '800', fontSize: 12 },
  delete: { color: colors.danger, fontWeight: '700', fontSize: 12 },
});
