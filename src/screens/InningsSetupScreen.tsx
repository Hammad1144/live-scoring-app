import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { configureInnings, getCurrentInnings, getMatchPlayers } from '../data/database';
import { createGuestPlayerForMatch } from '../data/v16Core';
import { InningsRow, Player } from '../types';
import { Card, Chip, Field, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

export function InningsSetupScreen({ matchId, onBack, onReady }: { matchId: number; onBack: () => void; onReady: () => void }) {
  const db = useSQLiteContext();
  const [innings, setInnings] = useState<InningsRow | null>(null);
  const [batters, setBatters] = useState<Player[]>([]);
  const [bowlers, setBowlers] = useState<Player[]>([]);
  const [striker, setStriker] = useState<number | null>(null);
  const [nonStriker, setNonStriker] = useState<number | null>(null);
  const [bowler, setBowler] = useState<number | null>(null);
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  const load = async () => {
    const i = await getCurrentInnings(db, matchId);
    setInnings(i);
    setBatters(await getMatchPlayers(db, matchId, i.batting_team_id));
    setBowlers(await getMatchPlayers(db, matchId, i.bowling_team_id));
    setStriker(i.striker_id);
    setNonStriker(i.non_striker_id);
    setBowler(i.bowler_id);
    return i;
  };

  useEffect(() => { load(); }, [db, matchId]);

  const addGuest = async (kind: 'batter' | 'bowler') => {
    if (!innings || !guestName.trim() || addingGuest) return;
    setAddingGuest(true);
    try {
      const teamId = kind === 'batter' ? innings.batting_team_id : innings.bowling_team_id;
      const player = await createGuestPlayerForMatch(db, matchId, teamId, guestName);
      const refreshedBatters = await getMatchPlayers(db, matchId, innings.batting_team_id);
      const refreshedBowlers = await getMatchPlayers(db, matchId, innings.bowling_team_id);
      setBatters(refreshedBatters);
      setBowlers(refreshedBowlers);
      if (kind === 'batter') {
        if (!striker) setStriker(player.id);
        else if (!nonStriker && striker !== player.id) setNonStriker(player.id);
      } else {
        setBowler(player.id);
      }
      setGuestName('');
    } catch (e) {
      Alert.alert('Unable to add guest player', e instanceof Error ? e.message : String(e));
    } finally {
      setAddingGuest(false);
    }
  };

  const save = async () => {
    if (!innings || !striker || !nonStriker || !bowler) return Alert.alert('Select players', 'Choose striker, non-striker and opening bowler.');
    try { await configureInnings(db, innings.id, striker, nonStriker, bowler); onReady(); }
    catch (e) { Alert.alert('Cannot start innings', e instanceof Error ? e.message : String(e)); }
  };
  if (!innings) return null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={`Innings ${innings.innings_no} Setup`} subtitle={innings.target ? `Target: ${innings.target}` : 'Choose opening batters and bowler'} onBack={onBack} />
      <Text style={styles.section}>Striker</Text><Card><View style={styles.chips}>{batters.map(p => <Chip key={p.id} label={p.name} selected={striker === p.id} disabled={nonStriker === p.id} onPress={() => setStriker(p.id)} />)}</View></Card>
      <Text style={styles.section}>Non-striker</Text><Card><View style={styles.chips}>{batters.map(p => <Chip key={p.id} label={p.name} selected={nonStriker === p.id} disabled={striker === p.id} onPress={() => setNonStriker(p.id)} />)}</View></Card>
      <Text style={styles.section}>Opening Bowler</Text><Card><View style={styles.chips}>{bowlers.map(p => <Chip key={p.id} label={p.name} selected={bowler === p.id} disabled={innings.last_bowler_id === p.id} onPress={() => setBowler(p.id)} />)}</View></Card>

      <Text style={styles.section}>Guest Player</Text>
      <Card style={styles.guestCard}>
        <Text style={styles.helper}>Add someone who is not in the selected team. The guest is permanently added to Player Bank and this match roster, but not to the reusable Team Bank squad.</Text>
        <Field label="GUEST PLAYER NAME" value={guestName} onChangeText={setGuestName} placeholder="Enter player name" />
        <View style={styles.guestActions}>
          <View style={styles.guestAction}><SecondaryButton label="+ Add as Batter" onPress={() => addGuest('batter')} disabled={!guestName.trim() || addingGuest} /></View>
          <View style={styles.guestAction}><SecondaryButton label="+ Add as Bowler" onPress={() => addGuest('bowler')} disabled={!guestName.trim() || addingGuest} /></View>
        </View>
      </Card>

      <PrimaryButton label="Start Innings" onPress={save} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 40 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  guestCard: { gap: 12 },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  guestActions: { flexDirection: 'row', gap: 8 },
  guestAction: { flex: 1 },
});
