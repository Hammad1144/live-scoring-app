import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getMatchSummaries } from '../data/database';
import { MatchSummary } from '../types';
import { Card, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function HistoryScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (id: number, status: string) => void }) {
  const db = useSQLiteContext();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  useEffect(() => { getMatchSummaries(db).then(setMatches); }, [db]);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Match History" subtitle="Completed and in-progress local matches" onBack={onBack} />
      {matches.length === 0 ? <Empty text="No matches yet." /> : matches.map(m => (
        <Pressable key={m.id} onPress={() => onOpen(m.id, m.status)}>
          <Card style={styles.card}>
            <Text style={styles.title}>{m.teamAName} vs {m.teamBName}</Text>
            <Text style={styles.meta}>{m.oversLimit} overs • {new Date(m.createdAt).toLocaleDateString()}</Text>
            <Text style={[styles.result, m.status !== 'COMPLETE' && { color: colors.warning }]}>{m.status === 'COMPLETE' ? m.resultText : 'In progress — tap to continue scoring'}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({ container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', paddingBottom: 40 }, card: { marginBottom: 10 }, title: { color: colors.text, fontSize: 17, fontWeight: '800' }, meta: { color: colors.muted, marginTop: 5, fontSize: 12 }, result: { color: colors.primary, marginTop: 8, fontWeight: '700', lineHeight: 18 } });
