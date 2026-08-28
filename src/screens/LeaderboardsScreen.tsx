import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getLeaderboardsV12 as getLeaderboards } from '../data/leaderboardsV12';
import { LeaderboardRow } from '../types';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

type Board = 'runs' | 'sixes' | 'wickets' | 'catches' | 'economy';
type BoardsData = {
  topScorers: LeaderboardRow[];
  mostSixes: LeaderboardRow[];
  mostWickets: LeaderboardRow[];
  mostCatches: LeaderboardRow[];
  bestEconomy: LeaderboardRow[];
};

export function LeaderboardsScreen({ onBack }: { onBack: () => void }) {
  const db = useSQLiteContext();
  const [board, setBoard] = useState<Board>('runs');
  const [data, setData] = useState<BoardsData | null>(null);
  useEffect(() => { getLeaderboards(db).then(setData); }, [db]);

  const rows = board === 'runs'
    ? data?.topScorers
    : board === 'sixes'
      ? data?.mostSixes
      : board === 'wickets'
        ? data?.mostWickets
        : board === 'catches'
          ? data?.mostCatches
          : data?.bestEconomy;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Leaderboards" subtitle="Career statistics with match-count reference" onBack={onBack} />
      <View style={styles.chips}>
        <Chip label="Top Scorer" selected={board === 'runs'} onPress={() => setBoard('runs')} />
        <Chip label="Most Sixes" selected={board === 'sixes'} onPress={() => setBoard('sixes')} />
        <Chip label="Most Wickets" selected={board === 'wickets'} onPress={() => setBoard('wickets')} />
        <Chip label="Most Catches" selected={board === 'catches'} onPress={() => setBoard('catches')} />
        <Chip label="Best Economy" selected={board === 'economy'} onPress={() => setBoard('economy')} />
      </View>
      <View style={{ height: 10 }} />
      {!rows?.length
        ? <Empty text={board === 'economy' ? 'No qualifying bowlers yet. Minimum 1 completed over.' : 'No statistics yet.'} />
        : rows.map((r, i) => (
          <Card key={`${r.name}-${i}`} style={styles.row}>
            <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.name}</Text>
              {r.secondary ? <Text style={styles.secondary}>{r.secondary}</Text> : null}
            </View>
            <Text style={styles.value}>{board === 'economy' ? r.value.toFixed(2) : r.value}</Text>
          </Card>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', paddingBottom: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.primary, fontWeight: '900' },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  secondary: { color: colors.muted, marginTop: 3, fontSize: 11 },
  value: { color: colors.primary, fontWeight: '900', fontSize: 22 },
});
