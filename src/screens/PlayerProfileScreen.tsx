import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getPlayerProfileStats, getSeasons } from '../data/v14Core';
import { PlayerProfileStats, Season } from '../types';
import { formatOvers } from '../logic/cricket';
import { Card, Chip, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

type Tab = 'batting' | 'bowling' | 'fielding';

function Stat({ label, value }: { label: string; value: string | number }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export function PlayerProfileScreen({
  playerName,
  initialSeasonId,
  onBack,
}: {
  playerName: string;
  initialSeasonId?: number | null;
  onBack: () => void;
}) {
  const db = useSQLiteContext();
  const [tab, setTab] = useState<Tab>('batting');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(initialSeasonId ?? null);
  const [stats, setStats] = useState<PlayerProfileStats | null>(null);

  useEffect(() => { getSeasons(db).then(setSeasons); }, [db]);
  useEffect(() => { getPlayerProfileStats(db, playerName, seasonId).then(setStats); }, [db, playerName, seasonId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={playerName} subtitle={stats ? `${stats.matches} match${stats.matches === 1 ? '' : 'es'} in selected scope` : 'Player performance'} onBack={onBack} />

      <Text style={styles.label}>PERIOD</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All Time" selected={seasonId == null} onPress={() => setSeasonId(null)} />
        {seasons.map(s => <Chip key={s.id} label={s.name} selected={seasonId === s.id} onPress={() => setSeasonId(s.id)} />)}
      </ScrollView>

      <View style={styles.tabs}>
        <Chip label="Batting" selected={tab === 'batting'} onPress={() => setTab('batting')} />
        <Chip label="Bowling" selected={tab === 'bowling'} onPress={() => setTab('bowling')} />
        <Chip label="Fielding" selected={tab === 'fielding'} onPress={() => setTab('fielding')} />
      </View>

      {!stats ? null : tab === 'batting' ? (
        <>
          <Card><Text style={styles.title}>Batting</Text><View style={styles.grid}>
            <Stat label="Matches" value={stats.matches} />
            <Stat label="Innings" value={stats.batting.innings} />
            <Stat label="Runs" value={stats.batting.runs} />
            <Stat label="Highest" value={stats.batting.highest} />
            <Stat label="Average" value={stats.batting.average.toFixed(2)} />
            <Stat label="Strike Rate" value={stats.batting.strikeRate.toFixed(2)} />
            <Stat label="Balls" value={stats.batting.balls} />
            <Stat label="Fours" value={stats.batting.fours} />
            <Stat label="Sixes" value={stats.batting.sixes} />
            <Stat label="Dismissals" value={stats.batting.dismissals} />
          </View></Card>
        </>
      ) : tab === 'bowling' ? (
        <Card><Text style={styles.title}>Bowling</Text><View style={styles.grid}>
          <Stat label="Matches" value={stats.matches} />
          <Stat label="Overs" value={formatOvers(stats.bowling.legalBalls)} />
          <Stat label="Wickets" value={stats.bowling.wickets} />
          <Stat label="Runs Conceded" value={stats.bowling.runs} />
          <Stat label="Economy" value={stats.bowling.economy.toFixed(2)} />
          <Stat label="Dot Balls" value={stats.bowling.dotBalls} />
          <Stat label="Best Bowling" value={`${stats.bowling.bestWickets}/${stats.bowling.bestRuns}`} />
        </View></Card>
      ) : (
        <Card><Text style={styles.title}>Fielding</Text><View style={styles.grid}>
          <Stat label="Matches" value={stats.matches} />
          <Stat label="Catches" value={stats.fielding.catches} />
          <Stat label="Run Outs" value={stats.fielding.runOuts} />
          <Stat label="Stumpings" value={stats.fielding.stumpings} />
          <Stat label="Dismissals Involved" value={stats.fielding.totalDismissals} />
        </View></Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 14, paddingBottom: 50 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  chips: { gap: 8, paddingRight: 18 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '47%', backgroundColor: colors.surface2, borderRadius: 14, padding: 14, minHeight: 82, justifyContent: 'center' },
  statValue: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 5, fontWeight: '700' },
});
