import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Card, Empty, ScreenHeader } from '../components/UI';
import { colors } from '../theme';

type PlayerDirectoryRow = { name: string };

export function PlayerDirectoryScreen({
  onBack,
  onOpenPlayer,
}: {
  onBack: () => void;
  onOpenPlayer: (name: string) => void;
}) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<PlayerDirectoryRow[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    db.getAllAsync<PlayerDirectoryRow>(`
      SELECT name FROM (
        SELECT name FROM players
        UNION
        SELECT player_name AS name FROM match_players
      )
      WHERE TRIM(name) <> ''
      ORDER BY name COLLATE NOCASE
    `).then(setPlayers);
  }, [db]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return players;
    return players.filter(player => player.name.toLowerCase().includes(term));
  }, [players, query]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Players"
        subtitle="Search players and view performance profiles"
        onBack={onBack}
      />

      <View style={styles.searchWrap}>
        <Text style={styles.label}>SEARCH PLAYER</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by player name"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={styles.search}
        />
        <Text style={styles.count}>{filtered.length} player{filtered.length === 1 ? '' : 's'} found</Text>
      </View>

      {filtered.length === 0 ? (
        <Empty text={query.trim() ? 'No players match your search.' : 'No players available yet.'} />
      ) : filtered.map(player => (
        <Pressable key={player.name} onPress={() => onOpenPlayer(player.name)}>
          <Card style={styles.playerCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{player.name.charAt(0).toUpperCase()}</Text></View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerMeta}>View batting, bowling and fielding performance</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 50 },
  searchWrap: { gap: 7, marginBottom: 4 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  search: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  count: { color: colors.muted, fontSize: 11 },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  playerInfo: { flex: 1 },
  playerName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  playerMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  chevron: { color: colors.primary, fontSize: 28, lineHeight: 30 },
});
