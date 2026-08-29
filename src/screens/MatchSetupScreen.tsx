import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSeasons } from '../data/v14Core';
import { getTeamV12, getTeamsV12 as getTeams } from '../data/v12Core';
import { MatchPlayerSwitch } from '../data/v16Core';
import { createMatchV17, getSeasonRounds, SeasonRound } from '../data/v17Core';
import { Season, Team, TeamSummary } from '../types';
import { Card, Chip, Empty, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/UI';
import { colors } from '../theme';

export function MatchSetupScreen({ onBack, onCreated, onTeams, onSeasons }: { onBack: () => void; onCreated: (id: number) => void; onTeams: () => void; onSeasons: () => void }) {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<SeasonRound[]>([]);
  const [seasonRoundId, setSeasonRoundId] = useState<number | null>(null);
  const [teamA, setTeamA] = useState<number | null>(null);
  const [teamB, setTeamB] = useState<number | null>(null);
  const [teamAData, setTeamAData] = useState<Team | null>(null);
  const [teamBData, setTeamBData] = useState<Team | null>(null);
  const [switchTargets, setSwitchTargets] = useState<Record<number, number>>({});
  const [overs, setOvers] = useState(6);
  const [batFirst, setBatFirst] = useState<number | null>(null);

  useEffect(() => { Promise.all([getTeams(db), getSeasons(db)]).then(([t, s]) => { setTeams(t); setSeasons(s); }); }, [db]);

  useEffect(() => {
    setSeasonRoundId(null);
    if (seasonId == null) {
      setRounds([]);
      return;
    }
    getSeasonRounds(db, seasonId).then(setRounds);
  }, [db, seasonId]);

  useEffect(() => {
    if (batFirst && batFirst !== teamA && batFirst !== teamB) setBatFirst(null);
  }, [teamA, teamB, batFirst]);

  useEffect(() => {
    setSwitchTargets({});
    Promise.all([
      teamA ? getTeamV12(db, teamA) : Promise.resolve(null),
      teamB ? getTeamV12(db, teamB) : Promise.resolve(null),
    ]).then(([a, b]) => { setTeamAData(a); setTeamBData(b); });
  }, [db, teamA, teamB]);

  const toggleSwitch = (playerId: number, targetTeamId: number) => {
    setSwitchTargets(current => {
      const next = { ...current };
      if (next[playerId] === targetTeamId) delete next[playerId];
      else next[playerId] = targetTeamId;
      return next;
    });
  };

  const start = async () => {
    if (!teamA || !teamB || !batFirst) return Alert.alert('Complete match setup', 'Select both teams and the team batting first.');
    if (seasonId != null && seasonRoundId == null) {
      return Alert.alert('Select round / week', rounds.length ? 'Select the round / week this season match belongs to.' : 'Create a round / week inside the selected season before starting a season match.');
    }
    const switches: MatchPlayerSwitch[] = [];
    for (const p of teamAData?.players ?? []) {
      if (switchTargets[p.id] === teamB) switches.push({ playerId: p.id, fromTeamId: teamA, toTeamId: teamB });
    }
    for (const p of teamBData?.players ?? []) {
      if (switchTargets[p.id] === teamA) switches.push({ playerId: p.id, fromTeamId: teamB, toTeamId: teamA });
    }
    try {
      const id = await createMatchV17(db, teamA, teamB, overs, batFirst, seasonId, seasonRoundId, switches);
      onCreated(id);
    } catch (e) {
      Alert.alert('Cannot start match', e instanceof Error ? e.message : String(e));
    }
  };

  if (teams.length < 2) {
    return <ScrollView contentContainerStyle={styles.container}><ScreenHeader title="New Match" onBack={onBack} /><Empty text="Create at least two teams before starting a match." /><PrimaryButton label="Open Team Bank" onPress={onTeams} /></ScrollView>;
  }

  const teamAName = teams.find(t => t.id === teamA)?.name ?? 'Team A';
  const teamBName = teams.find(t => t.id === teamB)?.name ?? 'Team B';
  const switchedFromA = (teamAData?.players ?? []).filter(p => switchTargets[p.id] === teamB).length;
  const switchedFromB = (teamBData?.players ?? []).filter(p => switchTargets[p.id] === teamA).length;
  const effectiveA = (teamAData?.players.length ?? 0) - switchedFromA + switchedFromB;
  const effectiveB = (teamBData?.players.length ?? 0) - switchedFromB + switchedFromA;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="New Match" subtitle="Matches are restricted to 1–10 overs" onBack={onBack} />

      <Text style={styles.section}>Season</Text>
      <Card>
        <View style={styles.chips}>
          <Chip label="No Season" selected={seasonId == null} onPress={() => setSeasonId(null)} />
          {seasons.map(s => <Chip key={s.id} label={s.name} selected={seasonId === s.id} onPress={() => setSeasonId(s.id)} />)}
        </View>
        {seasons.length === 0 ? <Text style={styles.helper}>No seasons available yet. You can still score an unassigned match.</Text> : null}
      </Card>

      {seasonId != null ? (
        <>
          <Text style={styles.section}>Round / Week</Text>
          <Card style={styles.roundCard}>
            {rounds.length ? (
              <View style={styles.chips}>
                {rounds.map(round => (
                  <Chip
                    key={round.id}
                    label={`${round.name} (${round.matchCount})`}
                    selected={seasonRoundId === round.id}
                    onPress={() => setSeasonRoundId(round.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.helper}>This season has no rounds / weeks yet. Create one before starting a season match.</Text>
            )}
            <Text style={styles.helper}>Every new season match must belong to a round / week so season history stays organized across the 7–10 week competition.</Text>
          </Card>
        </>
      ) : null}

      <SecondaryButton label="Manage Seasons & Rounds" onPress={onSeasons} />

      <Text style={styles.section}>Team A</Text>
      <Card><View style={styles.chips}>{teams.map(t => <Chip key={t.id} label={`${t.name} (${t.playerCount})`} selected={teamA === t.id} disabled={teamB === t.id} onPress={() => setTeamA(t.id)} />)}</View></Card>
      <Text style={styles.section}>Team B</Text>
      <Card><View style={styles.chips}>{teams.map(t => <Chip key={t.id} label={`${t.name} (${t.playerCount})`} selected={teamB === t.id} disabled={teamA === t.id} onPress={() => setTeamB(t.id)} />)}</View></Card>

      {teamAData && teamBData ? (
        <>
          <Text style={styles.section}>Match-only player switches</Text>
          <Card style={styles.switchCard}>
            <Text style={styles.helper}>Lend a player to the opposite side for this match only. Team Bank squads are not changed, while the player keeps the same profile and career statistics.</Text>
            <Text style={styles.switchSummary}>{teamAName}: {effectiveA} players • {teamBName}: {effectiveB} players</Text>
            <Text style={styles.subsection}>{teamAName} → {teamBName}</Text>
            <View style={styles.chips}>
              {teamAData.players.map(p => <Chip key={p.id} label={p.name} selected={switchTargets[p.id] === teamB} onPress={() => toggleSwitch(p.id, teamB!)} />)}
            </View>
            <Text style={styles.subsection}>{teamBName} → {teamAName}</Text>
            <View style={styles.chips}>
              {teamBData.players.map(p => <Chip key={p.id} label={p.name} selected={switchTargets[p.id] === teamA} onPress={() => toggleSwitch(p.id, teamA!)} />)}
            </View>
          </Card>
        </>
      ) : null}

      <Text style={styles.section}>Overs</Text>
      <Card><View style={styles.chips}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <Chip key={n} label={`${n}`} selected={overs === n} onPress={() => setOvers(n)} />)}</View></Card>
      <Text style={styles.section}>Batting first</Text>
      <Card><View style={styles.chips}>
        {teamA ? <Chip label={teamAName} selected={batFirst === teamA} onPress={() => setBatFirst(teamA)} /> : null}
        {teamB ? <Chip label={teamBName} selected={batFirst === teamB} onPress={() => setBatFirst(teamB)} /> : null}
      </View></Card>
      <PrimaryButton label={`Start ${overs}-Over Match`} onPress={start} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: colors.bg, minHeight: '100%', gap: 12, paddingBottom: 40 },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  subsection: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  helper: { color: colors.muted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  roundCard: { gap: 10 },
  switchCard: { gap: 11 },
  switchSummary: { color: colors.primary, fontSize: 12, fontWeight: '800' },
});
