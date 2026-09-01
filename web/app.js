const CONFIG = {
  supabaseUrl: 'https://ekpvfxcphzpkchzzzkkj.supabase.co',
  publishableKey: 'sb_publishable_Llm1Z5E8dxbxg6xfcHPJyA_IHcuZM9I',
  snapshotId: 'cricketzone-main',
};

const state = {
  tables: {},
  cloud: null,
  loading: true,
  error: null,
  playerSearch: '',
  leaderboardCategory: 'runs',
  leaderboardSeason: null,
  indexes: {},
};

const NAV = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'seasons', label: 'Seasons', icon: '◫' },
  { key: 'history', label: 'History', icon: '↺' },
  { key: 'players', label: 'Players', icon: '♟' },
  { key: 'leaderboards', label: 'Leaderboards', icon: '★' },
];

const BOARD_LABELS = {
  runs: 'Top Scorer',
  sixes: 'Most Sixes',
  wickets: 'Most Wickets',
  catches: 'Most Catches',
  runOuts: 'Most Run Outs',
  economy: 'Best Economy',
};

function rows(name) {
  return Array.isArray(state.tables?.[name]) ? state.tables[name] : [];
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function oversLabel(legalBalls) {
  return `${Math.floor(n(legalBalls) / 6)}.${n(legalBalls) % 6}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || '?';
}

function buildIndexes() {
  const teamById = new Map(rows('teams').map(x => [n(x.id), x]));
  const seasonById = new Map(rows('seasons').map(x => [n(x.id), x]));
  const matchById = new Map(rows('matches').map(x => [n(x.id), x]));
  const roundById = new Map(rows('season_rounds').map(x => [n(x.id), x]));
  const playerById = new Map(rows('players').map(x => [n(x.id), x]));
  const matchPlayersByMatch = new Map();
  const inningsByMatch = new Map();
  const deliveriesByInnings = new Map();

  for (const mp of rows('match_players')) {
    const id = n(mp.match_id);
    if (!matchPlayersByMatch.has(id)) matchPlayersByMatch.set(id, []);
    matchPlayersByMatch.get(id).push(mp);
  }
  for (const inn of rows('innings')) {
    const id = n(inn.match_id);
    if (!inningsByMatch.has(id)) inningsByMatch.set(id, []);
    inningsByMatch.get(id).push(inn);
  }
  for (const delivery of rows('deliveries')) {
    const id = n(delivery.innings_id);
    if (!deliveriesByInnings.has(id)) deliveriesByInnings.set(id, []);
    deliveriesByInnings.get(id).push(delivery);
  }
  for (const list of inningsByMatch.values()) list.sort((a, b) => n(a.innings_no) - n(b.innings_no));
  for (const list of deliveriesByInnings.values()) list.sort((a, b) => n(a.seq) - n(b.seq));
  for (const list of matchPlayersByMatch.values()) list.sort((a, b) => n(a.batting_order) - n(b.batting_order));

  state.indexes = { teamById, seasonById, matchById, roundById, playerById, matchPlayersByMatch, inningsByMatch, deliveriesByInnings };
}

function teamName(match, side) {
  const snapshot = side === 'A' ? match.team_a_name_snapshot : match.team_b_name_snapshot;
  if (snapshot) return snapshot;
  const id = n(side === 'A' ? match.team_a_id : match.team_b_id);
  return state.indexes.teamById.get(id)?.name || `Team ${id}`;
}

function matchTitle(match) {
  return `${teamName(match, 'A')} vs ${teamName(match, 'B')}`;
}

function seasonName(id) {
  if (id == null) return null;
  return state.indexes.seasonById.get(n(id))?.name || null;
}

function playerNameForMatch(matchId, playerId) {
  if (playerId == null) return null;
  const mp = (state.indexes.matchPlayersByMatch.get(n(matchId)) || []).find(x => n(x.player_id) === n(playerId));
  return mp?.player_name || state.indexes.playerById.get(n(playerId))?.name || `Player ${playerId}`;
}

function matchScope(seasonId = null) {
  return rows('matches').filter(m => seasonId == null || n(m.season_id) === n(seasonId));
}

function matchStatusBadge(match) {
  const complete = String(match.status).toUpperCase() === 'COMPLETE';
  return `<span class="badge ${complete ? 'success' : 'warning'}">${complete ? 'Complete' : 'In progress'}</span>`;
}

function matchCard(match) {
  const season = seasonName(match.season_id);
  const result = match.result_text ? `<div class="match-result">${esc(match.result_text)}</div>` : '';
  return `<div class="card clickable match-card" data-route="match/${n(match.id)}">
    <div>
      <div class="match-title">${esc(matchTitle(match))}</div>
      <div class="match-meta">${season ? `${esc(season)} • ` : ''}${n(match.overs_limit)} overs • ${fmtDate(match.completed_at || match.created_at)}</div>
      ${result}
    </div>
    ${matchStatusBadge(match)}
  </div>`;
}

function routeInfo() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || 'home', parts };
}

function activeNavKey(page) {
  if (page === 'season' || page === 'round') return 'seasons';
  if (page === 'match') return 'history';
  if (page === 'player') return 'players';
  return NAV.some(x => x.key === page) ? page : 'home';
}

function pageTitle(page) {
  return NAV.find(x => x.key === activeNavKey(page))?.label || 'Cricket Zone';
}

function shell(pageHtml) {
  const route = routeInfo();
  const active = activeNavKey(route.page);
  const updated = state.cloud?.updated_at ? `Updated ${fmtDate(state.cloud.updated_at)}` : 'Cloud data';
  const nav = NAV.map(item => `<button class="nav-button ${active === item.key ? 'active' : ''}" data-route="${item.key}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
    </button>`).join('');
  const mobileNav = NAV.map(item => `<button class="${active === item.key ? 'active' : ''}" data-route="${item.key}"><span>${item.icon}</span><span>${item.label}</span></button>`).join('');

  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><img src="./icon.png" alt=""><div class="brand-copy"><strong>Cricket Zone</strong><span>Viewer Access</span></div></div>
      <nav class="nav-list">${nav}</nav>
      <div class="sidebar-bottom"><div class="sync-pill"><span class="sync-dot ${state.error ? 'error' : ''}"></span><span>${esc(updated)}</span></div></div>
    </aside>
    <main class="main-shell">
      <header class="topbar">
        <div class="topbar-title desktop-title"><h1>${esc(pageTitle(route.page))}</h1><p>Read-only Cricket Zone viewer</p></div>
        <div class="mobile-brand"><img src="./icon.png" alt=""><strong>Cricket Zone</strong></div>
        <div class="topbar-actions"><button class="ghost-button" data-action="refresh">↻ Refresh</button></div>
      </header>
      <section class="content">${pageHtml}</section>
    </main>
    <nav class="mobile-nav">${mobileNav}</nav>
  </div>`;
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function homePage() {
  const matches = [...rows('matches')].sort((a, b) => n(b.id) - n(a.id));
  const completed = matches.filter(m => String(m.status).toUpperCase() === 'COMPLETE');
  const seasons = [...rows('seasons')].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || n(b.id) - n(a.id));
  const players = rows('players');
  const recent = completed.slice(0, 5);
  const latestSeason = seasons[0];

  return `<div class="hero">
    <div class="hero-kicker">Viewer Access</div>
    <h2>Your Cricket Zone, from anywhere.</h2>
    <p>Browse seasons, scorecards, player performance and leaderboards from the latest data published by the scoring app.</p>
    <div class="hero-actions">
      <button class="primary-button" data-route="seasons">Browse Seasons</button>
      <button class="ghost-button" data-route="history">Match History</button>
    </div>
  </div>
  <div class="grid stats">
    <div class="card"><div class="stat-label">Matches</div><div class="stat-value">${matches.length}</div><div class="stat-meta">${completed.length} completed</div></div>
    <div class="card"><div class="stat-label">Seasons</div><div class="stat-value">${seasons.length}</div><div class="stat-meta">${latestSeason ? esc(latestSeason.name) : 'No season yet'}</div></div>
    <div class="card"><div class="stat-label">Players</div><div class="stat-value">${players.length}</div><div class="stat-meta">Player Bank</div></div>
    <div class="card"><div class="stat-label">Deliveries</div><div class="stat-value">${rows('deliveries').length}</div><div class="stat-meta">Recorded balls/events</div></div>
  </div>
  <div class="section-block">
    <div class="section-title"><h3>Recent results</h3><span>${recent.length ? 'Latest completed matches' : ''}</span></div>
    <div class="grid two">${recent.length ? recent.map(matchCard).join('') : empty('No completed matches are available yet.')}</div>
  </div>`;
}

function seasonMatchCount(seasonId) {
  return rows('matches').filter(m => n(m.season_id) === n(seasonId)).length;
}

function seasonsPage() {
  const seasons = [...rows('seasons')].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || n(b.id) - n(a.id));
  return `<div class="page-head"><div><h2>Seasons</h2><p>Open a season to browse its rounds, matches and player impact rankings.</p></div></div>
    <div class="grid three">${seasons.length ? seasons.map(s => `<div class="card clickable season-card" data-route="season/${n(s.id)}">
      <h3>${esc(s.name)}</h3>
      <p>${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}</p>
      <div class="season-count">${seasonMatchCount(s.id)} match${seasonMatchCount(s.id) === 1 ? '' : 'es'}</div>
    </div>`).join('') : empty('No seasons are available yet.')}</div>`;
}

