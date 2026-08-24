import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteTeam, getTeams } from '../data/database';
import { TeamSummary } from '../types';
import { Card, Empty, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function TeamsScreen({ onBack, onEdit }: { onBack: () => void; onEdit: (id?: number) => void }) {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const load = () => getTeams(db).then(setTeams);
  useEffect(() => { load(); }, [db]);

  const remove = (team: TeamSummary) => Alert.alert('Delete team?', `${team.name} will be removed from the Team Bank.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteTeam(db, team.id); await load(); } catch (e) { Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e)); } } },
  ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Team Bank" subtitle="Create reusable squads from your 24 players" onBack={onBack} />
      <PrimaryButton label="+ Create Team" onPress={() => onEdit()} />
      <View style={{ height: 12 }} />
      {teams.length === 0 ? <Empty text="No teams yet. Create at least two teams before starting a match." /> : teams.map(t => (
        <Pressable key={t.id} onPress={() => onEdit(t.id)}>
          <Card style={styles.card}>
            <View style={{ flex: 1 }}><Text style={styles.name}>{t.name}</Text><Text style={styles.meta}>{t.playerCount} players</Text></View>
            <Pressable onPress={() => remove(t)} hitSlop={12}><Text style={styles.delete}>Delete</Text></Pressable>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', paddingBottom: 40 },
  card: { marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  name: { color: colors.text, fontWeight: '800', fontSize: 17 },
  meta: { color: colors.muted, marginTop: 4 },
  delete: { color: colors.danger, fontWeight: '700' },
});
