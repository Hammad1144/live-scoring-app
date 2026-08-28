# Local Cricket Scorer — React Native / Expo

Offline-first cricket scoring app using React Native, TypeScript, Expo and SQLite.

## Current feature set

### Scoring
- 1–10 over matches.
- Required run rate shown during a chase.
- Legal-ball tracking with wides, no-balls, byes and leg-byes.
- `1D` (1 run dead): batter receives one run without strike rotation caused by that run.
- Bowled, caught, run-out and stumped dismissals.
- Caught/run-out/stumped events store the involved fielder/keeper.
- Undo last delivery.
- Completed matches can be reopened for correction and rescored.
- Manual **End Match** action with confirmation.

### Player Bank
- No players are pre-created on fresh installs.
- Add, rename and delete players.
- Maximum **30 players**.
- A player assigned to a team must be removed from that team before deletion.

### Team Bank
- 2–11 players per team.
- Optional Captain and Vice Captain selection.
- Leadership is snapshotted with the match roster.

### Seasons
- Create named seasons with start/end dates.
- Assign a season when starting a match, or leave the match unassigned.
- View all matches in a season.
- View **Top Player of the Season** impact rankings across batting, bowling and fielding.

Season impact points use a simplified Dream11-inspired short-format model:
- Batting: +1/run, +4/four, +6/six.
- Bowling: +30/wicket, +8 additional for bowled, +1 bowling dot ball.
- Fielding: +8/catch, +12/stumping, +6/run-out involvement.
- Fantasy captain/vice-captain multipliers are intentionally excluded.

### Match History / portability
- Delete completed historical matches.
- Export completed matches as `.cricketmatch.json`.
- Import the file on another device and recreate the scorecard locally.
- Portable data includes season, teams, player snapshots, leadership flags, innings, every delivery, `1D` and fielding attribution.
- Import resolves entities by **exact name**:
  - matching player/team/season → reuse existing entry;
  - missing player → add to Player Bank;
  - missing team → add to Team Bank and populate its imported squad;
  - missing season → create the imported season.
- Imported delivery/player IDs are remapped to local IDs so statistics aggregate correctly.
- Import respects the 30-player bank limit.
- Duplicate import of the same exported match is blocked.

### Leaderboards
- Filter by **All Time** or any available season.
- Top Scorer.
- Most Sixes.
- Most Wickets.
- Most Catches.
- Best Economy.
- Each row shows match-count context and opens the player profile.

### Player profiles
- All Time / Season filter.
- Batting tab: matches, innings, runs, high score, average, strike rate, balls, fours, sixes and dismissals.
- Bowling tab: overs, wickets, runs conceded, economy, dot balls and best bowling.
- Fielding tab: catches, run-outs, stumpings and total dismissals involved.

## Run locally

```powershell
npm install
npx expo start
```

For the first native Android development build:

```powershell
npx expo run:android
```

## Build standalone Android APK

Cloud APK:

```powershell
npm install --global eas-cli
eas login
eas build -p android --profile apk
```

Local debug APK:

```powershell
cd android
.\gradlew assembleDebug
```

Output:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Local database

Database: `local_cricket_scorer.db`

Main tables:
- `players`
- `teams`
- `team_players`
- `seasons`
- `matches`
- `match_players`
- `innings`
- `deliveries`

Schema changes use additive migrations so installed-app data is retained across APK updates.
