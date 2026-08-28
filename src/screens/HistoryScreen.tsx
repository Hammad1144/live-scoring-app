import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getMatchSummaries } from '../data/database';
import { deleteMatch } from '../data/matchPortability';
import { MatchSummary } from '../types';
import { shareMatchSummary, pickAndImportMatchSummary } from '../services/matchTransfer';
import { Card, Empty, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function HistoryScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (id: number, status: string) => void }) {
  const db = useSQLiteContext();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const load = () => getMatchSummaries(db).then(setMatches);
  useEffect(() => { load(); }, [db]);

  const importSummary = async () => {
    try {
      const imported = await pickAndImportMatchSummary(db);
      if (!imported) return;
      await load();
      Alert.alert('Match imported', `${imported.title} is now available in Match History. Exact-name players, teams and season data were reused where available; missing entries were added to their banks.`);
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const exportSummary = async (match: MatchSummary) => {
    try { await shareMatchSummary(db, match.id); }
    catch (e) { Alert.alert('Export failed', e instanceof Error ? e.message : String(e)); }
  };

  const remove = (match: MatchSummary) => Alert.alert(
    'Delete match history?',
    `${match.teamAName} vs ${match.teamBName} and its complete scorecard will be permanently deleted from this device.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try { await deleteMatch(db, match.id); await load(); }
          catch (e) { Alert.alert('Cannot delete match', e instanceof Error ? e.message : String(e)); }
        },
      },
    ],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Match History" subtitle="Review, export, import or remove completed matches" onBack={onBack} />
      <PrimaryButton label="Import Match Summary" onPress={importSummary} />
      <View style={{ height: 14 }} />

      {matches.length === 0 ? <Empty text="No matches yet. You can also import a .cricketmatch.json summary from another device." /> : matches.map(m => (
        <Card key={m.id} style={styles.card}>
          <Pressable onPress={() => onOpen(m.id, m.status)}>
            <Text style={styles.title}>{m.teamAName} vs {m.teamBName}</Text>
            <Text style={styles.meta}>{m.oversLimit} overs • {new Date(m.createdAt).toLocaleDateString()}</Text>
            <Text style={[styles.result, m.status !== 'COMPLETE' && { color: colors.warning }]}>{m.status === 'COMPLETE' ? m.resultText : 'In progress — tap to continue scoring'}</Text>
          </Pressable>

          {m.status === 'COMPLETE' ? (
            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={() => exportSummary(m)}><Text style={styles.actionText}>Export</Text></Pressable>
              <Pressable style={[styles.action, styles.deleteAction]} onPress={() => remove(m)}><Text style={styles.deleteText}>Delete</Text></Pressable>
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', paddingBottom: 40 },
  card: { marginBottom: 10 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  meta: { color: colors.muted, marginTop: 5, fontSize: 12 },
  result: { color: colors.primary, marginTop: 8, fontWeight: '700', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border },
  action: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { borderColor: '#74343a' },
  actionText: { color: colors.primary, fontWeight: '800' },
  deleteText: { color: colors.danger, fontWeight: '800' },
});
