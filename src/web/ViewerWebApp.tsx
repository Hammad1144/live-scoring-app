import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors } from '../theme';
import { fetchViewerCloudSnapshot } from '../services/viewerSnapshot';
import {
  computeLeaderboard,
  computePlayerStats,
  computeSeasonImpact,
  formatDate,
  formatOvers,
  getMatchInnings,
  getPlayerName,
  getSeasonName,
  getTeamName,
  inningsScore,
  LeaderboardKind,
  matchTitle,
  nullableNumber,
  numberValue,
  SnapshotRow,
  table,
  textValue,
  ViewerSnapshot,
} from './viewerData';
import { viewerInningsScorecard } from './viewerScorecard';

type Section = 'home' | 'seasons' | 'history' | 'players' | 'leaderboards';

type NavItem = {
  key: Section;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'seasons', label: 'Seasons', icon: '◫' },
  { key: 'history', label: 'Match History', icon: '↺' },
  { key: 'players', label: 'Players', icon: '◎' },
  { key: 'leaderboards', label: 'Leaderboards', icon: '★' },
];

const BOARD_LABELS: Record<LeaderboardKind, string> = {
  runs: 'Top Scorer',
  sixes: 'Most Sixes',
  wickets: 'Most Wickets',
  catches: 'Most Catches',
  runOuts: 'Most Run Outs',
  economy: 'Best Economy',
};

function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ label, value, hint, onPress }: { label: string; value: string | number; hint?: string; onPress?: () => void }) {
  const content = (
    <Panel style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </Panel>
  );
  return onPress ? <Pressable style={styles.flexOne} onPress={onPress}>{content}</Pressable> : <View style={styles.flexOne}>{content}</View>;
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexOne}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function MatchCard({ snapshot, match, onPress }: { snapshot: ViewerSnapshot; match: SnapshotRow; onPress: () => void }) {
  const matchId = numberValue(match, 'id');
  const innings = getMatchInnings(snapshot, matchId);
  const status = textValue(match, 'status');
  const seasonId = nullableNumber(match, 'season_id');
  return (
    <Pressable onPress={onPress} style={styles.matchCardPressable}>
      <Panel style={styles.matchCard}>
        <View style={styles.matchCardTop}>
          <Text style={styles.matchTitle}>{matchTitle(snapshot, match)}</Text>
          <View style={[styles.statusBadge, status === 'COMPLETED' ? styles.statusCompleted : styles.statusLive]}>
            <Text style={styles.statusText}>{status === 'COMPLETED' ? 'Completed' : 'In Progress'}</Text>
          </View>
        </View>
        <View style={styles.scoreRow}>
          {innings.length ? innings.map(inn => (
            <View key={numberValue(inn, 'id')} style={styles.scoreBlock}>
              <Text style={styles.scoreTeam}>{getTeamName(snapshot, numberValue(inn, 'batting_team_id'))}</Text>
              <Text style={styles.scoreValue}>{inningsScore(inn)}</Text>
            </View>
          )) : <Text style={styles.muted}>Score not available yet</Text>}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{getSeasonName(snapshot, seasonId)}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{numberValue(match, 'overs_limit')} overs</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{formatDate(textValue(match, 'completed_at') || textValue(match, 'created_at'))}</Text>
        </View>
        {textValue(match, 'result_text') ? <Text style={styles.resultText}>{textValue(match, 'result_text')}</Text> : null}
      </Panel>
    </Pressable>
  );
}

function BackButton({ label = 'Back', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backButton}>
      <Text style={styles.backButtonText}>‹ {label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Panel style={styles.emptyPanel}>
      <Text style={styles.emptyText}>{text}</Text>
    </Panel>
  );
}