function seasonImpactRanking(seasonId) {
  const scopeIds = new Set(matchScope(seasonId).map(m => n(m.id)));
  const byName = new Map();
  const ensure = name => {
    if (!byName.has(name)) byName.set(name, { name, matchIds: new Set(), batting: 0, bowling: 0, fielding: 0 });
    return byName.get(name);
  };
  for (const mp of rows('match_players')) {
    if (!scopeIds.has(n(mp.match_id))) continue;
    ensure(mp.player_name).matchIds.add(n(mp.match_id));
  }
  for (const d of rows('deliveries')) {
    if (!scopeIds.has(n(d.match_id))) continue;
    const striker = playerNameForMatch(d.match_id, d.striker_id);
    if (striker) {
      const row = ensure(striker);
      row.batting += n(d.bat_runs);
      if (n(d.bat_runs) === 4) row.batting += 4;
      if (n(d.bat_runs) === 6) row.batting += 6;
    }
    const bowler = playerNameForMatch(d.match_id, d.bowler_id);
    if (bowler) {
      const row = ensure(bowler);
      row.bowling += 20 * n(d.credited_bowler);
      if (n(d.wicket) === 1 && d.wicket_type === 'Bowled' && n(d.credited_bowler) === 1) row.bowling += 8;
      if (n(d.legal_ball) === 1 && n(d.bat_runs) === 0 && n(d.wide_runs) === 0 && n(d.no_ball_runs) === 0) row.bowling += 1;
    }
    if (n(d.wicket) === 1 && d.fielder_id != null) {
      const fielder = playerNameForMatch(d.match_id, d.fielder_id);
      if (fielder) {
        const row = ensure(fielder);
        if (d.wicket_type === 'Caught') row.fielding += 8;
        if (d.wicket_type === 'Stumped') row.fielding += 12;
        if (d.wicket_type === 'Run Out') row.fielding += 6;
      }
    }
  }
  return [...byName.values()].map(x => ({
    name: x.name,
    matches: x.matchIds.size,
    batting: x.batting,
    bowling: x.bowling,
    fielding: x.fielding,
    total: x.batting + x.bowling + x.fielding,
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function seasonPage(id) {
  const season = state.indexes.seasonById.get(n(id));
  if (!season) return notFound('Season not found.');
  const rounds = rows('season_rounds').filter(r => n(r.season_id) === n(id)).sort((a, b) => n(a.sort_order) - n(b.sort_order) || n(a.id) - n(b.id));
  const matches = matchScope(id).sort((a, b) => n(b.id) - n(a.id));
  const unassigned = matches.filter(m => m.season_round_id == null);
  const ranking = seasonImpactRanking(id).slice(0, 10);

  return `<button class="back-link" data-route="seasons">← All Seasons</button>
    <div class="page-head"><div><h2>${esc(season.name)}</h2><p>${fmtDate(season.start_date)} → ${fmtDate(season.end_date)} • ${matches.length} matches</p></div></div>
    <div class="section-block">
      <div class="section-title"><h3>Rounds / Weeks</h3><span>${rounds.length}</span></div>
      <div class="grid three">${rounds.length ? rounds.map((r, i) => {
        const count = matches.filter(m => n(m.season_round_id) === n(r.id)).length;
        return `<div class="card clickable season-card" data-route="round/${n(r.id)}"><h3>${esc(r.name)}</h3><p>${r.start_date || r.end_date ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : `Round ${i + 1}`}</p><div class="season-count">${count} match${count === 1 ? '' : 'es'}</div></div>`;
      }).join('') : empty('No rounds / weeks are available in this season.')}</div>
      ${unassigned.length ? `<div class="section-block"><div class="section-title"><h3>Unassigned Matches</h3><span>${unassigned.length}</span></div><div class="grid two">${unassigned.map(matchCard).join('')}</div></div>` : ''}
    </div>
    <div class="section-block">
      <div class="section-title"><h3>Top Players of the Season</h3><span>Impact score</span></div>
      ${ranking.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th class="numeric">Matches</th><th class="numeric">Bat</th><th class="numeric">Bowl</th><th class="numeric">Field</th><th class="numeric">Points</th></tr></thead><tbody>${ranking.map((r, i) => `<tr class="clickable" data-route="player/${encodeURIComponent(r.name)}/${n(id)}"><td class="rank">${i + 1}</td><td><strong>${esc(r.name)}</strong></td><td class="numeric">${r.matches}</td><td class="numeric">${r.batting}</td><td class="numeric">${r.bowling}</td><td class="numeric">${r.fielding}</td><td class="numeric text-primary"><strong>${r.total}</strong></td></tr>`).join('')}</tbody></table></div>` : empty('No season performance data yet.')}
    </div>`;
}

function roundPage(id) {
  const round = state.indexes.roundById.get(n(id));
  if (!round) return notFound('Round / week not found.');
  const season = state.indexes.seasonById.get(n(round.season_id));
  const matches = rows('matches').filter(m => n(m.season_round_id) === n(id)).sort((a, b) => n(b.id) - n(a.id));
  return `<button class="back-link" data-route="season/${n(round.season_id)}">← ${esc(season?.name || 'Season')}</button>
    <div class="page-head"><div><h2>${esc(round.name)}</h2><p>${round.start_date || round.end_date ? `${fmtDate(round.start_date)} → ${fmtDate(round.end_date)}` : 'Season round / week'} • ${matches.length} matches</p></div></div>
    <div class="grid two">${matches.length ? matches.map(matchCard).join('') : empty('No matches are assigned to this round yet.')}</div>`;
}

function historyPage() {
  const matches = [...rows('matches')].sort((a, b) => {
    const da = new Date(a.completed_at || a.created_at || 0).getTime();
    const db = new Date(b.completed_at || b.created_at || 0).getTime();
    return db - da || n(b.id) - n(a.id);
  });
  return `<div class="page-head"><div><h2>Match History</h2><p>Browse completed scorecards and any match currently in progress.</p></div></div>
    <div class="grid two">${matches.length ? matches.map(matchCard).join('') : empty('No matches are available yet.')}</div>`;
}

function dismissalText(delivery) {
  const matchId = delivery.match_id;
  const bowler = playerNameForMatch(matchId, delivery.bowler_id);
  const fielder = playerNameForMatch(matchId, delivery.fielder_id);
  switch (delivery.wicket_type) {
    case 'Bowled': return bowler ? `b ${bowler}` : 'bowled';
    case 'Caught': return `${fielder ? `c ${fielder}` : 'caught'}${bowler ? ` b ${bowler}` : ''}`;
    case 'Run Out': return fielder ? `run out (${fielder})` : 'run out';
    case 'Stumped': return `${fielder ? `st ${fielder}` : 'stumped'}${bowler ? ` b ${bowler}` : ''}`;
    default: return delivery.wicket_type || 'out';
  }
}

function inningsScorecard(match, innings) {
  const deliveries = state.indexes.deliveriesByInnings.get(n(innings.id)) || [];
  const batters = new Map();
  const bowlers = new Map();
  const dismissed = new Map();

  const batter = id => {
    const key = n(id);
    if (!batters.has(key)) batters.set(key, { id: key, name: playerNameForMatch(match.id, key), runs: 0, balls: 0, fours: 0, sixes: 0 });
    return batters.get(key);
  };
  const bowler = id => {
    const key = n(id);
    if (!bowlers.has(key)) bowlers.set(key, { id: key, name: playerNameForMatch(match.id, key), balls: 0, runs: 0, wickets: 0 });
    return bowlers.get(key);
  };

  for (const d of deliveries) {
    const bat = batter(d.striker_id);
    bat.runs += n(d.bat_runs);
    bat.balls += n(d.legal_ball);
    if (n(d.bat_runs) === 4) bat.fours += 1;
    if (n(d.bat_runs) === 6) bat.sixes += 1;

    const bowl = bowler(d.bowler_id);
    bowl.balls += n(d.legal_ball);
    bowl.runs += n(d.bat_runs) + n(d.wide_runs) + n(d.no_ball_runs);
    bowl.wickets += n(d.credited_bowler);

    if (n(d.wicket) === 1 && d.dismissed_player_id != null) {
      batter(d.dismissed_player_id);
      dismissed.set(n(d.dismissed_player_id), dismissalText(d));
    }
  }

  const battingOrder = new Map((state.indexes.matchPlayersByMatch.get(n(match.id)) || [])
    .filter(mp => n(mp.team_id) === n(innings.batting_team_id))
    .map(mp => [n(mp.player_id), n(mp.batting_order)]));
  const batterRows = [...batters.values()].sort((a, b) => (battingOrder.get(a.id) ?? 999) - (battingOrder.get(b.id) ?? 999));
  const bowlerRows = [...bowlers.values()].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs);
  const team = state.indexes.teamById.get(n(innings.batting_team_id))?.name || `Team ${innings.batting_team_id}`;

  return `<div class="card section-block">
    <div class="innings-head"><h3>${esc(team)} — Innings ${n(innings.innings_no)}</h3><div class="innings-score">${n(innings.runs)}/${n(innings.wickets)} <span class="muted small">(${oversLabel(innings.legal_balls)} ov)</span></div></div>
    ${batterRows.length ? `<div class="table-wrap"><table><thead><tr><th>Batter</th><th>Dismissal</th><th class="numeric">R</th><th class="numeric">B</th><th class="numeric">4s</th><th class="numeric">6s</th><th class="numeric">SR</th></tr></thead><tbody>${batterRows.map(b => `<tr><td><strong>${esc(b.name)}</strong></td><td class="muted">${esc(dismissed.get(b.id) || 'not out')}</td><td class="numeric"><strong>${b.runs}</strong></td><td class="numeric">${b.balls}</td><td class="numeric">${b.fours}</td><td class="numeric">${b.sixes}</td><td class="numeric">${b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'}</td></tr>`).join('')}</tbody></table></div>` : empty('No batting deliveries recorded.')}
    <div style="height:12px"></div>
    ${bowlerRows.length ? `<div class="table-wrap"><table><thead><tr><th>Bowler</th><th class="numeric">O</th><th class="numeric">R</th><th class="numeric">W</th><th class="numeric">Econ</th></tr></thead><tbody>${bowlerRows.map(b => `<tr><td><strong>${esc(b.name)}</strong></td><td class="numeric">${oversLabel(b.balls)}</td><td class="numeric">${b.runs}</td><td class="numeric"><strong>${b.wickets}</strong></td><td class="numeric">${b.balls ? (b.runs / (b.balls / 6)).toFixed(2) : '0.00'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="match-meta" style="margin-top:12px">Extras: Wd ${n(innings.wides)} • Nb ${n(innings.no_balls)} • B ${n(innings.byes)} • Lb ${n(innings.leg_byes)}</div>
  </div>`;
}

function matchPage(id) {
  const match = state.indexes.matchById.get(n(id));
  if (!match) return notFound('Match not found.');
  const innings = state.indexes.inningsByMatch.get(n(id)) || [];
  const season = seasonName(match.season_id);
  const result = match.result_text ? `<div class="match-result" style="font-size:14px">${esc(match.result_text)}</div>` : '';
  return `<button class="back-link" data-route="history">← Match History</button>
    <div class="card score-banner">
      <div class="score-team">${esc(teamName(match, 'A'))}</div><div class="score-vs">VS<br>${matchStatusBadge(match)}</div><div class="score-team">${esc(teamName(match, 'B'))}</div>
    </div>
    <div class="card" style="margin-top:12px"><div class="match-meta">${season ? `${esc(season)} • ` : ''}${n(match.overs_limit)} overs • ${fmtDate(match.completed_at || match.created_at)}</div>${result}</div>
    ${innings.length ? innings.map(inn => inningsScorecard(match, inn)).join('') : empty('No innings have been recorded yet.')}`;
}

function playerList() {
  const bank = rows('players').map(p => ({ id: n(p.id), name: p.name }));
  const seen = new Set(bank.map(p => p.name));
  for (const mp of rows('match_players')) if (!seen.has(mp.player_name)) { bank.push({ id: n(mp.player_id), name: mp.player_name }); seen.add(mp.player_name); }
  return bank.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function appearanceCount(name, seasonId = null) {
  const ids = new Set(matchScope(seasonId).map(m => n(m.id)));
  return new Set(rows('match_players').filter(mp => mp.player_name === name && ids.has(n(mp.match_id))).map(mp => n(mp.match_id))).size;
}

function runsForPlayer(name, seasonId = null) {
  const ids = new Set(matchScope(seasonId).map(m => n(m.id)));
  let total = 0;
  for (const d of rows('deliveries')) if (ids.has(n(d.match_id)) && playerNameForMatch(d.match_id, d.striker_id) === name) total += n(d.bat_runs);
  return total;
}

function playersPage() {
  const query = state.playerSearch.trim().toLowerCase();
  const players = playerList().filter(p => !query || String(p.name).toLowerCase().includes(query));
  return `<div class="page-head"><div><h2>Players</h2><p>Browse the Player Bank and open a profile for batting, bowling and fielding statistics.</p></div></div>
    <div class="toolbar"><input class="search" id="player-search" value="${esc(state.playerSearch)}" placeholder="Search players…" autocomplete="off"></div>
    <div class="grid three">${players.length ? players.map(p => {
      const matches = appearanceCount(p.name);
      const runs = runsForPlayer(p.name);
      return `<div class="card clickable player-card" data-route="player/${encodeURIComponent(p.name)}/all"><div class="profile-hero"><div class="avatar" style="width:48px;height:48px;border-radius:15px;font-size:17px">${esc(initials(p.name))}</div><div><h3>${esc(p.name)}</h3><p>${matches} match${matches === 1 ? '' : 'es'} • ${runs} runs</p></div></div></div>`;
    }).join('') : empty('No players match your search.')}</div>`;
}

function playerProfile(name, seasonId = null) {
  const scopeMatches = matchScope(seasonId);
  const scopeIds = new Set(scopeMatches.map(m => n(m.id)));
  const appearances = new Set(rows('match_players').filter(mp => mp.player_name === name && scopeIds.has(n(mp.match_id))).map(mp => n(mp.match_id)));
  const battingByInnings = new Map();
  let dismissals = 0;
  let bowlBalls = 0, bowlRuns = 0, wickets = 0, dots = 0;
  const bowlByInnings = new Map();
  let catches = 0, runOuts = 0, stumpings = 0;

  for (const d of rows('deliveries')) {
    if (!scopeIds.has(n(d.match_id))) continue;
    if (playerNameForMatch(d.match_id, d.striker_id) === name) {
      const key = n(d.innings_id);
      if (!battingByInnings.has(key)) battingByInnings.set(key, { runs: 0, balls: 0, fours: 0, sixes: 0 });
      const b = battingByInnings.get(key);
      b.runs += n(d.bat_runs); b.balls += n(d.legal_ball);
      if (n(d.bat_runs) === 4) b.fours++; if (n(d.bat_runs) === 6) b.sixes++;
    }
    if (n(d.wicket) === 1 && playerNameForMatch(d.match_id, d.dismissed_player_id) === name) dismissals++;
    if (playerNameForMatch(d.match_id, d.bowler_id) === name) {
      const conceded = n(d.bat_runs) + n(d.wide_runs) + n(d.no_ball_runs);
      bowlBalls += n(d.legal_ball); bowlRuns += conceded; wickets += n(d.credited_bowler);
      if (n(d.legal_ball) === 1 && n(d.bat_runs) === 0 && n(d.wide_runs) === 0 && n(d.no_ball_runs) === 0) dots++;
      const key = n(d.innings_id);
      if (!bowlByInnings.has(key)) bowlByInnings.set(key, { wickets: 0, runs: 0 });
      bowlByInnings.get(key).wickets += n(d.credited_bowler); bowlByInnings.get(key).runs += conceded;
    }
    if (n(d.wicket) === 1 && playerNameForMatch(d.match_id, d.fielder_id) === name) {
      if (d.wicket_type === 'Caught') catches++;
      if (d.wicket_type === 'Run Out') runOuts++;
      if (d.wicket_type === 'Stumped') stumpings++;
    }
  }

  const bat = [...battingByInnings.values()];
  const runs = bat.reduce((s, x) => s + x.runs, 0);
  const balls = bat.reduce((s, x) => s + x.balls, 0);
  const fours = bat.reduce((s, x) => s + x.fours, 0);
  const sixes = bat.reduce((s, x) => s + x.sixes, 0);
  const highest = bat.reduce((m, x) => Math.max(m, x.runs), 0);
  const best = [...bowlByInnings.values()].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] || { wickets: 0, runs: 0 };

  return {
    matches: appearances.size,
    batting: { innings: bat.length, runs, balls, fours, sixes, highest, dismissals, average: dismissals ? runs / dismissals : runs, strikeRate: balls ? runs / balls * 100 : 0 },
    bowling: { balls: bowlBalls, runs: bowlRuns, wickets, dots, economy: bowlBalls ? bowlRuns / (bowlBalls / 6) : 0, bestWickets: best.wickets, bestRuns: best.runs },
    fielding: { catches, runOuts, stumpings, total: catches + runOuts + stumpings },
    matchIds: [...appearances],
  };
}

function seasonChips(selected, routePrefix) {
  const seasons = [...rows('seasons')].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || n(b.id) - n(a.id));
  return `<div class="chip-row"><button class="chip ${selected == null ? 'active' : ''}" data-route="${routePrefix}/all">All Time</button>${seasons.map(s => `<button class="chip ${n(selected) === n(s.id) ? 'active' : ''}" data-route="${routePrefix}/${n(s.id)}">${esc(s.name)}</button>`).join('')}</div>`;
}

function playerPage(encodedName, scope) {
  const name = decodeURIComponent(encodedName || '');
  const seasonId = scope && scope !== 'all' ? n(scope) : null;
  const stats = playerProfile(name, seasonId);
  const scopeLabel = seasonId == null ? 'All Time' : seasonName(seasonId) || 'Season';
  const recentMatches = stats.matchIds.map(id => state.indexes.matchById.get(id)).filter(Boolean).sort((a, b) => n(b.id) - n(a.id)).slice(0, 6);
  return `<button class="back-link" data-route="players">← Players</button>
    <div class="card profile-hero"><div class="avatar">${esc(initials(name))}</div><div><h2>${esc(name)}</h2><p>${esc(scopeLabel)} • ${stats.matches} match${stats.matches === 1 ? '' : 'es'}</p></div></div>
    <div class="section-block">${seasonChips(seasonId, `player/${encodeURIComponent(name)}`)}</div>
    <div class="section-block"><div class="section-title"><h3>Batting</h3><span>${stats.batting.innings} innings</span></div><div class="metric-grid">
      <div class="metric"><strong>${stats.batting.runs}</strong><span>Runs</span></div><div class="metric"><strong>${stats.batting.highest}</strong><span>Highest</span></div><div class="metric"><strong>${stats.batting.average.toFixed(2)}</strong><span>Average</span></div><div class="metric"><strong>${stats.batting.strikeRate.toFixed(1)}</strong><span>Strike Rate</span></div><div class="metric"><strong>${stats.batting.fours}</strong><span>Fours</span></div><div class="metric"><strong>${stats.batting.sixes}</strong><span>Sixes</span></div>
    </div></div>
    <div class="section-block"><div class="section-title"><h3>Bowling</h3><span>${oversLabel(stats.bowling.balls)} overs</span></div><div class="metric-grid">
      <div class="metric"><strong>${stats.bowling.wickets}</strong><span>Wickets</span></div><div class="metric"><strong>${stats.bowling.bestWickets}/${stats.bowling.bestRuns}</strong><span>Best</span></div><div class="metric"><strong>${stats.bowling.economy.toFixed(2)}</strong><span>Economy</span></div><div class="metric"><strong>${stats.bowling.runs}</strong><span>Runs Conceded</span></div><div class="metric"><strong>${stats.bowling.dots}</strong><span>Dot Balls</span></div><div class="metric"><strong>${stats.bowling.balls}</strong><span>Legal Balls</span></div>
    </div></div>
    <div class="section-block"><div class="section-title"><h3>Fielding</h3><span>${stats.fielding.total} dismissals</span></div><div class="metric-grid">
      <div class="metric"><strong>${stats.fielding.catches}</strong><span>Catches</span></div><div class="metric"><strong>${stats.fielding.runOuts}</strong><span>Run Outs</span></div><div class="metric"><strong>${stats.fielding.stumpings}</strong><span>Stumpings</span></div>
    </div></div>
    <div class="section-block"><div class="section-title"><h3>Recent Matches</h3><span>${scopeLabel}</span></div><div class="grid two">${recentMatches.length ? recentMatches.map(matchCard).join('') : empty('No matches in this scope.')}</div></div>`;
}

function leaderboards(seasonId = null) {
  const scopeMatches = matchScope(seasonId);
  const ids = new Set(scopeMatches.map(m => n(m.id)));
  const appearances = new Map();
  const ensureAppearance = name => {
    if (!appearances.has(name)) appearances.set(name, new Set());
    return appearances.get(name);
  };
  for (const mp of rows('match_players')) if (ids.has(n(mp.match_id))) ensureAppearance(mp.player_name).add(n(mp.match_id));

  const runs = new Map(), sixes = new Map(), wickets = new Map(), catches = new Map(), runOuts = new Map(), economy = new Map();
  const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);
  for (const d of rows('deliveries')) {
    if (!ids.has(n(d.match_id))) continue;
    const striker = playerNameForMatch(d.match_id, d.striker_id);
    if (striker) { add(runs, striker, n(d.bat_runs)); if (n(d.bat_runs) === 6) add(sixes, striker, 1); }
    const bowler = playerNameForMatch(d.match_id, d.bowler_id);
    if (bowler) {
      add(wickets, bowler, n(d.credited_bowler));
      if (!economy.has(bowler)) economy.set(bowler, { balls: 0, runs: 0 });
      economy.get(bowler).balls += n(d.legal_ball);
      economy.get(bowler).runs += n(d.bat_runs) + n(d.wide_runs) + n(d.no_ball_runs);
    }
    if (n(d.wicket) === 1 && d.fielder_id != null) {
      const fielder = playerNameForMatch(d.match_id, d.fielder_id);
      if (fielder && d.wicket_type === 'Caught') add(catches, fielder, 1);
      if (fielder && d.wicket_type === 'Run Out') add(runOuts, fielder, 1);
    }
  }
  const matchLabel = name => { const c = appearances.get(name)?.size || 0; return `${c} match${c === 1 ? '' : 'es'}`; };
  const list = map => [...map.entries()].filter(([, value]) => value > 0).map(([name, value]) => ({ name, value, secondary: matchLabel(name) })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 20);
  const econ = [...economy.entries()].filter(([, x]) => x.balls >= 6).map(([name, x]) => ({ name, value: x.runs / (x.balls / 6), secondary: `${matchLabel(name)} • ${x.runs} runs / ${oversLabel(x.balls)} ov` })).sort((a, b) => a.value - b.value || a.name.localeCompare(b.name)).slice(0, 20);
  return { runs: list(runs), sixes: list(sixes), wickets: list(wickets), catches: list(catches), runOuts: list(runOuts), economy: econ };
}

function leaderboardsPage() {
  const selectedSeason = state.leaderboardSeason;
  const data = leaderboards(selectedSeason)[state.leaderboardCategory] || [];
  const seasons = [...rows('seasons')].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || n(b.id) - n(a.id));
  return `<div class="page-head"><div><h2>Leaderboards</h2><p>Compare player performance across all matches or filter the rankings to a specific season.</p></div></div>
    <div class="section-block" style="margin-top:0"><div class="stat-label" style="margin-bottom:9px">Period</div><div class="chip-row"><button class="chip ${selectedSeason == null ? 'active' : ''}" data-lb-season="all">All Time</button>${seasons.map(s => `<button class="chip ${n(selectedSeason) === n(s.id) ? 'active' : ''}" data-lb-season="${n(s.id)}">${esc(s.name)}</button>`).join('')}</div></div>
    <div class="section-block"><div class="stat-label" style="margin-bottom:9px">Leaderboard</div><div class="chip-row">${Object.entries(BOARD_LABELS).map(([key, label]) => `<button class="chip ${state.leaderboardCategory === key ? 'active' : ''}" data-board="${key}">${label}</button>`).join('')}</div></div>
    <div class="section-block"><div class="section-title"><h3>${esc(BOARD_LABELS[state.leaderboardCategory])}</h3><span>${selectedSeason == null ? 'All Time' : esc(seasonName(selectedSeason) || 'Season')}</span></div>
      <div class="grid two">${data.length ? data.map((r, i) => `<div class="card clickable leader-card" data-route="player/${encodeURIComponent(r.name)}/${selectedSeason == null ? 'all' : n(selectedSeason)}"><div class="leader-rank">${i + 1}</div><div><div class="leader-name">${esc(r.name)}</div><div class="leader-meta">${esc(r.secondary)}</div></div><div class="leader-value">${state.leaderboardCategory === 'economy' ? r.value.toFixed(2) : r.value}</div></div>`).join('') : empty('No leaderboard data is available for this selection.')}</div>
    </div>`;
}

function notFound(message) {
  return `<div class="error-box">${esc(message)}</div><div style="margin-top:12px"><button class="ghost-button" data-route="home">Return Home</button></div>`;
}

function pageHtml() {
  const { page, parts } = routeInfo();
  if (state.error) return `<div class="error-box"><strong>Unable to load cloud data.</strong><br>${esc(state.error)}</div><div style="margin-top:14px"><button class="primary-button" data-action="refresh">Try Again</button></div>`;
  if (state.loading) return `<div class="card loading-card"><div><div class="boot-spinner" style="margin:auto"></div><p>Loading cloud data…</p></div></div>`;
  switch (page) {
    case 'home': return homePage();
    case 'seasons': return seasonsPage();
    case 'season': return seasonPage(parts[1]);
    case 'round': return roundPage(parts[1]);
    case 'history': return historyPage();
    case 'match': return matchPage(parts[1]);
    case 'players': return playersPage();
    case 'player': return playerPage(parts[1], parts[2] || 'all');
    case 'leaderboards': return leaderboardsPage();
    default: return notFound('This page does not exist.');
  }
}

function render() {
  document.getElementById('app').innerHTML = shell(pageHtml());
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', () => {
    const route = el.getAttribute('data-route');
    if (route) location.hash = `#/${route}`;
  }));
  document.querySelectorAll('[data-action="refresh"]').forEach(el => el.addEventListener('click', () => loadCloud(true)));
  document.querySelectorAll('[data-board]').forEach(el => el.addEventListener('click', () => {
    state.leaderboardCategory = el.getAttribute('data-board') || 'runs'; render();
  }));
  document.querySelectorAll('[data-lb-season]').forEach(el => el.addEventListener('click', () => {
    const value = el.getAttribute('data-lb-season');
    state.leaderboardSeason = value === 'all' ? null : n(value);
    render();
  }));
  const search = document.getElementById('player-search');
  if (search) search.addEventListener('input', event => {
    const cursor = event.target.selectionStart;
    state.playerSearch = event.target.value;
    render();
    const next = document.getElementById('player-search');
    next?.focus();
    if (next && cursor != null) next.setSelectionRange(cursor, cursor);
  });
}

async function loadCloud(force = false) {
  state.loading = true;
  state.error = null;
  render();
  try {
    const url = `${CONFIG.supabaseUrl}/rest/v1/app_snapshots?id=eq.${encodeURIComponent(CONFIG.snapshotId)}&select=id,version,payload,updated_at&limit=1`;
    const response = await fetch(url, { headers: { apikey: CONFIG.publishableKey } });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}. Please verify Viewer read access for app_snapshots.`);
    const result = await response.json();
    const row = result?.[0];
    if (!row?.payload?.tables) throw new Error('No Cricket Zone cloud snapshot is available yet. Save the latest data from the Android Admin app first.');
    state.cloud = row;
    state.tables = row.payload.tables;
    buildIndexes();
    state.loading = false;
    state.error = null;
    render();
  } catch (error) {
    state.loading = false;
    state.error = error instanceof Error ? error.message : String(error);
    render();
  }
}

window.addEventListener('hashchange', () => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
});

if (!location.hash) history.replaceState(null, '', '#/home');
render();
loadCloud();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
