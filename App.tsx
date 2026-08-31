import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { getCurrentInnings, getMatch } from './src/data/database';
import { createMatchWithAvailability } from './src/data/matchAvailability';
import { initDatabaseV18 } from './src/data/v18Core';
import { colors } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayersScreen } from './src/screens/PlayersScreen';
import { PlayerDirectoryScreen } from './src/screens/PlayerDirectoryScreen';
import { TeamsScreen } from './src/screens/TeamsScreen';
import { TeamEditorScreen } from './src/screens/TeamEditorScreen';
import { MatchSetupScreen } from './src/screens/MatchSetupScreen';
import { MatchTeamsSetupScreen } from './src/screens/MatchTeamsSetupScreen';
import { MatchAvailabilityScreen } from './src/screens/MatchAvailabilityScreen';
import { MatchShuffleScreen } from './src/screens/MatchShuffleScreen';
import { createEmptyMatchSetupDraft } from './src/screens/matchSetupDraft';
import { InningsSetupScreen } from './src/screens/InningsSetupScreen';
import { ScoringScreenV16 } from './src/screens/ScoringScreenV16';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { MatchDetailScreen } from './src/screens/MatchDetailScreen';
import { LeaderboardsScreen } from './src/screens/LeaderboardsScreen';
import { SeasonsScreen } from './src/screens/SeasonsScreen';
import { SeasonDetailScreen } from './src/screens/SeasonDetailScreen';
import { SeasonRoundDetailScreen } from './src/screens/SeasonRoundDetailScreen';
import { PlayerProfileScreen } from './src/screens/PlayerProfileScreen';

type AccessRole = 'admin' | 'viewer';
type Screen =
  | 'home'
  | 'players'
  | 'playerDirectory'
  | 'teams'
  | 'teamEditor'
  | 'matchSetup'
  | 'matchSetupTeams'
  | 'matchSetupPlayers'
  | 'matchSetupShuffle'
  | 'inningsSetup'
  | 'scoring'
  | 'history'
  | 'matchDetail'
  | 'leaderboards'
  | 'seasons'
  | 'seasonDetail'
  | 'seasonRoundDetail'
  | 'playerProfile';

const ADMIN_ONLY_SCREENS: Screen[] = [
  'players',
  'teams',
  'teamEditor',
  'matchSetup',
  'matchSetupTeams',
  'matchSetupPlayers',
  'matchSetupShuffle',
  'inningsSetup',
  'scoring',
];