export function ViewerWebApp() {
  const { width } = useWindowDimensions();
  const desktop = width >= 920;
  const compact = width < 620;
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null);
  const [cloudVersion, setCloudVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [leaderboardSeasonId, setLeaderboardSeasonId] = useState<number | null>(null);
  const [leaderboardKind, setLeaderboardKind] = useState<LeaderboardKind>('runs');
  const [historySeasonId, setHistorySeasonId] = useState<number | null>(null);
  const [playerSeasonId, setPlayerSeasonId] = useState<number | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      const cloud = await fetchViewerCloudSnapshot();
      setSnapshot(cloud.payload);
      setCloudVersion(cloud.version);
      setUpdatedAt(cloud.updatedAt);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 60000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const globalAny = globalThis as any;
    if (globalAny.document) {
      globalAny.document.title = 'Cricket Zone Viewer';
      let manifest = globalAny.document.querySelector('link[rel="manifest"]');
      if (!manifest) {
        manifest = globalAny.document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = '/live-scoring-app/manifest.json';
        globalAny.document.head.appendChild(manifest);
      }
      let theme = globalAny.document.querySelector('meta[name="theme-color"]');
      if (!theme) {
        theme = globalAny.document.createElement('meta');
        theme.name = 'theme-color';
        globalAny.document.head.appendChild(theme);
      }
      theme.content = colors.bg;
    }
    if (globalAny.navigator?.serviceWorker) {
      globalAny.navigator.serviceWorker.register('/live-scoring-app/service-worker.js').catch(() => undefined);
    }
  }, []);

  const seasons = useMemo(() => {
    if (!snapshot) return [];
    return [...table(snapshot, 'seasons')].sort((a, b) => {
      const aDate = textValue(a, 'start_date');
      const bDate = textValue(b, 'start_date');
      return bDate.localeCompare(aDate) || numberValue(b, 'id') - numberValue(a, 'id');
    });
  }, [snapshot]);

  const matches = useMemo(() => {
    if (!snapshot) return [];
    return [...table(snapshot, 'matches')].sort((a, b) => {
      const aDate = textValue(a, 'completed_at') || textValue(a, 'created_at');
      const bDate = textValue(b, 'completed_at') || textValue(b, 'created_at');
      return bDate.localeCompare(aDate) || numberValue(b, 'id') - numberValue(a, 'id');
    });
  }, [snapshot]);

  const players = useMemo(() => {
    if (!snapshot) return [];
    return [...table(snapshot, 'players')].sort((a, b) => textValue(a, 'name').localeCompare(textValue(b, 'name')));
  }, [snapshot]);

  const navigate = (next: Section) => {
    setSection(next);
    setSelectedSeasonId(null);
    setSelectedRoundId(null);
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
  };

  if (loading && !snapshot) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Loading Cricket Zone Viewer</Text>
        <Text style={styles.muted}>Connecting to the latest Supabase snapshot…</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.loadingPage}>
        <Text style={styles.errorTitle}>Unable to load viewer data</Text>
        <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => load()}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const completedMatches = matches.filter(row => textValue(row, 'status') === 'COMPLETED');
  const recentMatches = completedMatches.slice(0, 4);
  const allTimeRuns = computeLeaderboard(snapshot, 'runs', null).slice(0, 3);
  const allTimeWickets = computeLeaderboard(snapshot, 'wickets', null).slice(0, 3);

  const openMatch = (matchId: number) => {
    setSection('history');
    setSelectedMatchId(matchId);
  };

  const openPlayer = (playerId: number, seasonId: number | null = null) => {
    setSection('players');
    setSelectedPlayerId(playerId);
    setPlayerSeasonId(seasonId);
  };

  const renderHome = () => (
    <>
      <SectionHeader
        title="Viewer Home"
        subtitle="A read-only overview of Cricket Zone, synced from the same cloud data used by the Android app."
      />

      <Panel style={styles.heroPanel}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>VIEWER ACCESS</Text>
          <Text style={styles.heroTitle}>Everything your team needs to follow the competition.</Text>
          <Text style={styles.heroText}>Browse seasons, completed scorecards, player profiles and leaderboards without access to admin or scoring controls.</Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.primaryButton} onPress={() => navigate('seasons')}>
              <Text style={styles.primaryButtonText}>Browse Seasons</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => navigate('leaderboards')}>
              <Text style={styles.secondaryButtonText}>View Leaderboards</Text>
            </Pressable>
          </View>
        </View>
        {!compact ? (
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeValue}>{completedMatches.length}</Text>
            <Text style={styles.heroBadgeLabel}>completed matches</Text>
            <View style={styles.heroBadgeDivider} />
            <Text style={styles.heroBadgeSmall}>Cloud v{cloudVersion}</Text>
          </View>
        ) : null}
      </Panel>

      <View style={[styles.statGrid, compact && styles.stackGrid]}>
        <StatCard label="Seasons" value={seasons.length} hint="Browse competition history" onPress={() => navigate('seasons')} />
        <StatCard label="Matches" value={completedMatches.length} hint="Completed scorecards" onPress={() => navigate('history')} />
        <StatCard label="Players" value={players.length} hint="Profiles and statistics" onPress={() => navigate('players')} />
        <StatCard label="Teams" value={table(snapshot, 'teams').filter(row => numberValue(row, 'archived') !== 1).length} hint="Active team records" />
      </View>

      <View style={[styles.twoColumn, compact && styles.stackGrid]}>
        <View style={styles.flexOne}>
          <View style={styles.subsectionTitleRow}>
            <Text style={styles.subsectionTitle}>Recent Matches</Text>
            <Pressable onPress={() => navigate('history')}><Text style={styles.linkText}>View all</Text></Pressable>
          </View>
          {recentMatches.length ? recentMatches.map(match => (
            <MatchCard key={numberValue(match, 'id')} snapshot={snapshot} match={match} onPress={() => openMatch(numberValue(match, 'id'))} />
          )) : <EmptyState text="No completed matches yet." />}
        </View>

        <View style={styles.flexOne}>
          <Text style={styles.subsectionTitle}>Leaderboard Highlights</Text>
          <Panel>
            <Text style={styles.boardMiniTitle}>Top Scorers</Text>
            {allTimeRuns.length ? allTimeRuns.map((row, index) => (
              <Pressable key={`run-${row.name}`} style={styles.miniRankRow} onPress={() => openPlayer(row.playerId)}>
                <Text style={styles.miniRank}>{index + 1}</Text>
                <Text style={styles.miniName}>{row.name}</Text>
                <Text style={styles.miniValue}>{Math.round(row.value)}</Text>
              </Pressable>
            )) : <Text style={styles.muted}>No batting data yet.</Text>}
            <View style={styles.divider} />
            <Text style={styles.boardMiniTitle}>Most Wickets</Text>
            {allTimeWickets.length ? allTimeWickets.map((row, index) => (
              <Pressable key={`wicket-${row.name}`} style={styles.miniRankRow} onPress={() => openPlayer(row.playerId)}>
                <Text style={styles.miniRank}>{index + 1}</Text>
                <Text style={styles.miniName}>{row.name}</Text>
                <Text style={styles.miniValue}>{Math.round(row.value)}</Text>
              </Pressable>
            )) : <Text style={styles.muted}>No bowling data yet.</Text>}
          </Panel>
        </View>
      </View>
    </>
  );

  const renderSeasonDetail = (season: SnapshotRow) => {
    const seasonId = numberValue(season, 'id');
    const seasonMatches = matches.filter(match => nullableNumber(match, 'season_id') === seasonId);
    const rounds = table(snapshot, 'season_rounds')
      .filter(round => numberValue(round, 'season_id') === seasonId)
      .sort((a, b) => numberValue(a, 'sort_order') - numberValue(b, 'sort_order') || numberValue(a, 'id') - numberValue(b, 'id'));
    const ranking = computeSeasonImpact(snapshot, seasonId).slice(0, 10);

    if (selectedRoundId != null) {
      const round = rounds.find(row => numberValue(row, 'id') === selectedRoundId);
      const roundMatches = seasonMatches.filter(match => nullableNumber(match, 'season_round_id') === selectedRoundId);
      return (
        <>
          <BackButton label={textValue(season, 'name')} onPress={() => setSelectedRoundId(null)} />
          <SectionHeader title={textValue(round, 'name') || 'Round / Week'} subtitle={`${roundMatches.length} match${roundMatches.length === 1 ? '' : 'es'} • ${formatDate(textValue(round, 'start_date'))} → ${formatDate(textValue(round, 'end_date'))}`} />
          {roundMatches.length ? roundMatches.map(match => (
            <MatchCard key={numberValue(match, 'id')} snapshot={snapshot} match={match} onPress={() => openMatch(numberValue(match, 'id'))} />
          )) : <EmptyState text="No matches are assigned to this round yet." />}
        </>
      );
    }

    const unassigned = seasonMatches.filter(match => nullableNumber(match, 'season_round_id') == null);
    return (
      <>
        <BackButton label="All Seasons" onPress={() => setSelectedSeasonId(null)} />
        <SectionHeader
          title={textValue(season, 'name')}
          subtitle={`${formatDate(textValue(season, 'start_date'))} → ${formatDate(textValue(season, 'end_date'))} • ${seasonMatches.length} matches`}
        />

        <Text style={styles.subsectionTitle}>Rounds / Weeks</Text>
        <View style={[styles.cardGrid, compact && styles.stackGrid]}>
          {rounds.map((round, index) => {
            const roundId = numberValue(round, 'id');
            const count = seasonMatches.filter(match => nullableNumber(match, 'season_round_id') === roundId).length;
            return (
              <Pressable key={roundId} style={styles.gridCardPressable} onPress={() => setSelectedRoundId(roundId)}>
                <Panel style={styles.roundCard}>
                  <Text style={styles.roundIndex}>{index + 1}</Text>
                  <Text style={styles.roundName}>{textValue(round, 'name')}</Text>
                  <Text style={styles.muted}>{count} match{count === 1 ? '' : 'es'}</Text>
                  <Text style={styles.roundDate}>{formatDate(textValue(round, 'start_date'))}</Text>
                </Panel>
              </Pressable>
            );
          })}
          {unassigned.length ? (
            <Pressable style={styles.gridCardPressable} onPress={() => {
              if (unassigned.length === 1) openMatch(numberValue(unassigned[0], 'id'));
              else setSelectedRoundId(-1);
            }}>
              <Panel style={[styles.roundCard, styles.warningBorder]}>
                <Text style={styles.roundIndex}>!</Text>
                <Text style={styles.roundName}>Unassigned Matches</Text>
                <Text style={styles.muted}>{unassigned.length} legacy match{unassigned.length === 1 ? '' : 'es'}</Text>
              </Panel>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.subsectionTitle}>Top Players of the Season</Text>
        {ranking.length ? (
          <Panel>
            {ranking.map((row, index) => (
              <Pressable key={row.name} style={styles.rankRow} onPress={() => openPlayer(row.playerId, seasonId)}>
                <Text style={styles.rankNo}>{index + 1}</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.rankName}>{row.name}</Text>
                  <Text style={styles.rankDetail}>{row.matches} matches • Bat {row.battingPoints} • Bowl {row.bowlingPoints} • Field {row.fieldingPoints}</Text>
                </View>
                <Text style={styles.rankValue}>{row.totalPoints}</Text>
              </Pressable>
            ))}
          </Panel>
        ) : <EmptyState text="No player performance data for this season yet." />}
      </>
    );
  };

  const renderSeasons = () => {
    if (selectedSeasonId != null) {
      const season = seasons.find(row => numberValue(row, 'id') === selectedSeasonId);
      if (season) return renderSeasonDetail(season);
    }
    return (
      <>
        <SectionHeader title="Seasons" subtitle="Browse each season, its rounds / weeks, matches and player rankings." />
        <View style={[styles.cardGrid, compact && styles.stackGrid]}>
          {seasons.map(season => {
            const seasonId = numberValue(season, 'id');
            const count = matches.filter(match => nullableNumber(match, 'season_id') === seasonId).length;
            return (
              <Pressable key={seasonId} style={styles.gridCardPressable} onPress={() => setSelectedSeasonId(seasonId)}>
                <Panel style={styles.seasonCard}>
                  <Text style={styles.eyebrow}>SEASON</Text>
                  <Text style={styles.seasonName}>{textValue(season, 'name')}</Text>
                  <Text style={styles.seasonDates}>{formatDate(textValue(season, 'start_date'))} → {formatDate(textValue(season, 'end_date'))}</Text>
                  <View style={styles.seasonFooter}>
                    <Text style={styles.seasonCount}>{count}</Text>
                    <Text style={styles.muted}> matches</Text>
                  </View>
                </Panel>
              </Pressable>
            );
          })}
        </View>
        {!seasons.length ? <EmptyState text="No seasons have been created yet." /> : null}
      </>
    );
  };

  const renderMatchDetail = (match: SnapshotRow) => {
    const matchId = numberValue(match, 'id');
    const matchInnings = getMatchInnings(snapshot, matchId);

    return (
      <>
        <BackButton label="Match History" onPress={() => setSelectedMatchId(null)} />
        <SectionHeader title={matchTitle(snapshot, match)} subtitle={`${getSeasonName(snapshot, nullableNumber(match, 'season_id'))} • ${numberValue(match, 'overs_limit')} overs • ${formatDate(textValue(match, 'completed_at') || textValue(match, 'created_at'))}`} />

        <Panel style={styles.scoreboardPanel}>
          <Text style={styles.eyebrow}>MATCH RESULT</Text>
          <Text style={styles.scoreboardResult}>{textValue(match, 'result_text') || (textValue(match, 'status') === 'COMPLETED' ? 'Match completed' : 'Match in progress')}</Text>
          <View style={[styles.scoreboardGrid, compact && styles.stackGrid]}>
            {matchInnings.map(inn => (
              <View key={numberValue(inn, 'id')} style={styles.scoreboardInnings}>
                <Text style={styles.scoreboardTeam}>{getTeamName(snapshot, numberValue(inn, 'batting_team_id'))}</Text>
                <Text style={styles.scoreboardScore}>{numberValue(inn, 'runs')}/{numberValue(inn, 'wickets')}</Text>
                <Text style={styles.scoreboardOvers}>{formatOvers(numberValue(inn, 'legal_balls'))} overs</Text>
              </View>
            ))}
          </View>
        </Panel>

        {matchInnings.map(inn => {
          const scorecard = viewerInningsScorecard(snapshot, numberValue(inn, 'id'));
          return (
            <View key={`card-${numberValue(inn, 'id')}`}>
              <Text style={styles.subsectionTitle}>{getTeamName(snapshot, numberValue(inn, 'batting_team_id'))} — Innings {numberValue(inn, 'innings_no')}</Text>
              <View style={[styles.twoColumn, compact && styles.stackGrid]}>
                <Panel style={styles.flexOne}>
                  <Text style={styles.tableTitle}>Batting</Text>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeader, styles.flexOne]}>Player</Text>
                    <Text style={styles.tableHeaderNum}>R</Text><Text style={styles.tableHeaderNum}>B</Text><Text style={styles.tableHeaderNum}>4s</Text><Text style={styles.tableHeaderNum}>6s</Text><Text style={styles.tableHeaderNum}>SR</Text>
                  </View>
                  {scorecard.batters.length ? scorecard.batters.map(row => (
                    <Pressable key={row.playerId} style={styles.dataRow} onPress={() => openPlayer(row.playerId, nullableNumber(match, 'season_id'))}>
                      <View style={styles.flexOne}><Text style={styles.dataName}>{row.name}</Text><Text style={styles.dataSub}>{row.dismissal}</Text></View>
                      <Text style={styles.dataNumStrong}>{row.runs}</Text><Text style={styles.dataNum}>{row.balls}</Text><Text style={styles.dataNum}>{row.fours}</Text><Text style={styles.dataNum}>{row.sixes}</Text><Text style={styles.dataNum}>{row.balls ? ((row.runs / row.balls) * 100).toFixed(0) : '0'}</Text>
                    </Pressable>
                  )) : <Text style={styles.muted}>No batting detail recorded.</Text>}
                  <Text style={styles.extras}>Extras: {numberValue(inn, 'wides') + numberValue(inn, 'no_balls') + numberValue(inn, 'byes') + numberValue(inn, 'leg_byes')} (Wd {numberValue(inn, 'wides')}, Nb {numberValue(inn, 'no_balls')}, B {numberValue(inn, 'byes')}, Lb {numberValue(inn, 'leg_byes')})</Text>
                </Panel>
                <Panel style={styles.flexOne}>
                  <Text style={styles.tableTitle}>Bowling</Text>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeader, styles.flexOne]}>Player</Text>
                    <Text style={styles.tableHeaderWide}>O</Text><Text style={styles.tableHeaderNum}>R</Text><Text style={styles.tableHeaderNum}>W</Text><Text style={styles.tableHeaderWide}>Econ</Text>
                  </View>
                  {scorecard.bowlers.length ? scorecard.bowlers.map(row => (
                    <Pressable key={row.playerId} style={styles.dataRow} onPress={() => openPlayer(row.playerId, nullableNumber(match, 'season_id'))}>
                      <Text style={[styles.dataName, styles.flexOne]}>{row.name}</Text>
                      <Text style={styles.dataWide}>{formatOvers(row.legalBalls)}</Text><Text style={styles.dataNum}>{row.runs}</Text><Text style={styles.dataNumStrong}>{row.wickets}</Text><Text style={styles.dataWide}>{row.legalBalls ? (row.runs / (row.legalBalls / 6)).toFixed(2) : '0.00'}</Text>
                    </Pressable>
                  )) : <Text style={styles.muted}>No bowling detail recorded.</Text>}
                </Panel>
              </View>
              <Panel style={styles.overByOverPanel}>
                <Text style={styles.tableTitle}>Over-by-over</Text>
                {scorecard.overs.length ? scorecard.overs.map(over => (
                  <View key={over.overNo} style={styles.overRow}>
                    <Text style={styles.overNo}>Over {over.overNo}</Text>
                    <Text style={styles.overBalls}>{over.balls.join('  ')}</Text>
                  </View>
                )) : <Text style={styles.muted}>No deliveries.</Text>}
              </Panel>
            </View>
          );
        })}

      </>
    );
  };

  const renderHistory = () => {
    if (selectedMatchId != null) {
      const match = matches.find(row => numberValue(row, 'id') === selectedMatchId);
      if (match) return renderMatchDetail(match);
    }
    const filtered = matches.filter(match => historySeasonId == null || nullableNumber(match, 'season_id') === historySeasonId);
    return (
      <>
        <SectionHeader title="Match History" subtitle="Open any match to review the result, innings scorecard and over-by-over detail." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pill label="All Time" active={historySeasonId == null} onPress={() => setHistorySeasonId(null)} />
          {seasons.map(season => <Pill key={numberValue(season, 'id')} label={textValue(season, 'name')} active={historySeasonId === numberValue(season, 'id')} onPress={() => setHistorySeasonId(numberValue(season, 'id'))} />)}
        </ScrollView>
        {filtered.length ? filtered.map(match => (
          <MatchCard key={numberValue(match, 'id')} snapshot={snapshot} match={match} onPress={() => setSelectedMatchId(numberValue(match, 'id'))} />
        )) : <EmptyState text="No matches are available for this period." />}
      </>
    );
  };

  const renderPlayerProfile = (playerId: number) => {
    const name = getPlayerName(snapshot, playerId);
    const stats = computePlayerStats(snapshot, playerId, playerSeasonId);
    return (
      <>
        <BackButton label="Players" onPress={() => setSelectedPlayerId(null)} />
        <SectionHeader title={name} subtitle={`${playerSeasonId == null ? 'All-time' : getSeasonName(snapshot, playerSeasonId)} player profile`} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pill label="All Time" active={playerSeasonId == null} onPress={() => setPlayerSeasonId(null)} />
          {seasons.map(season => <Pill key={numberValue(season, 'id')} label={textValue(season, 'name')} active={playerSeasonId === numberValue(season, 'id')} onPress={() => setPlayerSeasonId(numberValue(season, 'id'))} />)}
        </ScrollView>

        <View style={[styles.profileHero, compact && styles.stackGrid]}>
          <Panel style={styles.profileIdentity}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.muted}>{stats.matches} match{stats.matches === 1 ? '' : 'es'}</Text>
          </Panel>
          <Panel style={styles.flexTwo}>
            <Text style={styles.tableTitle}>Career Snapshot</Text>
            <View style={styles.metricGrid}>
              <Metric label="Runs" value={stats.batting.runs} />
              <Metric label="Wickets" value={stats.bowling.wickets} />
              <Metric label="Catches" value={stats.fielding.catches} />
              <Metric label="Run Outs" value={stats.fielding.runOuts} />
            </View>
          </Panel>
        </View>

        <View style={[styles.threeColumn, compact && styles.stackGrid]}>
          <Panel style={styles.flexOne}>
            <Text style={styles.tableTitle}>Batting</Text>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Innings</Text><Text style={styles.statLineValue}>{stats.batting.innings}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Runs</Text><Text style={styles.statLineValue}>{stats.batting.runs}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Highest</Text><Text style={styles.statLineValue}>{stats.batting.highest}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Average</Text><Text style={styles.statLineValue}>{stats.batting.average.toFixed(1)}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Strike Rate</Text><Text style={styles.statLineValue}>{stats.batting.strikeRate.toFixed(1)}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>4s / 6s</Text><Text style={styles.statLineValue}>{stats.batting.fours} / {stats.batting.sixes}</Text></View>
          </Panel>
          <Panel style={styles.flexOne}>
            <Text style={styles.tableTitle}>Bowling</Text>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Overs</Text><Text style={styles.statLineValue}>{formatOvers(stats.bowling.legalBalls)}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Wickets</Text><Text style={styles.statLineValue}>{stats.bowling.wickets}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Economy</Text><Text style={styles.statLineValue}>{stats.bowling.economy.toFixed(2)}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Best</Text><Text style={styles.statLineValue}>{stats.bowling.bestWickets}/{stats.bowling.bestRuns}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Dot Balls</Text><Text style={styles.statLineValue}>{stats.bowling.dotBalls}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Runs Conceded</Text><Text style={styles.statLineValue}>{stats.bowling.runs}</Text></View>
          </Panel>
          <Panel style={styles.flexOne}>
            <Text style={styles.tableTitle}>Fielding</Text>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Catches</Text><Text style={styles.statLineValue}>{stats.fielding.catches}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Run Outs</Text><Text style={styles.statLineValue}>{stats.fielding.runOuts}</Text></View>
            <View style={styles.statLine}><Text style={styles.statLineLabel}>Stumpings</Text><Text style={styles.statLineValue}>{stats.fielding.stumpings}</Text></View>
          </Panel>
        </View>
      </>
    );
  };

  const renderPlayers = () => {
    if (selectedPlayerId != null) return renderPlayerProfile(selectedPlayerId);
    const search = playerSearch.trim().toLowerCase();
    const filtered = players.filter(player => !search || textValue(player, 'name').toLowerCase().includes(search));
    return (
      <>
        <SectionHeader title="Players" subtitle="Search the player directory and open a profile for batting, bowling and fielding statistics." />
        <TextInput
          value={playerSearch}
          onChangeText={setPlayerSearch}
          placeholder="Search players…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        <View style={[styles.playerGrid, compact && styles.stackGrid]}>
          {filtered.map(player => {
            const playerId = numberValue(player, 'id');
            const stats = computePlayerStats(snapshot, playerId, null);
            return (
              <Pressable key={playerId} style={styles.playerCardPressable} onPress={() => setSelectedPlayerId(playerId)}>
                <Panel style={styles.playerCard}>
                  <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{textValue(player, 'name').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.flexOne}>
                    <Text style={styles.playerCardName}>{textValue(player, 'name')}</Text>
                    <Text style={styles.playerCardMeta}>{stats.matches} matches • {stats.batting.runs} runs • {stats.bowling.wickets} wickets</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Panel>
              </Pressable>
            );
          })}
        </View>
        {!filtered.length ? <EmptyState text="No players match your search." /> : null}
      </>
    );
  };

  const renderLeaderboards = () => {
    const board = computeLeaderboard(snapshot, leaderboardKind, leaderboardSeasonId);
    return (
      <>
        <SectionHeader title="Leaderboards" subtitle="Compare player performance across all time or within a selected season." />
        <Text style={styles.filterLabel}>PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pill label="All Time" active={leaderboardSeasonId == null} onPress={() => setLeaderboardSeasonId(null)} />
          {seasons.map(season => <Pill key={numberValue(season, 'id')} label={textValue(season, 'name')} active={leaderboardSeasonId === numberValue(season, 'id')} onPress={() => setLeaderboardSeasonId(numberValue(season, 'id'))} />)}
        </ScrollView>
        <Text style={styles.filterLabel}>LEADERBOARD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(Object.keys(BOARD_LABELS) as LeaderboardKind[]).map(kind => <Pill key={kind} label={BOARD_LABELS[kind]} active={leaderboardKind === kind} onPress={() => setLeaderboardKind(kind)} />)}
        </ScrollView>

        {board.length ? (
          <Panel>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.rankHeader}>#</Text>
              <Text style={[styles.tableHeader, styles.flexOne]}>Player</Text>
              <Text style={styles.boardValueHeader}>{leaderboardKind === 'economy' ? 'Econ' : 'Value'}</Text>
            </View>
            {board.map((row, index) => (
              <Pressable key={`${leaderboardKind}-${row.name}`} style={styles.rankRow} onPress={() => openPlayer(row.playerId, leaderboardSeasonId)}>
                <Text style={styles.rankNo}>{index + 1}</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.rankName}>{row.name}</Text>
                  <Text style={styles.rankDetail}>{row.matches} match{row.matches === 1 ? '' : 'es'}{row.detail ? ` • ${row.detail}` : ''}</Text>
                </View>
                <Text style={styles.rankValue}>{leaderboardKind === 'economy' ? row.value.toFixed(2) : Math.round(row.value)}</Text>
              </Pressable>
            ))}
          </Panel>
        ) : <EmptyState text="No qualifying leaderboard data is available for this period." />}
      </>
    );
  };

  const renderContent = () => {
    if (section === 'home') return renderHome();
    if (section === 'seasons') return renderSeasons();
    if (section === 'history') return renderHistory();
    if (section === 'players') return renderPlayers();
    return renderLeaderboards();
  };

  const nav = (
    <>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>CZ</Text></View>
        <View>
          <Text style={styles.brandName}>Cricket Zone</Text>
          <Text style={styles.brandSub}>Viewer</Text>
        </View>
      </View>
      <View style={styles.navList}>
        {NAV_ITEMS.map(item => (
          <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.navItem, section === item.key && styles.navItemActive]}>
            <Text style={[styles.navIcon, section === item.key && styles.navTextActive]}>{item.icon}</Text>
            <Text style={[styles.navText, section === item.key && styles.navTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sidebarFooter}>
        <View style={styles.liveDot} />
        <View style={styles.flexOne}>
          <Text style={styles.sidebarFootTitle}>Supabase connected</Text>
          <Text style={styles.sidebarFootText}>{updatedAt ? `Updated ${formatDate(updatedAt)}` : `Cloud v${cloudVersion}`}</Text>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.appRoot}>
      {desktop ? <View style={styles.sidebar}>{nav}</View> : null}
      <View style={styles.mainArea}>
        {!desktop ? (
          <View style={styles.mobileHeader}>
            <View style={styles.brandBlockMobile}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>CZ</Text></View>
              <View><Text style={styles.brandName}>Cricket Zone</Text><Text style={styles.brandSub}>Viewer</Text></View>
            </View>
            <Pressable style={styles.refreshButton} onPress={() => load(true)} disabled={refreshing}>
              <Text style={styles.refreshText}>{refreshing ? '…' : '↻'}</Text>
            </Pressable>
          </View>
        ) : null}

        {!desktop ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNavScroll} contentContainerStyle={styles.mobileNav}>
            {NAV_ITEMS.map(item => (
              <Pressable key={item.key} onPress={() => navigate(item.key)} style={[styles.mobileNavItem, section === item.key && styles.mobileNavItemActive]}>
                <Text style={[styles.mobileNavText, section === item.key && styles.mobileNavTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}>
          {desktop ? (
            <View style={styles.desktopTopbar}>
              <View><Text style={styles.topbarKicker}>CRICKET ZONE</Text><Text style={styles.topbarText}>Viewer Access</Text></View>
              <View style={styles.topbarActions}>
                {error ? <Text style={styles.syncWarning}>Last refresh failed</Text> : <Text style={styles.syncOk}>Cloud v{cloudVersion}</Text>}
                <Pressable style={styles.refreshButtonDesktop} onPress={() => load(true)} disabled={refreshing}>
                  <Text style={styles.refreshDesktopText}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {error && snapshot ? <View style={styles.inlineWarning}><Text style={styles.inlineWarningText}>{error}</Text></View> : null}
          {renderContent()}
          <View style={styles.pageFooter}>
            <Text style={styles.pageFooterText}>Viewer-only PWA • Read-only cloud access • Same Cricket Zone data</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, minHeight: '100%', backgroundColor: colors.bg, flexDirection: 'row' },
  mainArea: { flex: 1, minWidth: 0, backgroundColor: colors.bg },
  sidebar: { width: 250, minHeight: '100%', backgroundColor: '#091a14', borderRightWidth: 1, borderRightColor: colors.border, padding: 18, position: 'relative' },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandBlockMobile: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  brandName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  brandSub: { color: colors.primary, fontSize: 10, fontWeight: '800', marginTop: 1, letterSpacing: 0.8 },
  navList: { gap: 6 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  navItemActive: { backgroundColor: colors.surface2 },
  navIcon: { width: 20, color: colors.muted, fontSize: 17, textAlign: 'center' },
  navText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  navTextActive: { color: colors.primary },
  sidebarFooter: { position: 'absolute', left: 18, right: 18, bottom: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  sidebarFootTitle: { color: colors.text, fontSize: 10, fontWeight: '800' },
  sidebarFootText: { color: colors.muted, fontSize: 9, marginTop: 2 },
  mobileHeader: { height: 66, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#091a14' },
  mobileNavScroll: { maxHeight: 48, backgroundColor: '#091a14' },
  mobileNav: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  mobileNavItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  mobileNavItemActive: { backgroundColor: colors.surface2 },
  mobileNavText: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  mobileNavTextActive: { color: colors.primary },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  contentDesktop: { width: '100%', maxWidth: 1240, alignSelf: 'center', padding: 28, paddingBottom: 50 },
  desktopTopbar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  topbarKicker: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  topbarText: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncOk: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  syncWarning: { color: colors.warning, fontSize: 10, fontWeight: '800' },
  refreshButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  refreshButtonDesktop: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  refreshDesktopText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4, marginBottom: 4 },
  pageTitle: { color: colors.text, fontWeight: '900', fontSize: 27, letterSpacing: -0.5 },
  pageSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 760 },
  heroPanel: { padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0b271c' },
  heroCopy: { flex: 1, maxWidth: 760 },
  eyebrow: { color: colors.primary, fontWeight: '900', fontSize: 9, letterSpacing: 1.6 },
  heroTitle: { color: colors.text, fontWeight: '900', fontSize: 26, lineHeight: 32, marginTop: 8, maxWidth: 650 },
  heroText: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8, maxWidth: 650 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 },
  heroBadge: { width: 160, height: 150, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginLeft: 24 },
  heroBadgeValue: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  heroBadgeLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  heroBadgeDivider: { width: 70, height: 1, backgroundColor: colors.border, marginVertical: 12 },
  heroBadgeSmall: { color: colors.text, fontSize: 9, fontWeight: '800' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 11, alignSelf: 'flex-start' },
  primaryButtonText: { color: colors.bg, fontWeight: '900', fontSize: 11 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryButtonText: { color: colors.text, fontWeight: '900', fontSize: 11 },
  statGrid: { flexDirection: 'row', gap: 10 },
  statCard: { minHeight: 104 },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  statValue: { color: colors.primary, fontSize: 30, fontWeight: '900', marginTop: 8 },
  statHint: { color: colors.muted, fontSize: 9, marginTop: 5 },
  twoColumn: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  threeColumn: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  stackGrid: { flexDirection: 'column' },
  flexOne: { flex: 1 },
  flexTwo: { flex: 2 },
  subsectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  subsectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 6, marginBottom: 2 },
  linkText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  matchCardPressable: { width: '100%' },
  matchCard: { padding: 14, marginTop: 8 },
  matchCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchTitle: { color: colors.text, fontWeight: '900', fontSize: 14, flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  statusCompleted: { backgroundColor: '#153a2b' },
  statusLive: { backgroundColor: '#443716' },
  statusText: { color: colors.text, fontSize: 8, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 13 },
  scoreBlock: { minWidth: 120 },
  scoreTeam: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  scoreValue: { color: colors.primary, fontSize: 20, fontWeight: '900', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 11 },
  metaText: { color: colors.muted, fontSize: 9 },
  metaDot: { color: colors.border, fontSize: 9 },
  resultText: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 9 },
  muted: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  boardMiniTitle: { color: colors.text, fontWeight: '900', fontSize: 12, marginBottom: 6 },
  miniRankRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniRank: { color: colors.primary, width: 22, fontWeight: '900', fontSize: 11 },
  miniName: { color: colors.text, fontWeight: '800', fontSize: 11, flex: 1 },
  miniValue: { color: colors.primary, fontWeight: '900', fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCardPressable: { flexGrow: 1, flexBasis: 250, maxWidth: 390 },
  seasonCard: { minHeight: 150, justifyContent: 'space-between' },
  seasonName: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 8 },
  seasonDates: { color: colors.muted, fontSize: 10, marginTop: 7 },
  seasonFooter: { flexDirection: 'row', alignItems: 'baseline', marginTop: 20 },
  seasonCount: { color: colors.primary, fontSize: 24, fontWeight: '900' },
  roundCard: { minHeight: 130 },
  roundIndex: { color: colors.primary, fontWeight: '900', fontSize: 20 },
  roundName: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 10 },
  roundDate: { color: colors.muted, fontSize: 9, marginTop: 15 },
  warningBorder: { borderColor: colors.warning },
  backButton: { alignSelf: 'flex-start', paddingVertical: 5, paddingRight: 12 },
  backButtonText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  rankRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  rankNo: { width: 30, color: colors.primary, fontWeight: '900', fontSize: 13 },
  rankName: { color: colors.text, fontWeight: '900', fontSize: 12 },
  rankDetail: { color: colors.muted, fontSize: 9, marginTop: 3 },
  rankValue: { minWidth: 50, color: colors.primary, fontWeight: '900', fontSize: 20, textAlign: 'right' },
  filterRow: { gap: 7, paddingVertical: 5, paddingRight: 12 },
  pill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.surface2 },
  pillText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  pillTextActive: { color: colors.primary },
  filterLabel: { color: colors.muted, fontWeight: '900', fontSize: 8, letterSpacing: 1.4, marginTop: 4 },
  emptyPanel: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  scoreboardPanel: { backgroundColor: '#0b271c', padding: 20 },
  scoreboardResult: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 7 },
  scoreboardGrid: { flexDirection: 'row', gap: 12, marginTop: 18 },
  scoreboardInnings: { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, padding: 15 },
  scoreboardTeam: { color: colors.muted, fontWeight: '800', fontSize: 10 },
  scoreboardScore: { color: colors.primary, fontWeight: '900', fontSize: 31, marginTop: 5 },
  scoreboardOvers: { color: colors.text, fontSize: 9, marginTop: 4 },
  tableTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 10 },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 30, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeader: { color: colors.muted, fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  tableHeaderNum: { width: 34, color: colors.muted, fontSize: 8, fontWeight: '900', textAlign: 'right' },
  tableHeaderWide: { width: 46, color: colors.muted, fontSize: 8, fontWeight: '900', textAlign: 'right' },
  rankHeader: { width: 30, color: colors.muted, fontSize: 8, fontWeight: '900' },
  boardValueHeader: { minWidth: 50, color: colors.muted, fontSize: 8, fontWeight: '900', textAlign: 'right' },
  dataRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  dataName: { color: colors.text, fontWeight: '800', fontSize: 10 },
  dataSub: { color: colors.muted, fontSize: 8, marginTop: 2 },
  dataNum: { width: 34, color: colors.text, fontSize: 10, textAlign: 'right' },
  dataNumStrong: { width: 34, color: colors.primary, fontWeight: '900', fontSize: 11, textAlign: 'right' },
  dataWide: { width: 46, color: colors.text, fontSize: 10, textAlign: 'right' },
  extras: { color: colors.muted, fontSize: 9, marginTop: 10 },
  overByOverPanel: { marginTop: 14 },
  overRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 7 },
  overNo: { width: 62, color: colors.primary, fontWeight: '900', fontSize: 9 },
  overBalls: { flex: 1, color: colors.text, fontSize: 10, fontWeight: '700' },
  squadRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  squadNo: { width: 24, color: colors.muted, fontSize: 9 },
  squadName: { flex: 1, color: colors.text, fontSize: 10, fontWeight: '800' },
  roleBadge: { color: colors.primary, fontSize: 8, fontWeight: '900', borderWidth: 1, borderColor: colors.primaryDark, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, fontSize: 11, paddingHorizontal: 13, paddingVertical: 11, maxWidth: 520 },
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  playerCardPressable: { flexGrow: 1, flexBasis: 310, maxWidth: 520 },
  playerCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12 },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  playerCardName: { color: colors.text, fontWeight: '900', fontSize: 12 },
  playerCardMeta: { color: colors.muted, fontSize: 8, marginTop: 4 },
  chevron: { color: colors.muted, fontSize: 22 },
  profileHero: { flexDirection: 'row', gap: 12 },
  profileIdentity: { width: 220, alignItems: 'center', justifyContent: 'center', minHeight: 180 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 30, fontWeight: '900' },
  profileName: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 10 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 110, minHeight: 88, backgroundColor: colors.surface2, borderRadius: 10, padding: 12, justifyContent: 'center' },
  metricValue: { color: colors.primary, fontSize: 24, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', marginTop: 4 },
  statLine: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  statLineLabel: { color: colors.muted, fontSize: 9 },
  statLineValue: { color: colors.text, fontSize: 10, fontWeight: '900' },
  loadingPage: { flex: 1, minHeight: '100%', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  loadingTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 8 },
  errorTitle: { color: colors.danger, fontSize: 18, fontWeight: '900' },
  errorText: { color: colors.muted, fontSize: 11, textAlign: 'center', maxWidth: 500, marginBottom: 10 },
  inlineWarning: { backgroundColor: '#342b12', borderWidth: 1, borderColor: colors.warning, borderRadius: 9, padding: 10 },
  inlineWarningText: { color: colors.warning, fontSize: 9, fontWeight: '800' },
  pageFooter: { marginTop: 24, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, paddingBottom: 8 },
  pageFooterText: { color: colors.muted, fontSize: 8, textAlign: 'center' },
});
