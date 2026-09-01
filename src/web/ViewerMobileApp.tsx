import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Chip, Empty, ScreenHeader } from '../components/UI';
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
  inningsScorecard,
  LeaderboardKind,
  matchTitle,
  nullableNumber,
  numberValue,
  SnapshotRow,
  table,
  textValue,
  ViewerSnapshot,
} from './viewerData';

type Section = 'home' | 'seasons' | 'history' | 'players' | 'leaderboards';
type SeasonTab = 'matches' | 'rankings';
type PlayerTab = 'batting' | 'bowling' | 'fielding';

const BOARD_LABELS: Record<LeaderboardKind, string> = {
  runs: 'Top Scorer',
  sixes: 'Most Sixes',
  wickets: 'Most Wickets',
  catches: 'Most Catches',
  runOuts: 'Most Run Outs',
  economy: 'Best Economy',
};

function isComplete(match: SnapshotRow) {
  const status = textValue(match, 'status').toUpperCase();
  return status === 'COMPLETE' || status === 'COMPLETED';
}

function MobileMatchCard({ snapshot, match, onPress }: { snapshot: ViewerSnapshot; match: SnapshotRow; onPress: () => void }) {
  const completed = isComplete(match);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.historyCard}>
        <Text style={styles.historyTitle}>{matchTitle(snapshot, match)}</Text>
        <Text style={styles.historyMeta}>
          {numberValue(match, 'overs_limit')} overs • {formatDate(textValue(match, 'created_at'))}
        </Text>
        <Text style={[styles.historyResult, !completed && styles.inProgressText]}>
          {completed
            ? textValue(match, 'result_text') || 'Match completed'
            : 'In progress — tap to view current summary'}
        </Text>
      </Card>
    </Pressable>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

