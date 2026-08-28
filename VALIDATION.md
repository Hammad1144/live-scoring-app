# Validation Checklist — v1.4 Feature Branch

Run these checks before merging PR #2.

## Core regression
- Fresh database starts with 0 players.
- Player Bank enforces the 30-player maximum.
- Team creation/editing and Captain/Vice Captain remain functional.
- Existing SQLite data survives additive migrations.
- 1–10 over match limit remains enforced.
- Existing wides/no-balls/byes/leg-byes/wickets/undo still work.

## 1D and fielding
- Legal `1D` gives the striker +1 run without changing strike because of the run.
- `1D` on the sixth legal ball still performs the normal end-of-over strike swap.
- `Nb + 1D` gives 2 team runs (1 no-ball + 1 batter run) without strike rotation caused by the batter run.
- Caught, Run Out and Stumped require selection of an involved bowling-team player.
- Scorecard dismissal text shows the selected fielder/keeper.
- Most Catches counts caught dismissals only.

## Completed-match correction
- Complete a match and open Match Summary.
- Use Edit Scoring / Undo Balls.
- Undo the final delivery, correct it and complete the match again.
- Undo all second-innings deliveries and verify correction can continue into the first innings.

## Seasons
- Create multiple seasons with valid date ranges.
- Start matches assigned to different seasons.
- Start an unassigned match using No Season.
- Season detail shows only matches assigned to that season.
- Leaderboards switch correctly between All Time and each season.
- Top Player of the Season shows batting/bowling/fielding point breakdowns.

## Player profiles
- Open a profile from every leaderboard category.
- Open a profile from season rankings.
- Switch All Time / Season filters.
- Verify Batting, Bowling and Fielding tabs against known scorecards.

## Import/export
- Export a completed season match containing `1D` and fielding dismissals.
- Import it into a fresh database.
- Missing season is created.
- Missing teams are created and visible in Team Bank.
- Missing players are created in Player Bank.
- Re-import with exact-name players/teams already present and confirm no duplicates are created.
- Imported scorecard matches the source device.
- Imported stats contribute to All Time and Season leaderboards/player profiles.
- Duplicate import of the same portable package is rejected.
- Import returns a clear error if new players would exceed the 30-player limit.

## Local checks

```powershell
npm run typecheck
npx expo start --clear
```

No additional native dependency is introduced by the season/profile enhancement, so the existing development build can be reused for normal Metro/Fast Refresh testing after the SQLite migration runs.
