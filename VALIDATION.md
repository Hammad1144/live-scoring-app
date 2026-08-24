# Validation — v1.2 Enhancements

Validated on the feature branch using TypeScript parsing/semantic checks with local Expo/React type stubs and an executable SQLite runtime harness.

## Passed

- Fresh database starts with **0 players**.
- Untouched legacy v1.1 databases containing only `Player 1` … `Player 24` are migrated to an empty Player Bank.
- Manually added Player Bank enforces a **30-player maximum**.
- Captain and Vice Captain persist on teams and must be different selected squad members.
- Existing match/player/team data is preserved by additive SQLite migrations.
- Match team names are snapshotted so imported/history scorecards keep the recorded names.
- Manual **End Match** saves the partial scorecard as `Match ended manually`.
- Completed match export contains match metadata, player snapshots, captain/vice-captain flags, innings and every delivery.
- Import recreates the historical scorecard and delivery history without populating the destination device's Player Bank.
- Duplicate import of the same portable match package is rejected.
- Imported matches contribute to leaderboards.
- Leaderboards expose distinct match-count reference.
- Deleting a completed/imported match removes its scorecard and cleans up hidden archive teams used only for portability.
- All TypeScript/TSX source files parse successfully.
- Local semantic type check passes with Expo/React API stubs.

## Environment limitation

`npm install` could not complete in the execution environment before timeout, so a full Expo build was not produced here. The new Expo SDK 54 dependencies use the SDK-recommended versions:

- `expo-document-picker ~14.0.8`
- `expo-file-system ~19.0.23`
- `expo-sharing ~14.0.8`
