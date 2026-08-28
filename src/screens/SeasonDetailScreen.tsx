import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeason, getSeasonImpactRanking, getSeasonMatches } from '../data/v14Core';
import { MatchSummary, Season, SeasonRankingRow } from '../types';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

type SeasonTab = 'rankings' | 'matches';

export function SeasonDetailScreen({
  seasonId,
  onBack,
  onOpenMatch,
  onOpenPlayer,
}: {
  seasonId: number;
  onBack: () => void;
  onOpenMatch: (id: number) => void;
  onOpenPlayer: (name: string, seasonId: number) => void;
}) {
  const db = useSQLiteContext();
  const [tab, setTab] = useState<SeasonTab>('rankings');
  const [season, setSeason] = useState<Season | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [ranking, setRanking] = useState<SeasonRankingRow[]>([]);

  useEffect(() => {
    Promise.all([getSeason(db, seasonId), getSeasonMatches(db, seasonId), getSeasonImpactRanking(db, seasonId)]).then(([s, m, r]) => {
      setSeason(s);
      setMatches(m);
      setRanking(r.slice(0, 10));
    });
  }, [db, seasonId]);

  if (!season) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title={season.name} subtitle={`${season.startDate ?? '—'} → ${season.endDate ?? '—'} • ${season.matchCount} matches`} onBack={onBack} />

      <View style={styles.tabs}>
        <Chip label="Player Rankings" selected={tab === 'rankings'} onPress={() => setTab('rankings')} />
        <Chip label={`Season Matches (${matches.length})`} selected={tab === 'matches'} onPress={() => setTab('matches')} />
      </View>

      {tab === 'rankings' ? (
        <>
          <Card style={styles.info}>
            <Text style={styles.infoTitle}>Top Player of the Season</Text>
            <Text style={styles.infoText}>Top 10 players based on the Dream 11 model combining batting, bowling and fielding.</Text>
          </Card>

          {ranking.length === 0 ? <Empty text="No season performance data yet." /> : ranking.map((r, index) => (
            <Pressable key={r.name} onPress={() => onOpenPlayer(r.name, seasonId)}>
              <Card style={styles.rankCard}>
                <View style={styles.rankBadge}><Text style={styles.rankNo}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.player}>{r.name}</Text>
                  <Text style={styles.breakdown}>{r.matches} matches • Bat {r.battingPoints} • Bowl {r.bowlingPoints} • Field {r.fieldingPoints}</Text>
                </View>
                <Text style={styles.points}>{r.totalPoints}</Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          {matches.length === 0 ? <Empty text="No matches have been assigned to this season yet." /> : matches.map(m => (
            <Pressable key={m.id} onPress={() => onOpenMatch(m.id)}>
              <Card style={styles.matchCard}>
                <Text style={styles.matchTitle}>{m.teamAName} vs {m.teamBName}</Text>
                <Text style={styles.matchMeta}>{m.oversLimit} overs • {m.status === 'COMPLETE' ? (m.resultText ?? 'Complete') : 'In progress'}</Text>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 50 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border },
  info: { backgroundColor: '#0e2b1f' },
  infoTitle: { color: colors.primary, fontWeight: '900', fontSize: 16 },
  infoText: { color: colors.muted, marginTop: 7, lineHeight: 18, fontSize: 12 },
  rankCard: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rankNo: { color: colors.primary, fontWeight: '900' },
  player: { color: colors.text, fontWeight: '900', fontSize: 15 },
  breakdown: { color: colors.muted, fontSize: 10, marginTop: 4 },
  points: { color: colors.primary, fontSize: 23, fontWeight: '900' },
  matchCard: { marginBottom: 8 },
  matchTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  matchMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
});
