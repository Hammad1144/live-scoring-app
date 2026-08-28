import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getMatchSummaries } from '../data/database';
import { MatchSummary } from '../types';
import { Card, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

type AccessRole = 'admin' | 'viewer';

export function HomeScreen({
  onNavigate,
  onOpenMatch,
  role,
  onLogout,
}: {
  onNavigate: (screen: string) => void;
  onOpenMatch: (id: number) => void;
  role: AccessRole;
  onLogout: () => void;
}) {
  const db = useSQLiteContext();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const isAdmin = role === 'admin';

  useEffect(() => { getMatchSummaries(db).then(x => setMatches(x.slice(0, 3))); }, [db]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Cricket Zone App"
        subtitle={isAdmin ? 'Admin access • Full scoring controls' : 'View access • Read-only cricket records'}
      />

      <Card style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.eyebrow}>{isAdmin ? 'ADMIN MODE' : 'VIEW ONLY'}</Text>
          <View style={styles.rolePill}><Text style={styles.rolePillText}>{isAdmin ? 'Admin' : 'Viewer'}</Text></View>
        </View>
        <Text style={styles.heroTitle}>{isAdmin ? 'Start a 1–10 over match' : 'Follow matches and player performance'}</Text>
        <Text style={styles.heroText}>
          {isAdmin
            ? 'Score matches, manage players and teams, organize seasons, and review performance.'
            : 'Browse match summaries, season rankings, leaderboards and player profiles. No data can be changed in View Access.'}
        </Text>
        {isAdmin ? <PrimaryButton label="+ New Match" onPress={() => onNavigate('matchSetup')} /> : null}
      </Card>

      <Text style={styles.section}>{isAdmin ? 'Manage' : 'Browse'}</Text>
      <View style={styles.grid}>
        {isAdmin ? (
          <>
            <Pressable style={styles.tile} onPress={() => onNavigate('players')}><Text style={styles.tileIcon}>👤</Text><Text style={styles.tileTitle}>Player Bank</Text><Text style={styles.tileMeta}>Up to 30 players</Text></Pressable>
            <Pressable style={styles.tile} onPress={() => onNavigate('teams')}><Text style={styles.tileIcon}>🛡️</Text><Text style={styles.tileTitle}>Team Bank</Text><Text style={styles.tileMeta}>Reusable squads</Text></Pressable>
          </>
        ) : null}
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

      <View style={styles.logoutWrap}>
        <SecondaryButton label="Sign Out / Switch Access" onPress={onLogout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: colors.bg, gap: 14 },
  hero: { gap: 12, padding: 20 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  rolePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  rolePillText: { color: colors.text, fontSize: 10, fontWeight: '800' },
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
  logoutWrap: { marginTop: 8 },
});