export function ViewerMobileApp() {
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [seasonTab, setSeasonTab] = useState<SeasonTab>('matches');
  const [playerTab, setPlayerTab] = useState<PlayerTab>('batting');
  const [playerSeasonId, setPlayerSeasonId] = useState<number | null>(null);
  const [leaderboardSeasonId, setLeaderboardSeasonId] = useState<number | null>(null);
  const [leaderboardKind, setLeaderboardKind] = useState<LeaderboardKind>('runs');
  const [playerSearch, setPlayerSearch] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      const cloud = await fetchViewerCloudSnapshot();
      setSnapshot(cloud.payload);
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
      globalAny.document.body.style.margin = '0';
      globalAny.document.body.style.backgroundColor = colors.bg;
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

  const goHome = () => {
    setSection('home');
    setSelectedSeasonId(null);
    setSelectedRoundId(null);
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
  };

  const navigate = (next: Section) => {
    setSection(next);
    setSelectedSeasonId(null);
    setSelectedRoundId(null);
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
    setSeasonTab('matches');
  };

  const openPlayer = (playerId: number, seasonId: number | null = null) => {
    setSection('players');
    setSelectedPlayerId(playerId);
    setPlayerSeasonId(seasonId);
    setPlayerTab('batting');
  };

  const openMatch = (matchId: number) => {
    setSection('history');
    setSelectedMatchId(matchId);
  };

  if (loading && !snapshot) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Cricket Zone Viewer</Text>
        <Text style={styles.loadingText}>Loading the latest cricket records…</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.loadingPage}>
        <Text style={styles.errorTitle}>Unable to load viewer data</Text>
        <Text style={styles.loadingText}>{error || 'Unknown error'}</Text>
        <Pressable style={styles.retryButton} onPress={() => load()}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const renderHome = () => {
    const recent = matches.slice(0, 3);
    return (
      <>
        <ScreenHeader title="Cricket Zone App" subtitle="View access • Read-only cricket records" />

        <View style={styles.browseHeader}>
          <Text style={styles.sectionTitle}>Browse</Text>
          <Pressable
            onPress={() => load(true)}
            disabled={refreshing}
            style={[styles.refreshButton, refreshing && styles.disabled]}
          >
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.inlineError}>Cloud refresh failed: {error}</Text> : null}

        <View style={styles.tileGrid}>
          <Pressable style={styles.tile} onPress={() => navigate('players')}>
            <Text style={styles.tileIcon}>🔎</Text>
            <Text style={styles.tileTitle}>Player Profiles</Text>
            <Text style={styles.tileMeta}>Search performance</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigate('seasons')}>
            <Text style={styles.tileIcon}>🗓️</Text>
            <Text style={styles.tileTitle}>Seasons</Text>
            <Text style={styles.tileMeta}>Matches & rankings</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigate('history')}>
            <Text style={styles.tileIcon}>📋</Text>
            <Text style={styles.tileTitle}>Match History</Text>
            <Text style={styles.tileMeta}>Previous scorecards</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigate('leaderboards')}>
            <Text style={styles.tileIcon}>🏆</Text>
            <Text style={styles.tileTitle}>Leaderboards</Text>
            <Text style={styles.tileMeta}>All-time & seasons</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent Matches</Text>
          <Pressable onPress={() => navigate('history')}><Text style={styles.link}>View all</Text></Pressable>
        </View>
        {recent.length === 0 ? (
          <Card><Text style={styles.emptyCardText}>No matches scored yet.</Text></Card>
        ) : recent.map(match => (
          <MobileMatchCard
            key={numberValue(match, 'id')}
            snapshot={snapshot}
            match={match}
            onPress={() => openMatch(numberValue(match, 'id'))}
          />
        ))}
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
        <ScreenHeader title="Seasons" subtitle="Browse rounds / weeks, matches and player rankings" onBack={goHome} />
        <Text style={styles.sectionTitle}>Available Seasons</Text>
        {seasons.length === 0 ? <Empty text="No seasons are available yet." /> : seasons.map(season => {
          const seasonId = numberValue(season, 'id');
          const count = matches.filter(match => nullableNumber(match, 'season_id') === seasonId).length;
          return (
            <Card key={seasonId} style={styles.seasonCard}>
              <Pressable style={styles.seasonOpenArea} onPress={() => {
                setSelectedSeasonId(seasonId);
                setSeasonTab('matches');
              }}>
                <View style={styles.flexOne}>
                  <Text style={styles.seasonName}>{textValue(season, 'name')}</Text>
                  <Text style={styles.seasonMeta}>{textValue(season, 'start_date') || '—'} → {textValue(season, 'end_date') || '—'}</Text>
                  <Text style={styles.openHint}>Open rounds / weeks & rankings ›</Text>
                </View>
                <View style={styles.seasonCountWrap}>
                  <Text style={styles.seasonCount}>{count}</Text>
                  <Text style={styles.seasonCountLabel}>matches</Text>
                </View>
              </Pressable>
            </Card>
          );
        })}
      </>
    );
  };

  const renderSeasonDetail = (season: SnapshotRow) => {
    const seasonId = numberValue(season, 'id');
    const seasonMatches = matches.filter(match => nullableNumber(match, 'season_id') === seasonId);
    const rounds = table(snapshot, 'season_rounds')
      .filter(round => numberValue(round, 'season_id') === seasonId)
      .sort((a, b) => numberValue(a, 'sort_order') - numberValue(b, 'sort_order') || numberValue(a, 'id') - numberValue(b, 'id'));
    const ranking = computeSeasonImpact(snapshot, seasonId).slice(0, 10);
    const unassigned = seasonMatches.filter(match => nullableNumber(match, 'season_round_id') == null);

    if (selectedRoundId != null) {
      const unassignedMode = selectedRoundId === -1;
      const round = rounds.find(row => numberValue(row, 'id') === selectedRoundId);
      const roundMatches = unassignedMode
        ? unassigned
        : seasonMatches.filter(match => nullableNumber(match, 'season_round_id') === selectedRoundId);
      return (
        <>
          <ScreenHeader
            title={unassignedMode ? 'Unassigned Matches' : textValue(round, 'name') || 'Round / Week'}
            subtitle={`${roundMatches.length} match${roundMatches.length === 1 ? '' : 'es'}`}
            onBack={() => setSelectedRoundId(null)}
          />
          {roundMatches.length === 0 ? <Empty text="No matches are available in this round yet." /> : roundMatches.map(match => (
            <MobileMatchCard
              key={numberValue(match, 'id')}
              snapshot={snapshot}
              match={match}
              onPress={() => openMatch(numberValue(match, 'id'))}
            />
          ))}
        </>
      );
    }

    return (
      <>
        <ScreenHeader
          title={textValue(season, 'name')}
          subtitle={`${textValue(season, 'start_date') || '—'} → ${textValue(season, 'end_date') || '—'} • ${seasonMatches.length} matches`}
          onBack={() => setSelectedSeasonId(null)}
        />

        <View style={styles.tabs}>
          <Chip label={`Matches (${seasonMatches.length})`} selected={seasonTab === 'matches'} onPress={() => setSeasonTab('matches')} />
          <Chip label="Player Rankings" selected={seasonTab === 'rankings'} onPress={() => setSeasonTab('rankings')} />
        </View>

        {seasonTab === 'matches' ? (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Rounds / Weeks</Text>
              <Text style={styles.sectionCount}>{rounds.length}</Text>
            </View>
            {rounds.length === 0 && unassigned.length === 0 ? <Empty text="No rounds or matches are available in this season yet." /> : (
              <>
                {rounds.map((round, index) => {
                  const roundId = numberValue(round, 'id');
                  const count = seasonMatches.filter(match => nullableNumber(match, 'season_round_id') === roundId).length;
                  return (
                    <Pressable key={roundId} onPress={() => setSelectedRoundId(roundId)}>
                      <Card style={styles.roundCard}>
                        <View style={styles.roundBadge}><Text style={styles.roundBadgeText}>{index + 1}</Text></View>
                        <View style={styles.roundMain}>
                          <Text style={styles.roundName}>{textValue(round, 'name')}</Text>
                          <Text style={styles.roundMeta}>
                            {textValue(round, 'start_date') || 'No dates set'}{textValue(round, 'end_date') && textValue(round, 'end_date') !== textValue(round, 'start_date') ? ` → ${textValue(round, 'end_date')}` : ''}
                          </Text>
                        </View>
                        <View style={styles.roundCount}>
                          <Text style={styles.roundCountValue}>{count}</Text>
                          <Text style={styles.roundCountLabel}>matches</Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </Card>
                    </Pressable>
                  );
                })}
                {unassigned.length > 0 ? (
                  <Pressable onPress={() => setSelectedRoundId(-1)}>
                    <Card style={[styles.roundCard, styles.unassignedCard]}>
                      <View style={styles.roundBadge}><Text style={styles.roundBadgeText}>!</Text></View>
                      <View style={styles.roundMain}>
                        <Text style={styles.roundName}>Unassigned Matches</Text>
                        <Text style={styles.roundMeta}>Legacy matches without a round / week.</Text>
                      </View>
                      <View style={styles.roundCount}>
                        <Text style={styles.roundCountValue}>{unassigned.length}</Text>
                        <Text style={styles.roundCountLabel}>matches</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Card>
                  </Pressable>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            <Card style={styles.infoCard}>
              <Text style={styles.infoTitle}>Top Player of the Season</Text>
              <Text style={styles.infoText}>Top 10 players using the season scoring model across batting, bowling and fielding.</Text>
            </Card>
            {ranking.length === 0 ? <Empty text="No season performance data yet." /> : ranking.map((row, index) => (
              <Pressable key={row.name} onPress={() => openPlayer(row.playerId, seasonId)}>
                <Card style={styles.rankCard}>
                  <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>{index + 1}</Text></View>
                  <View style={styles.flexOne}>
                    <Text style={styles.rankName}>{row.name}</Text>
                    <Text style={styles.rankBreakdown}>{row.matches} matches • Bat {row.battingPoints} • Bowl {row.bowlingPoints} • Field {row.fieldingPoints}</Text>
                  </View>
                  <Text style={styles.rankPoints}>{row.totalPoints}</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </>
    );
  };

  const renderHistory = () => {
    if (selectedMatchId != null) {
      const match = matches.find(row => numberValue(row, 'id') === selectedMatchId);
      if (match) return renderMatchDetail(match);
    }

    return (
      <>
        <ScreenHeader title="Match History" subtitle="Read-only match summaries and scorecards" onBack={goHome} />
        {matches.length === 0 ? <Empty text="No matches are available yet." /> : matches.map(match => (
          <MobileMatchCard
            key={numberValue(match, 'id')}
            snapshot={snapshot}
            match={match}
            onPress={() => setSelectedMatchId(numberValue(match, 'id'))}
          />
        ))}
      </>
    );
  };

  const renderMatchDetail = (match: SnapshotRow) => {
    const matchId = numberValue(match, 'id');
    const innings = getMatchInnings(snapshot, matchId);
    const teamIds = [numberValue(match, 'team_a_id'), numberValue(match, 'team_b_id')];
    const squads = teamIds.map(teamId => ({
      teamId,
      name: getTeamName(snapshot, teamId),
      rows: table(snapshot, 'match_players')
        .filter(row => numberValue(row, 'match_id') === matchId && numberValue(row, 'team_id') === teamId)
        .sort((a, b) => numberValue(a, 'batting_order') - numberValue(b, 'batting_order')),
    }));

    return (
      <>
        <ScreenHeader
          title={matchTitle(snapshot, match)}
          subtitle={`${numberValue(match, 'overs_limit')} overs • ${formatDate(textValue(match, 'created_at'))} • View only`}
          onBack={() => setSelectedMatchId(null)}
        />

        {textValue(match, 'result_text') ? (
          <Card style={styles.resultCard}><Text style={styles.matchResult}>{textValue(match, 'result_text')}</Text></Card>
        ) : null}

        {innings.map(inn => {
          const scorecard = inningsScorecard(snapshot, numberValue(inn, 'id'));
          return (
            <View key={numberValue(inn, 'id')} style={styles.inningsWrap}>
              <View style={styles.inningsHeader}>
                <Text style={styles.inningsTeam}>{getTeamName(snapshot, numberValue(inn, 'batting_team_id'))}</Text>
                <Text style={styles.inningsTotal}>{numberValue(inn, 'runs')}/{numberValue(inn, 'wickets')} <Text style={styles.inningsOvers}>({formatOvers(numberValue(inn, 'legal_balls'))})</Text></Text>
              </View>

              <Card>
                <Text style={styles.tableTitle}>Batting</Text>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeader, styles.batterCol]}>Batter</Text>
                  <Text style={styles.tableHeader}>R</Text>
                  <Text style={styles.tableHeader}>B</Text>
                  <Text style={styles.tableHeader}>4</Text>
                  <Text style={styles.tableHeader}>6</Text>
                </View>
                {scorecard.batters.map(row => (
                  <Pressable key={row.playerId} style={styles.tableRow} onPress={() => openPlayer(row.playerId, nullableNumber(match, 'season_id'))}>
                    <View style={styles.batterCol}>
                      <Text style={styles.tableName}>{row.name}</Text>
                      <Text style={styles.dismissal}>{row.dismissed ? 'out' : 'not out'}</Text>
                    </View>
                    <Text style={styles.tableCell}>{row.runs}</Text>
                    <Text style={styles.tableCell}>{row.balls}</Text>
                    <Text style={styles.tableCell}>{row.fours}</Text>
                    <Text style={styles.tableCell}>{row.sixes}</Text>
                  </Pressable>
                ))}
                <Text style={styles.extras}>Extras: {numberValue(inn, 'wides') + numberValue(inn, 'no_balls') + numberValue(inn, 'byes') + numberValue(inn, 'leg_byes')}</Text>
              </Card>

              <Card>
                <Text style={styles.tableTitle}>Bowling</Text>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeader, styles.batterCol]}>Bowler</Text>
                  <Text style={styles.tableHeader}>O</Text>
                  <Text style={styles.tableHeader}>R</Text>
                  <Text style={styles.tableHeader}>W</Text>
                  <Text style={styles.tableHeader}>Econ</Text>
                </View>
                {scorecard.bowlers.map(row => (
                  <Pressable key={row.playerId} style={styles.tableRow} onPress={() => openPlayer(row.playerId, nullableNumber(match, 'season_id'))}>
                    <Text style={[styles.tableName, styles.batterCol]}>{row.name}</Text>
                    <Text style={styles.tableCell}>{formatOvers(row.legalBalls)}</Text>
                    <Text style={styles.tableCell}>{row.runs}</Text>
                    <Text style={styles.tableCell}>{row.wickets}</Text>
                    <Text style={styles.tableCell}>{row.legalBalls ? (row.runs / (row.legalBalls / 6)).toFixed(2) : '0.00'}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Match Squads</Text>
        {squads.map(squad => (
          <Card key={squad.teamId} style={styles.squadCard}>
            <Text style={styles.tableTitle}>{squad.name}</Text>
            {squad.rows.map((row, index) => (
              <Pressable key={`${squad.teamId}-${numberValue(row, 'player_id')}`} style={styles.squadRow} onPress={() => openPlayer(numberValue(row, 'player_id'), nullableNumber(match, 'season_id'))}>
                <Text style={styles.squadNo}>{index + 1}</Text>
                <Text style={styles.squadName}>{textValue(row, 'player_name')}</Text>
                {numberValue(row, 'is_captain') === 1 ? <Text style={styles.roleBadge}>C</Text> : null}
                {numberValue(row, 'is_vice_captain') === 1 ? <Text style={styles.roleBadge}>VC</Text> : null}
              </Pressable>
            ))}
          </Card>
        ))}
      </>
    );
  };

  const renderPlayers = () => {
    if (selectedPlayerId != null) return renderPlayerProfile(selectedPlayerId);

    const query = playerSearch.trim().toLowerCase();
    const filtered = players.filter(player => !query || textValue(player, 'name').toLowerCase().includes(query));
    return (
      <>
        <ScreenHeader title="Players" subtitle="Search players and view performance profiles" onBack={goHome} />
        <View style={styles.searchWrap}>
          <Text style={styles.filterLabel}>SEARCH PLAYER</Text>
          <TextInput
            value={playerSearch}
            onChangeText={setPlayerSearch}
            placeholder="Search by player name"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={styles.searchInput}
          />
          <Text style={styles.searchCount}>{filtered.length} player{filtered.length === 1 ? '' : 's'} found</Text>
        </View>

        {filtered.length === 0 ? <Empty text={query ? 'No players match your search.' : 'No players available yet.'} /> : filtered.map(player => {
          const playerId = numberValue(player, 'id');
          const stats = computePlayerStats(snapshot, playerId, null);
          return (
            <Pressable key={playerId} onPress={() => openPlayer(playerId)}>
              <Card style={styles.playerCard}>
                <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{textValue(player, 'name').charAt(0).toUpperCase()}</Text></View>
                <View style={styles.flexOne}>
                  <Text style={styles.playerName}>{textValue(player, 'name')}</Text>
                  <Text style={styles.playerMeta}>{stats.matches} matches • {stats.batting.runs} runs • {stats.bowling.wickets} wickets</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Card>
            </Pressable>
          );
        })}
      </>
    );
  };

  const renderPlayerProfile = (playerId: number) => {
    const name = getPlayerName(snapshot, playerId);
    const stats = computePlayerStats(snapshot, playerId, playerSeasonId);
    const selectedSeason = seasons.find(season => numberValue(season, 'id') === playerSeasonId);
    return (
      <>
        <ScreenHeader
          title={name}
          subtitle={`${stats.matches} match${stats.matches === 1 ? '' : 'es'} in selected scope`}
          onBack={() => setSelectedPlayerId(null)}
        />

        <Text style={styles.filterLabel}>PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodChips}>
          <Chip label="All Time" selected={playerSeasonId == null} onPress={() => setPlayerSeasonId(null)} />
          {seasons.map(season => (
            <Chip
              key={numberValue(season, 'id')}
              label={textValue(season, 'name')}
              selected={playerSeasonId === numberValue(season, 'id')}
              onPress={() => setPlayerSeasonId(numberValue(season, 'id'))}
            />
          ))}
        </ScrollView>

        <View style={styles.divider} />

        <View style={styles.tabs}>
          <Chip label="Batting" selected={playerTab === 'batting'} onPress={() => setPlayerTab('batting')} />
          <Chip label="Bowling" selected={playerTab === 'bowling'} onPress={() => setPlayerTab('bowling')} />
          <Chip label="Fielding" selected={playerTab === 'fielding'} onPress={() => setPlayerTab('fielding')} />
        </View>

        <Card style={styles.profileIdentityCard}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{name.charAt(0).toUpperCase()}</Text></View>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileScope}>{selectedSeason ? selectedSeason && textValue(selectedSeason, 'name') : 'All Time'} • {stats.matches} match{stats.matches === 1 ? '' : 'es'}</Text>
        </Card>

        {playerTab === 'batting' ? (
          <Card>
            <Text style={styles.profileSectionTitle}>Batting</Text>
            <View style={styles.profileGrid}>
              <ProfileStat label="Matches" value={stats.matches} />
              <ProfileStat label="Innings" value={stats.batting.innings} />
              <ProfileStat label="Runs" value={stats.batting.runs} />
              <ProfileStat label="Highest" value={stats.batting.highest} />
              <ProfileStat label="Average" value={stats.batting.average.toFixed(2)} />
              <ProfileStat label="Strike Rate" value={stats.batting.strikeRate.toFixed(2)} />
              <ProfileStat label="Balls" value={stats.batting.balls} />
              <ProfileStat label="Fours" value={stats.batting.fours} />
              <ProfileStat label="Sixes" value={stats.batting.sixes} />
              <ProfileStat label="Dismissals" value={stats.batting.dismissals} />
            </View>
          </Card>
        ) : playerTab === 'bowling' ? (
          <Card>
            <Text style={styles.profileSectionTitle}>Bowling</Text>
            <View style={styles.profileGrid}>
              <ProfileStat label="Matches" value={stats.matches} />
              <ProfileStat label="Overs" value={formatOvers(stats.bowling.legalBalls)} />
              <ProfileStat label="Wickets" value={stats.bowling.wickets} />
              <ProfileStat label="Runs Conceded" value={stats.bowling.runs} />
              <ProfileStat label="Economy" value={stats.bowling.economy.toFixed(2)} />
              <ProfileStat label="Dot Balls" value={stats.bowling.dotBalls} />
              <ProfileStat label="Best Bowling" value={`${stats.bowling.bestWickets}/${stats.bowling.bestRuns}`} />
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={styles.profileSectionTitle}>Fielding</Text>
            <View style={styles.profileGrid}>
              <ProfileStat label="Matches" value={stats.matches} />
              <ProfileStat label="Catches" value={stats.fielding.catches} />
              <ProfileStat label="Run Outs" value={stats.fielding.runOuts} />
              <ProfileStat label="Stumpings" value={stats.fielding.stumpings} />
              <ProfileStat label="Dismissals Involved" value={stats.fielding.catches + stats.fielding.runOuts + stats.fielding.stumpings} />
            </View>
          </Card>
        )}
      </>
    );
  };

  const renderLeaderboards = () => {
    const rows = computeLeaderboard(snapshot, leaderboardKind, leaderboardSeasonId);
    const selectedSeason = seasons.find(season => numberValue(season, 'id') === leaderboardSeasonId);
    return (
      <>
        <ScreenHeader
          title="Leaderboards"
          subtitle={leaderboardSeasonId == null ? 'All-time performance' : textValue(selectedSeason, 'name') || 'Season performance'}
          onBack={goHome}
        />

        <Text style={styles.filterLabel}>PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodChips}>
          <Chip label="All Time" selected={leaderboardSeasonId == null} onPress={() => setLeaderboardSeasonId(null)} />
          {seasons.map(season => (
            <Chip
              key={numberValue(season, 'id')}
              label={textValue(season, 'name')}
              selected={leaderboardSeasonId === numberValue(season, 'id')}
              onPress={() => setLeaderboardSeasonId(numberValue(season, 'id'))}
            />
          ))}
        </ScrollView>

        <View style={styles.divider} />

        <View style={styles.boardChips}>
          {(Object.keys(BOARD_LABELS) as LeaderboardKind[]).map(kind => (
            <Chip key={kind} label={BOARD_LABELS[kind]} selected={leaderboardKind === kind} onPress={() => setLeaderboardKind(kind)} />
          ))}
        </View>

        <View style={styles.boardSpacer} />
        {rows.length === 0 ? <Empty text={leaderboardKind === 'economy' ? 'No qualifying bowlers yet. Minimum 1 completed over.' : 'No statistics yet.'} /> : rows.map((row, index) => (
          <Pressable key={`${leaderboardKind}-${row.name}-${index}`} onPress={() => openPlayer(row.playerId, leaderboardSeasonId)}>
            <Card style={styles.leaderRow}>
              <View style={styles.leaderRank}><Text style={styles.leaderRankText}>{index + 1}</Text></View>
              <View style={styles.flexOne}>
                <Text style={styles.leaderName}>{row.name}</Text>
                <Text style={styles.leaderSecondary}>{row.matches} match{row.matches === 1 ? '' : 'es'}{row.detail ? ` • ${row.detail}` : ''}</Text>
                <Text style={styles.profileHint}>View profile ›</Text>
              </View>
              <Text style={styles.leaderValue}>{leaderboardKind === 'economy' ? row.value.toFixed(2) : Math.round(row.value)}</Text>
            </Card>
          </Pressable>
        ))}
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

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', minHeight: '100%', backgroundColor: colors.bg },
  container: { width: '100%', minHeight: '100%', padding: 18, paddingBottom: 50, backgroundColor: colors.bg, gap: 12 },
  flexOne: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.45 },

  browseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionCount: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  link: { color: colors.primary, fontWeight: '700' },
  refreshButton: { minHeight: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  inlineError: { color: colors.warning, fontSize: 11, lineHeight: 16 },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', minHeight: 130, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, justifyContent: 'space-between' },
  tileIcon: { fontSize: 25 },
  tileTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  tileMeta: { color: colors.muted, fontSize: 12 },
  emptyCardText: { color: colors.muted },

  historyCard: { marginBottom: 10 },
  historyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  historyMeta: { color: colors.muted, marginTop: 5, fontSize: 12 },
  historyResult: { color: colors.primary, marginTop: 8, fontWeight: '700', lineHeight: 18 },
  inProgressText: { color: colors.warning },

  seasonCard: { marginBottom: 10, padding: 0, overflow: 'hidden' },
  seasonOpenArea: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  seasonName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  seasonMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  openHint: { color: colors.primary, fontSize: 10, fontWeight: '800', marginTop: 8 },
  seasonCountWrap: { alignItems: 'center', minWidth: 62 },
  seasonCount: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  seasonCountLabel: { color: colors.muted, fontSize: 10 },

  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border },
  roundCard: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  unassignedCard: { borderColor: colors.warning },
  roundBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundBadgeText: { color: colors.primary, fontWeight: '900' },
  roundMain: { flex: 1, minWidth: 0 },
  roundName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  roundMeta: { color: colors.muted, fontSize: 10, marginTop: 4, lineHeight: 14 },
  roundCount: { alignItems: 'center', minWidth: 50 },
  roundCountValue: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  roundCountLabel: { color: colors.muted, fontSize: 9 },
  chevron: { color: colors.muted, fontSize: 26, marginLeft: 2 },
  infoCard: { backgroundColor: '#0e2b1f' },
  infoTitle: { color: colors.primary, fontWeight: '900', fontSize: 16 },
  infoText: { color: colors.muted, marginTop: 7, lineHeight: 18, fontSize: 12 },
  rankCard: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { color: colors.primary, fontWeight: '900' },
  rankName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  rankBreakdown: { color: colors.muted, fontSize: 10, marginTop: 4 },
  rankPoints: { color: colors.primary, fontSize: 23, fontWeight: '900' },

  searchWrap: { gap: 7, marginBottom: 4 },
  filterLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  searchInput: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, color: colors.text, paddingHorizontal: 14, fontSize: 15 },
  searchCount: { color: colors.muted, fontSize: 11 },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  playerName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  playerMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },

  periodScroll: { flexGrow: 0, flexShrink: 0, height: 42 },
  periodChips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  boardChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  boardSpacer: { height: 2 },
  leaderRow: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  leaderRank: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  leaderRankText: { color: colors.primary, fontWeight: '900' },
  leaderName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  leaderSecondary: { color: colors.muted, marginTop: 3, fontSize: 11 },
  profileHint: { color: colors.primary, fontSize: 10, marginTop: 4, fontWeight: '700' },
  leaderValue: { color: colors.primary, fontWeight: '900', fontSize: 22 },

  profileIdentityCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22 },
  profileAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: colors.primary, fontSize: 30, fontWeight: '900' },
  profileName: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 10 },
  profileScope: { color: colors.muted, fontSize: 11, marginTop: 4 },
  profileSectionTitle: { color: colors.text, fontWeight: '900', fontSize: 18, marginBottom: 14 },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  profileStat: { width: '47%', backgroundColor: colors.surface2, borderRadius: 14, padding: 14, minHeight: 82, justifyContent: 'center' },
  profileStatValue: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  profileStatLabel: { color: colors.muted, fontSize: 11, marginTop: 5, fontWeight: '700' },

  resultCard: { backgroundColor: '#0e2b1f' },
  matchResult: { color: colors.primary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  inningsWrap: { gap: 10 },
  inningsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  inningsTeam: { color: colors.text, fontWeight: '900', fontSize: 20, flexShrink: 1 },
  inningsTotal: { color: colors.primary, fontWeight: '900', fontSize: 20 },
  inningsOvers: { color: colors.muted, fontSize: 13 },
  tableTitle: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: 12 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 7 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#173428', paddingVertical: 9 },
  tableHeader: { flex: 0.7, color: colors.muted, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  tableCell: { flex: 0.7, color: colors.text, fontSize: 12, textAlign: 'right', fontWeight: '700' },
  batterCol: { flex: 1.8, textAlign: 'left' },
  tableName: { color: colors.text, fontWeight: '800', fontSize: 12 },
  dismissal: { color: colors.muted, fontSize: 10, marginTop: 2 },
  extras: { color: colors.muted, fontSize: 11, marginTop: 12 },
  squadCard: { marginBottom: 2 },
  squadRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#173428' },
  squadNo: { width: 24, color: colors.muted, fontSize: 10 },
  squadName: { color: colors.text, flex: 1, fontWeight: '800', fontSize: 12 },
  roleBadge: { color: colors.primary, fontSize: 9, fontWeight: '900', borderWidth: 1, borderColor: colors.primaryDark, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },

  loadingPage: { flex: 1, minHeight: '100%', width: '100%', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  loadingTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 8 },
  loadingText: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  errorTitle: { color: colors.danger, fontSize: 18, fontWeight: '900' },
  retryButton: { minHeight: 46, paddingHorizontal: 20, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryText: { color: colors.bg, fontWeight: '900' },
});