function AppContent() {
  const db = useSQLiteContext();
  const [role, setRole] = useState<AccessRole | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [teamEditId, setTeamEditId] = useState<number | undefined>();
  const [teamReturn, setTeamReturn] = useState<Screen>('home');
  const [matchId, setMatchId] = useState<number | null>(null);
  const [matchReturn, setMatchReturn] = useState<Screen>('history');
  const [matchDraft, setMatchDraft] = useState(createEmptyMatchSetupDraft());
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [seasonRoundId, setSeasonRoundId] = useState<number | null>(null);
  const [seasonReturn, setSeasonReturn] = useState<Screen>('home');
  const [playerName, setPlayerName] = useState('');
  const [playerSeasonId, setPlayerSeasonId] = useState<number | null>(null);
  const [playerReturn, setPlayerReturn] = useState<Screen>('leaderboards');

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Preserve Android's normal app-exit behavior only at the top level.
      if (role == null || screen === 'home') return false;

      switch (screen) {
        case 'players':
        case 'playerDirectory':
        case 'history':
        case 'leaderboards':
          setScreen('home');
          break;
        case 'teams':
          setScreen(teamReturn);
          break;
        case 'teamEditor':
          setScreen('teams');
          break;
        case 'matchSetup':
          setScreen('home');
          break;
        case 'matchSetupTeams':
          setScreen('matchSetup');
          break;
        case 'matchSetupPlayers':
          setScreen('matchSetupTeams');
          break;
        case 'matchSetupShuffle':
          setScreen('matchSetupPlayers');
          break;
        case 'inningsSetup':
        case 'scoring':
        case 'matchDetail':
          setScreen(matchReturn);
          break;
        case 'seasons':
          setScreen(seasonReturn);
          break;
        case 'seasonDetail':
          setScreen('seasons');
          break;
        case 'seasonRoundDetail':
          setScreen('seasonDetail');
          break;
        case 'playerProfile':
          setScreen(playerReturn);
          break;
        default:
          return false;
      }

      // The app handled this back press; do not close the activity.
      return true;
    });

    return () => subscription.remove();
  }, [role, screen, teamReturn, matchReturn, seasonReturn, playerReturn]);

  const login = (nextRole: AccessRole) => {
    setRole(nextRole);
    setScreen('home');
  };

  const logout = () => {
    setRole(null);
    setScreen('home');
    setTeamEditId(undefined);
    setTeamReturn('home');
    setMatchId(null);
    setMatchReturn('history');
    setMatchDraft(createEmptyMatchSetupDraft());
    setSeasonId(null);
    setSeasonRoundId(null);
    setSeasonReturn('home');
    setPlayerName('');
    setPlayerSeasonId(null);
    setPlayerReturn('leaderboards');
  };

  const navigate = (s: string) => {
    const next = s as Screen;
    if (role === 'viewer' && ADMIN_ONLY_SCREENS.includes(next)) {
      setScreen('home');
      return;
    }
    if (next === 'matchSetup') setMatchDraft(createEmptyMatchSetupDraft());
    if (next === 'teams') setTeamReturn('home');
    if (next === 'seasons') setSeasonReturn('home');
    setScreen(next);
  };

  const openTeam = (id?: number) => {
    if (role !== 'admin') return;
    setTeamEditId(id);
    setScreen('teamEditor');
  };

  const openSeason = (id: number) => {
    setSeasonId(id);
    setSeasonRoundId(null);
    setScreen('seasonDetail');
  };

  const openSeasonRound = (id: number | null) => {
    setSeasonRoundId(id);
    setScreen('seasonRoundDetail');
  };

  const openPlayer = (name: string, selectedSeasonId: number | null, returnTo: Screen) => {
    setPlayerName(name);
    setPlayerSeasonId(selectedSeasonId);
    setPlayerReturn(returnTo);
    setScreen('playerProfile');
  };

  const openMatch = async (id: number, returnTo: Screen = 'history') => {
    setMatchId(id);
    setMatchReturn(returnTo);

    if (role === 'viewer') {
      setScreen('matchDetail');
      return;
    }

    const match = await getMatch(db, id);
    if (match.status === 'COMPLETE') return setScreen('matchDetail');
    const innings = await getCurrentInnings(db, id);
    if (!innings.striker_id || !innings.non_striker_id || !innings.bowler_id) setScreen('inningsSetup');
    else setScreen('scoring');
  };

  const startDraftMatch = async () => {
    if (!matchDraft.teamAId || !matchDraft.teamBId || !matchDraft.battingFirstTeamId) {
      throw new Error('Team and batting-first selections are incomplete.');
    }
    const id = await createMatchWithAvailability(
      db,
      matchDraft.teamAId,
      matchDraft.teamBId,
      matchDraft.overs,
      matchDraft.battingFirstTeamId,
      matchDraft.seasonId,
      matchDraft.seasonRoundId,
      matchDraft.teamAPlayerIds,
      matchDraft.teamBPlayerIds,
      matchDraft.switches,
    );
    setMatchId(id);
    setMatchReturn('home');
    setMatchDraft(createEmptyMatchSetupDraft());
    setScreen('inningsSetup');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {role == null ? (
        <LoginScreen onAdmin={() => login('admin')} onViewer={() => login('viewer')} />
      ) : (
        <>
          {screen === 'home' && <HomeScreen role={role} onLogout={logout} onNavigate={navigate} onOpenMatch={(id) => openMatch(id, 'home')} />}

          {role === 'admin' && screen === 'players' && <PlayersScreen onBack={() => setScreen('home')} />}
          {screen === 'playerDirectory' && <PlayerDirectoryScreen onBack={() => setScreen('home')} onOpenPlayer={(name) => openPlayer(name, null, 'playerDirectory')} />}
          {role === 'admin' && screen === 'teams' && <TeamsScreen onBack={() => setScreen(teamReturn)} onEdit={openTeam} />}
          {role === 'admin' && screen === 'teamEditor' && <TeamEditorScreen teamId={teamEditId} onBack={() => setScreen('teams')} onSaved={() => setScreen('teams')} />}

          {role === 'admin' && screen === 'matchSetup' && (
            <MatchSetupScreen
              draft={matchDraft}
              onChange={setMatchDraft}
              onBack={() => setScreen('home')}
              onContinue={() => setScreen('matchSetupTeams')}
              onSeasons={() => { setSeasonReturn('matchSetup'); setScreen('seasons'); }}
            />
          )}
          {role === 'admin' && screen === 'matchSetupTeams' && (
            <MatchTeamsSetupScreen
              draft={matchDraft}
              onChange={setMatchDraft}
              onBack={() => setScreen('matchSetup')}
              onContinue={() => setScreen('matchSetupPlayers')}
              onTeams={() => { setTeamReturn('matchSetupTeams'); setScreen('teams'); }}
            />
          )}
          {role === 'admin' && screen === 'matchSetupPlayers' && (
            <MatchAvailabilityScreen
              draft={matchDraft}
              onChange={setMatchDraft}
              onBack={() => setScreen('matchSetupTeams')}
              onShuffle={() => setScreen('matchSetupShuffle')}
              onStart={startDraftMatch}
            />
          )}
          {role === 'admin' && screen === 'matchSetupShuffle' && (
            <MatchShuffleScreen
              draft={matchDraft}
              onChange={setMatchDraft}
              onBack={() => setScreen('matchSetupPlayers')}
              onDone={() => setScreen('matchSetupPlayers')}
            />
          )}

          {role === 'admin' && screen === 'inningsSetup' && matchId != null && <InningsSetupScreen matchId={matchId} onBack={() => setScreen(matchReturn)} onReady={() => setScreen('scoring')} />}
          {role === 'admin' && screen === 'scoring' && matchId != null && <ScoringScreenV16 matchId={matchId} onBack={() => setScreen(matchReturn)} onNeedSetup={() => setScreen('inningsSetup')} onMatchComplete={() => setScreen('matchDetail')} />}

          {screen === 'history' && <HistoryScreen readOnly={role === 'viewer'} onBack={() => setScreen('home')} onOpen={(id) => openMatch(id, 'history')} />}
          {screen === 'matchDetail' && matchId != null && <MatchDetailScreen readOnly={role === 'viewer'} matchId={matchId} onBack={() => setScreen(matchReturn)} onEdit={role === 'admin' ? () => setScreen('scoring') : undefined} />}
          {screen === 'leaderboards' && <LeaderboardsScreen onBack={() => setScreen('home')} onPlayer={(name, sid) => openPlayer(name, sid, 'leaderboards')} />}
          {screen === 'seasons' && <SeasonsScreen readOnly={role === 'viewer'} onBack={() => setScreen(seasonReturn)} onOpen={openSeason} />}
          {screen === 'seasonDetail' && seasonId != null && <SeasonDetailScreen readOnly={role === 'viewer'} seasonId={seasonId} onBack={() => setScreen('seasons')} onOpenRound={openSeasonRound} onOpenPlayer={(name, sid) => openPlayer(name, sid, 'seasonDetail')} />}
          {screen === 'seasonRoundDetail' && seasonId != null && <SeasonRoundDetailScreen readOnly={role === 'viewer'} seasonId={seasonId} roundId={seasonRoundId} onBack={() => setScreen('seasonDetail')} onDeleted={() => setScreen('seasonDetail')} onOpenMatch={(id) => openMatch(id, 'seasonRoundDetail')} />}
          {screen === 'playerProfile' && playerName && <PlayerProfileScreen playerName={playerName} initialSeasonId={playerSeasonId} onBack={() => setScreen(playerReturn)} />}
        </>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SQLiteProvider databaseName="local_cricket_scorer.db" onInit={initDatabaseV18}>
        <StatusBar style="light" />
        <AppContent />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg } });
