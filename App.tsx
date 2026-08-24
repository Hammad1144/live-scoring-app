import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { getCurrentInnings, getMatch } from './src/data/database';
import { initDatabaseV12 } from './src/data/v12Core';
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

type Screen = 'home' | 'players' | 'teams' | 'teamEditor' | 'matchSetup' | 'inningsSetup' | 'scoring' | 'history' | 'matchDetail' | 'leaderboards';

function AppContent() {
  const db = useSQLiteContext();
  const [screen, setScreen] = useState<Screen>('home');
  const [teamEditId, setTeamEditId] = useState<number | undefined>();
  const [matchId, setMatchId] = useState<number | null>(null);

  const navigate = (s: string) => setScreen(s as Screen);
  const openTeam = (id?: number) => { setTeamEditId(id); setScreen('teamEditor'); };
  const openMatch = async (id: number) => {
    setMatchId(id);
    const match = await getMatch(db, id);
    if (match.status === 'COMPLETE') return setScreen('matchDetail');
    const innings = await getCurrentInnings(db, id);
    if (!innings.striker_id || !innings.non_striker_id || !innings.bowler_id) setScreen('inningsSetup');
    else setScreen('scoring');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {screen === 'home' && <HomeScreen onNavigate={navigate} onOpenMatch={openMatch} />}
      {screen === 'players' && <PlayersScreen onBack={() => setScreen('home')} />}
      {screen === 'teams' && <TeamsScreen onBack={() => setScreen('home')} onEdit={openTeam} />}
      {screen === 'teamEditor' && <TeamEditorScreen teamId={teamEditId} onBack={() => setScreen('teams')} onSaved={() => setScreen('teams')} />}
      {screen === 'matchSetup' && <MatchSetupScreen onBack={() => setScreen('home')} onTeams={() => setScreen('teams')} onCreated={id => { setMatchId(id); setScreen('inningsSetup'); }} />}
      {screen === 'inningsSetup' && matchId != null && <InningsSetupScreen matchId={matchId} onBack={() => setScreen('home')} onReady={() => setScreen('scoring')} />}
      {screen === 'scoring' && matchId != null && <ScoringScreen matchId={matchId} onBack={() => setScreen('home')} onNeedSetup={() => setScreen('inningsSetup')} onMatchComplete={() => setScreen('matchDetail')} />}
      {screen === 'history' && <HistoryScreen onBack={() => setScreen('home')} onOpen={(id) => openMatch(id)} />}
      {screen === 'matchDetail' && matchId != null && <MatchDetailScreen matchId={matchId} onBack={() => setScreen('history')} />}
      {screen === 'leaderboards' && <LeaderboardsScreen onBack={() => setScreen('home')} />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SQLiteProvider databaseName="local_cricket_scorer.db" onInit={initDatabaseV12}>
        <StatusBar style="light" />
        <AppContent />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg } });
