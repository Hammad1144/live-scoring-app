import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getLeaderboardsV12 as getLeaderboards } from '../data/leaderboardsV12';
import { getSeasons } from '../data/v14Core';
import { LeaderboardRow, Season } from '../types';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

type Board = 'runs' | 'sixes' | 'wickets' | 'catches' | 'runOuts' | 'economy';
type BoardsData = {
  topScorers: LeaderboardRow[];
  mostSixes: LeaderboardRow[];
  mostWickets: LeaderboardRow[];
  mostCatches: LeaderboardRow[];
  mostRunOuts: LeaderboardRow[];
  bestEconomy: LeaderboardRow[];
};

export function LeaderboardsScreen({ onBack, onPlayer }: { onBack: () => void; onPlayer: (name: string, seasonId: number | null) => void }) {
  const db = useSQLiteContext();
  const [board, setBoard] = useState<Board>('runs');
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [data, setData] = useState<BoardsData | null>(null);

  useEffect(() => { getSeasons(db).then(setSeasons); }, [db]);
  useEffect(() => { getLeaderboards(db, seasonId).then(setData); }, [db, seasonId]);

  const rows = board === 'runs'
    ? data?.topScorers
    : board === 'sixes'
      ? data?.mostSixes
      : board === 'wickets'
        ? data?.mostWickets
        : board === 'catches'
          ? data?.mostCatches
          : board === 'runOuts'
            ? data?.mostRunOuts
            : data?.bestEconomy;

  const selectedSeason = seasons.find(s => s.id === seasonId);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Leaderboards" subtitle={seasonId == null ? 'All-time performance' : selectedSeason?.name ?? 'Season performance'} onBack={onBack} />

      <Text style={styles.filterLabel}>PERIOD</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.periodScroll}
        contentContainerStyle={styles.periodChips}
      >
        <Chip label="All Time" selected={seasonId == null} onPress={() => setSeasonId(null)} />
        {seasons.map(s => <Chip key={s.id} label={s.name} selected={seasonId === s.id} onPress={() => setSeasonId(s.id)} />)}
      </ScrollView>

      <View style={styles.divider} />

      <View style={styles.chips}>
        <Chip label="Top Scorer" selected={board === 'runs'} onPress={() => setBoard('runs')} />
        <Chip label="Most Sixes" selected={board === 'sixes'} onPress={() => setBoard('sixes')} />
        <Chip label="Most Wickets" selected={board === 'wickets'} onPress={() => setBoard('wickets')} />
        <Chip label="Most Catches" selected={board === 'catches'} onPress={() => setBoard('catches')} />
        <Chip label="Most Run Outs" selected={board === 'runOuts'} onPress={() => setBoard('runOuts')} />
        <Chip label="Best Economy" selected={board === 'economy'} onPress={() => setBoard('economy')} />
      </View>
      <View style={{ height: 10 }} />
      {!rows?.length
        ? <Empty text={board === 'economy' ? 'No qualifying bowlers yet. Minimum 1 completed over.' : 'No statistics yet.'} />
        : rows.map((r, i) => (
          <Pressable key={`${r.name}-${i}`} onPress={() => onPlayer(r.name, seasonId)}>
            <Card style={styles.row}>
              <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.name}</Text>
                {r.secondary ? <Text style={styles.secondary}>{r.secondary}</Text> : null}
                <Text style={styles.profileHint}>View profile ›</Text>
              </View>
              <Text style={styles.value}>{board === 'economy' ? r.value.toFixed(2) : r.value}</Text>
            </Card>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', paddingBottom: 40, gap: 12 },
  filterLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  periodScroll: { flexGrow: 0, flexShrink: 0, height: 42 },
  periodChips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  row: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.primary, fontWeight: '900' },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  secondary: { color: colors.muted, marginTop: 3, fontSize: 11 },
  profileHint: { color: colors.primary, fontSize: 10, marginTop: 4, fontWeight: '700' },
  value: { color: colors.primary, fontWeight: '900', fontSize: 22 },
});
