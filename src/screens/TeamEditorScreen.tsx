import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPlayersV12 as getPlayers, getTeamV12 as getTeam, saveTeamV12 as saveTeam } from '../data/v12Core';
import { Player } from '../types';
import { Card, Chip, Empty, Field, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function TeamEditorScreen({ teamId, onBack, onSaved }: { teamId?: number; onBack: () => void; onSaved: () => void }) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setPlayers(await getPlayers(db));
      if (teamId) {
        const t = await getTeam(db, teamId);
        setName(t.name);
        setSelected(t.players.map(p => p.id));
        setCaptainId(t.captainId);
        setViceCaptainId(t.viceCaptainId);
      }
    })();
  }, [db, teamId]);

  const toggle = (id: number) => setSelected(s => {
    if (s.includes(id)) {
      if (captainId === id) setCaptainId(null);
      if (viceCaptainId === id) setViceCaptainId(null);
      return s.filter(x => x !== id);
    }
    return s.length < 11 ? [...s, id] : s;
  });

  const selectCaptain = (id: number) => {
    setCaptainId(current => current === id ? null : id);
    if (viceCaptainId === id) setViceCaptainId(null);
  };
  const selectViceCaptain = (id: number) => {
    setViceCaptainId(current => current === id ? null : id);
    if (captainId === id) setCaptainId(null);
  };

  const save = async () => {
    try {
      await saveTeam(db, name, selected, captainId, viceCaptainId, teamId);
      onSaved();
    } catch (e) {
      Alert.alert('Unable to save team', e instanceof Error ? e.message : String(e));
    }
  };

  const selectedPlayers = selected.map(id => players.find(p => p.id === id)).filter((p): p is Player => Boolean(p));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={teamId ? 'Edit Team' : 'Create Team'} subtitle="Select 2–11 players, then optionally assign Captain and Vice Captain." onBack={onBack} />
      <Field label="TEAM NAME" value={name} onChangeText={setName} placeholder="e.g. Karachi Strikers" />
      <View style={styles.row}><Text style={styles.section}>Squad</Text><Text style={styles.count}>{selected.length}/11 selected</Text></View>
      {players.length === 0 ? <Empty text="Add players to the Player Bank before creating a team." /> : (
        <Card><View style={styles.chips}>{players.map(p => <Chip key={p.id} label={p.name} selected={selected.includes(p.id)} onPress={() => toggle(p.id)} disabled={!selected.includes(p.id) && selected.length >= 11} />)}</View></Card>
      )}

      {selectedPlayers.length ? (
        <>
          <Text style={styles.section}>Captain</Text>
          <Card><View style={styles.chips}>{selectedPlayers.map(p => <Chip key={p.id} label={p.name} selected={captainId === p.id} onPress={() => selectCaptain(p.id)} />)}</View></Card>
          <Text style={styles.helper}>Optional. Selecting a Vice Captain automatically clears the same player as Captain.</Text>

          <Text style={styles.section}>Vice Captain</Text>
          <Card><View style={styles.chips}>{selectedPlayers.map(p => <Chip key={p.id} label={p.name} selected={viceCaptainId === p.id} onPress={() => selectViceCaptain(p.id)} />)}</View></Card>
        </>
      ) : null}

      <PrimaryButton label="Save Team" onPress={save} disabled={players.length < 2} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.text, fontSize: 18, fontWeight: '800' },
  count: { color: colors.primary, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  helper: { color: colors.muted, fontSize: 11, marginTop: -8 },
});
