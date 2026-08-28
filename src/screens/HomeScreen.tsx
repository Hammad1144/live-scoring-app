import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getMatchSummaries } from '../data/database';
import { MatchSummary } from '../types';
import {
  CloudSyncConflictError,
  CloudSyncStatus,
  getCloudSyncStatus,
  refreshFromCloud,
  saveToCloud,
} from '../services/cloudSync';
import { Card, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

type AccessRole = 'admin' | 'viewer';

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function summaryText(status: CloudSyncStatus | null) {
  if (!status?.summary) return 'No cloud backup saved yet.';
  const s = status.summary;
  return `${s.matches} matches • ${s.players} players • ${s.teams} teams • ${s.seasons} seasons`;
}

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
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<'save' | 'refresh' | null>(null);
  const isAdmin = role === 'admin';

  const loadMatches = () => getMatchSummaries(db).then(x => setMatches(x.slice(0, 3)));
  const loadSyncStatus = async () => {
    try {
      const status = await getCloudSyncStatus(db);
      setSyncStatus(status);
      setSyncError(null);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    loadMatches();
    loadSyncStatus();
  }, [db]);

  const showSuccess = (title: string, summary: { players: number; teams: number; seasons: number; matches: number }) => {
    Alert.alert(title, `${summary.matches} matches, ${summary.players} players, ${summary.teams} teams and ${summary.seasons} seasons are now synchronized.`);
  };

  const performSave = async (force = false) => {
    if (syncing) return;
    setSyncing('save');
    try {
      const result = await saveToCloud(db, force);
      await loadSyncStatus();
      showSuccess('Cloud data updated', result.summary);
    } catch (e) {
      if (e instanceof CloudSyncConflictError && !force) {
        Alert.alert(
          'Newer cloud data exists',
          `${e.message}\n\nCloud updated: ${formatDate(e.status.cloudUpdatedAt)}\nLocal changes: ${formatDate(e.status.localUpdatedAt)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Overwrite Cloud', style: 'destructive', onPress: () => performSave(true) },
          ],
        );
      } else {
        Alert.alert('Cloud save failed', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSyncing(null);
    }
  };

  const performRefresh = async (force = false) => {
    if (syncing) return;
    setSyncing('refresh');
    try {
      const result = await refreshFromCloud(db, force);
      await Promise.all([loadMatches(), loadSyncStatus()]);
      showSuccess('Cloud data refreshed', result.summary);
    } catch (e) {
      if (e instanceof CloudSyncConflictError && !force) {
        Alert.alert(
          'Unsaved local changes',
          `${e.message}\n\nLocal changes: ${formatDate(e.status.localUpdatedAt)}\nCloud updated: ${formatDate(e.status.cloudUpdatedAt)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace Local Data', style: 'destructive', onPress: () => performRefresh(true) },
          ],
        );
      } else {
        Alert.alert('Cloud refresh failed', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSyncing(null);
    }
  };

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

      <Card style={styles.cloudCard}>
        <View style={styles.cloudHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cloudTitle}>Cloud Sync</Text>
            <Text style={styles.cloudMeta}>{summaryText(syncStatus)}</Text>
          </View>
          <View style={[styles.syncPill, syncStatus?.localDirty ? styles.unsavedPill : null]}>
            <Text style={[styles.syncPillText, syncStatus?.localDirty ? styles.unsavedText : null]}>
              {syncStatus?.localDirty ? 'Unsaved changes' : 'Synced'}
            </Text>
          </View>
        </View>

        {syncStatus ? (
          <View style={styles.cloudFacts}>
            <Text style={styles.fact}>Cloud version: {syncStatus.cloudVersion}</Text>
            <Text style={styles.fact}>Cloud updated: {formatDate(syncStatus.cloudUpdatedAt)}</Text>
            <Text style={styles.fact}>Last synced on device: {formatDate(syncStatus.lastSyncedAt)}</Text>
          </View>
        ) : null}
        {syncError ? <Text style={styles.cloudError}>Cloud unavailable: {syncError}</Text> : null}

        <View style={styles.cloudActions}>
          <View style={{ flex: 1 }}>
            <SecondaryButton
              label={syncing === 'refresh' ? 'Refreshing…' : 'Refresh from Cloud'}
              onPress={() => performRefresh(false)}
            />
          </View>
          {isAdmin ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={syncing === 'save' ? 'Saving…' : 'Save to Cloud'}
                onPress={() => performSave(false)}
              />
            </View>
          ) : null}
        </View>
        <Text style={styles.cloudHint}>
          {isAdmin
            ? 'Save uploads the complete local state, including an in-progress match. Refresh replaces local cricket data with the latest cloud snapshot.'
            : 'View Access can refresh the latest cloud snapshot but cannot upload or change cloud data.'}
        </Text>
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
  cloudCard: { gap: 12 },
  cloudHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cloudTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cloudMeta: { color: colors.muted, fontSize: 12, marginTop: 5, lineHeight: 17 },
  syncPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  syncPillText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  unsavedPill: { borderColor: colors.warning },
  unsavedText: { color: colors.warning },
  cloudFacts: { gap: 4 },
  fact: { color: colors.muted, fontSize: 11 },
  cloudError: { color: colors.warning, fontSize: 11, lineHeight: 16 },
  cloudActions: { flexDirection: 'row', gap: 10 },
  cloudHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
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
