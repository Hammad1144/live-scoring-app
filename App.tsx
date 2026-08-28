import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { getCurrentInnings, getMatch } from './src/data/database';
import { initDatabaseV14 } from './src/data/v14Core';
import { colors } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayersScreen } from './src/screens/PlayersScreen';
import { TeamsScreen } from './src/screens/TeamsScreen';
import { TeamEditorScreen } from './src/screens/TeamEditorScreen';
import { MatchSetupScreen } from './src/screens/MatchSetupScreen';
import { InningsSetupScreen } from './src/screens/InningsSetupScreen';
import { ScoringScreen } from './src/screens/ScoringScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { MatchDetailScreen } from './src/screens/MatchDetailScreen';
import { LeaderboardsScreen } from './src/screens/LeaderboardsScreen';
import { SeasonsScreen } from './src/screens/SeasonsScreen';
import { SeasonDetailScreen } from './src/screens/SeasonDetailScreen';
import { PlayerProfileScreen } from './src/screens/PlayerProfileScreen';

type Screen = 'home' | 'players' | 'teams' | 'teamEditor' | 'matchSetup' | 'inningsSetup' | 'scoring' | 'history' | 'matchDetail' | 'leaderboards' | 'seasons' | 'seasonDetail' | 'playerProfile';

function AppContent() {
  const db = useSQLiteContext();
  const [screen, setScreen] = useState<Screen>('home');
  const [teamEditId, setTeamEditId] = useState<number | undefined>();
  const [matchId, setMatchId] = useState<number | null>(null);
  const [matchReturn, setMatchReturn] = useState<Screen>('history');
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [seasonReturn, setSeasonReturn] = useState<Screen>('home');
  const [playerName, setPlayerName] = useState('');
  const [playerSeasonId, setPlayerSeasonId] = useState<number | null>(null);
  const [playerReturn, setPlayerReturn] = useState<Screen>('leaderboards');

  const navigate = (s: string) => {
    if (s === 'seasons') setSeasonReturn('home');
    setScreen(s as Screen);
  };
  const openTeam = (id?: number) => { setTeamEditId(id); setScreen('teamEditor'); };
  const openSeason = (id: number) => { setSeasonId(id); setScreen('seasonDetail'); };
  const openPlayer = (name: string, selectedSeasonId: number | null, returnTo: Screen) => {
    setPlayerName(name);
    setPlayerSeasonId(selectedSeasonId);
    setPlayerReturn(returnTo);
    setScreen('playerProfile');
  };
  const openMatch = async (id: number, returnTo: Screen = 'history') => {
    setMatchId(id);
    setMatchReturn(returnTo);
    const match = await getMatch(db, id);
    if (match.status === 'COMPLETE') return setScreen('matchDetail');
    const innings = await getCurrentInnings(db, id);
    if (!innings.striker_id || !innings.non_striker_id || !innings.bowler_id) setScreen('inningsSetup');
    else setScreen('scoring');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {screen === 'home' && <HomeScreen onNavigate={navigate} onOpenMatch={(id) => openMatch(id, 'home')} />}
      {screen === 'players' && <PlayersScreen onBack={() => setScreen('home')} />}
      {screen === 'teams' && <TeamsScreen onBack={() => setScreen('home')} onEdit={openTeam} />}
      {screen === 'teamEditor' && <TeamEditorScreen teamId={teamEditId} onBack={() => setScreen('teams')} onSaved={() => setScreen('teams')} />}
      {screen === 'matchSetup' && <MatchSetupScreen onBack={() => setScreen('home')} onTeams={() => setScreen('teams')} onSeasons={() => { setSeasonReturn('matchSetup'); setScreen('seasons'); }} onCreated={id => { setMatchId(id); setMatchReturn('home'); setScreen('inningsSetup'); }} />}
      {screen === 'inningsSetup' && matchId != null && <InningsSetupScreen matchId={matchId} onBack={() => setScreen(matchReturn)} onReady={() => setScreen('scoring')} />}
      {screen === 'scoring' && matchId != null && <ScoringScreen matchId={matchId} onBack={() => setScreen(matchReturn)} onNeedSetup={() => setScreen('inningsSetup')} onMatchComplete={() => setScreen('matchDetail')} />}
      {screen === 'history' && <HistoryScreen onBack={() => setScreen('home')} onOpen={(id) => openMatch(id, 'history')} />}
      {screen === 'matchDetail' && matchId != null && <MatchDetailScreen matchId={matchId} onBack={() => setScreen(matchReturn)} onEdit={() => setScreen('scoring')} />}
      {screen === 'leaderboards' && <LeaderboardsScreen onBack={() => setScreen('home')} onPlayer={(name, sid) => openPlayer(name, sid, 'leaderboards')} />}
      {screen === 'seasons' && <SeasonsScreen onBack={() => setScreen(seasonReturn)} onOpen={openSeason} />}
      {screen === 'seasonDetail' && seasonId != null && <SeasonDetailScreen seasonId={seasonId} onBack={() => setScreen('seasons')} onOpenMatch={(id) => openMatch(id, 'seasonDetail')} onOpenPlayer={(name, sid) => openPlayer(name, sid, 'seasonDetail')} />}
      {screen === 'playerProfile' && playerName && <PlayerProfileScreen playerName={playerName} initialSeasonId={playerSeasonId} onBack={() => setScreen(playerReturn)} />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SQLiteProvider databaseName="local_cricket_scorer.db" onInit={initDatabaseV14}>
        <StatusBar style="light" />
        <AppContent />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg } });
