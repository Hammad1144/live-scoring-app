# Local Cricket Scorer — React Native (Expo)

Offline-first cricket scoring mobile application built with React Native + TypeScript + Expo and SQLite.

## v1.1 UI / APK update

This package includes the requested scoring-screen refinements:

- Android safe-area handling for the **status bar and bottom navigation/home area**.
- Centered screen headers with consistent top spacing.
- Bottom sheets now respect the Android bottom safe area instead of touching system navigation.
- Main scoring content is horizontally centered with consistent margins.
- Run and extras controls use balanced grid alignment.
- Live striker and non-striker figures are visible while scoring:
  - Runs
  - Balls faced
  - 4s
  - 6s
- Live bowler figures are visible while scoring:
  - Overs
  - Runs conceded
  - Wickets
  - Runs conceded in the current over
- Ball-faced calculations now use legal deliveries, so wides/no-balls do not incorrectly increase balls faced.
- Standalone Android APK build profile is included in `eas.json`.

## Standalone Android APK

The app can be installed and used on Android **without Expo Go and without internet after installation**.

The SQLite database, player bank, teams, matches, deliveries, history and leaderboards are all stored locally on the device.

### Build the APK on Windows

Install Node.js LTS, extract the project and open PowerShell in the project folder.

Run:

```powershell
npm install
npm install --global eas-cli
eas login
eas build -p android --profile apk
```

Or use the included helper:

```powershell
.\scripts\build-apk-windows.ps1
```

EAS performs the compilation and returns a downloadable `.apk`. The resulting APK is a standalone app; Expo Go is not needed to run it.

> Building through EAS requires internet access for the build itself. Once the APK is installed, the current app works offline.

## Development / quick testing

For development testing through Expo Go:

```powershell
npm install
npx expo start
```

Or:

```powershell
.\scripts\start-windows.ps1
```

## Current product scope

### Player Bank
- Fixed 24 local player slots.
- Rename players at any time.
- Historical match scorecards preserve player-name snapshots.

### Team Bank
- Create reusable teams.
- 2–11 players per team.
- Team selection order becomes the default batting order.
- Teams used in historical matches are protected from deletion.

### Match Setup
- Select Team A and Team B.
- Select batting-first team.
- Match length restricted to **1–10 overs**.
- The 1–10 restriction is enforced in UI and by a SQLite `CHECK` constraint.
- A player cannot represent both teams in the same match.

### Scoring
- 0, 1, 2, 3, 4, 6 runs.
- Wide: 1–5 total wides.
- No Ball with runs off the bat, byes or leg byes.
- Bye and leg bye.
- Wickets:
  - Bowled
  - Caught
  - Run Out
  - Stumped
- Run out supports striker/non-striker dismissal and completed runs.
- Wide + stumped/run out supported.
- No-ball + run out supported.
- Wides/no-balls do not consume a legal ball.
- Six legal balls automatically end an over.
- Strike changes automatically on odd running runs and at over end.
- Consecutive overs by the same bowler are blocked.
- Automatic all-out, end-of-overs and chase completion.
- Two innings with automatic target calculation.
- Undo last delivery.
- Live batter and bowler mini-statistics on the scoring screen.

### Match History / Scorecard
- Completed and in-progress matches.
- Batting scorecard: R, B, 4s, 6s, SR, dismissal.
- Bowling scorecard: O, R, W, Economy.
- Extras breakdown.
- Over-by-over delivery history.
- Match result.

### Leaderboards
- Top scorer.
- Most sixes.
- Most wickets.
- Best economy (minimum 1 completed over).

## Local database

The app uses `expo-sqlite` and stores data in:

`local_cricket_scorer.db`

Main entities:
- players
- teams
- team_players
- matches
- match_players
- innings
- deliveries

Deliveries are stored event-by-event. Each delivery also stores an innings state snapshot used by Undo.

## Architecture

```text
App.tsx
eas.json
src/
  components/
    UI.tsx
  data/
    database.ts
  logic/
    cricket.ts
  screens/
    HomeScreen.tsx
    PlayersScreen.tsx
    TeamsScreen.tsx
    TeamEditorScreen.tsx
    MatchSetupScreen.tsx
    InningsSetupScreen.tsx
    ScoringScreen.tsx
    HistoryScreen.tsx
    MatchDetailScreen.tsx
    LeaderboardsScreen.tsx
  theme.ts
  types.ts
```

## Recommended next enhancements

- Edit any previous delivery, not only Undo.
- Fall of wickets and partnership analysis.
- Maiden overs and best bowling figures.
- Toss winner + toss decision.
- Player photos and custom team logos.
- Match export/backup and restore.
- Tournament/series support.
- Cloud sync and spectator live-score URL.
- Manual innings declaration/retirement and advanced dismissal types.
