# Local Cricket Scorer — React Native / Expo

Offline-first cricket scoring app using React Native, TypeScript, Expo and SQLite.

## v1.2 enhancement set

### Scoring
- 1–10 over matches.
- Required run rate shown during a chase.
- Manual **End Match** action with confirmation; the current score is retained as a historical scorecard.
- Existing legal-ball, extras, wicket, batter and bowler scoring remains intact.

### Player Bank
- No players are pre-created on fresh installs.
- Add players manually one at a time.
- Rename and delete players.
- Maximum **30 players**.
- A player assigned to a team must be removed from that team before deletion.
- Untouched legacy `Player 1`–`Player 24` seed data is automatically removed during migration when no teams/matches exist.

### Team Bank
- 2–11 players per team.
- Optional Captain and Vice Captain selection.
- Captain and Vice Captain must be different squad members.
- Leadership is snapshotted with the match roster.

### Match History
- Delete completed historical matches.
- Export completed match summaries to a portable `.cricketmatch.json` file.
- Import the file on another device and recreate the recorded match summary locally.
- Portable data includes:
  - team names
  - match settings/result
  - player name snapshots
  - captain/vice-captain flags
  - innings totals/extras
  - every delivery
  - batting/bowling scorecard data derived from those deliveries
  - over-by-over history
- Imported history does **not** consume the 30-player Player Bank limit; imported rosters remain historical snapshots.
- Duplicate import of the same exported match is blocked.

### Leaderboards
- Top Scorer — total runs + number of matches.
- Most Sixes — sixes + number of matches.
- Most Wickets — wickets + number of matches.
- Best Economy — economy + number of matches + bowling reference.
- Imported matches contribute to leaderboard statistics.

## Run locally

```powershell
npm install
npx expo start
```

## Build standalone Android APK

```powershell
npm install
npm install --global eas-cli
eas login
eas build -p android --profile apk
```

The installed APK works offline. Internet is only required to perform an EAS cloud build.

## Local database

Database: `local_cricket_scorer.db`

Main tables:
- `players`
- `teams`
- `team_players`
- `matches`
- `match_players`
- `innings`
- `deliveries`

Schema changes are additive migrations so existing installed-app data is retained across APK updates.
