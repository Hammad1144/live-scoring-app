import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getMatchSummaries } from '../data/database';
import { MatchSummary } from '../types';
import { Card, PrimaryButton, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

export function HomeScreen({ onNavigate, onOpenMatch }: { onNavigate: (screen: string) => void; onOpenMatch: (id: number) => void }) {
  const db = useSQLiteContext();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  useEffect(() => { getMatchSummaries(db).then(x => setMatches(x.slice(0, 3))); }, [db]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="Local Cricket Scorer" subtitle="Fast, offline ball-by-ball scoring" />
      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>READY TO SCORE</Text>
        <Text style={styles.heroTitle}>Start a 1–10 over match</Text>
        <Text style={styles.heroText}>SQLite-backed scoring with legal-ball tracking, extras, wickets, scorecards, seasons and player performance.</Text>
        <PrimaryButton label="+ New Match" onPress={() => onNavigate('matchSetup')} />
      </Card>

      <Text style={styles.section}>Manage</Text>
      <View style={styles.grid}>
        <Pressable style={styles.tile} onPress={() => onNavigate('players')}><Text style={styles.tileIcon}>👤</Text><Text style={styles.tileTitle}>Player Bank</Text><Text style={styles.tileMeta}>Up to 30 players</Text></Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate('teams')}><Text style={styles.tileIcon}>🛡️</Text><Text style={styles.tileTitle}>Team Bank</Text><Text style={styles.tileMeta}>Reusable squads</Text></Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate('seasons')}><Text style={styles.tileIcon}>🗓️</Text><Text style={styles.tileTitle}>Seasons</Text><Text style={styles.tileMeta}>Matches & rankings</Text></Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate('history')}><Text style={styles.tileIcon}>📋</Text><Text style={styles.tileTitle}>Match History</Text><Text style={styles.tileMeta}>Previous scorecards</Text></Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate('leaderboards')}><Text style={styles.tileIcon}>🏆</Text><Text style={styles.tileTitle}>Leaderboards</Text><Text style={styles.tileMeta}>All-time & seasons</Text></Pressable>
      </View>

      <View style={styles.sectionRow}><Text style={styles.section}>Recent Matches</Text><Pressable onPress={() => onNavigate('history')}><Text style={styles.link}>View all</Text></Pressable></View>
      {matches.length === 0 ? <Card><Text style={styles.empty}>No matches scored yet.</Text></Card> : matches.map(m => (
        <Pressable key={m.id} onPress={() => onOpenMatch(m.id)}>
          <Card style={{ marginBottom: 10 }}>
            <Text style={styles.matchTitle}>{m.teamAName} vs {m.teamBName}</Text>
            <Text style={styles.matchMeta}>{m.oversLimit} overs • {m.status === 'COMPLETE' ? m.resultText : 'In progress'}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: colors.bg, gap: 14 },
  hero: { gap: 12, padding: 20 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  heroTitle: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  heroText: { color: colors.muted, lineHeight: 21, marginBottom: 4 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', minHeight: 130, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, justifyContent: 'space-between' },
  tileIcon: { fontSize: 25 },
  tileTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  tileMeta: { color: colors.muted, fontSize: 12 },
  matchTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  matchMeta: { color: colors.muted, marginTop: 5, fontSize: 13 },
  empty: { color: colors.muted },
});
