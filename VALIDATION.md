# Validation Notes — v1.1

Validated in the available build environment:

- Parsed all application `.ts` / `.tsx` source files using the TypeScript compiler API: no syntax errors.
- Parsed `package.json`, `app.json`, and `eas.json` as valid JSON.
- Executed the SQLite schema in an in-memory SQLite database.
- Confirmed the player bank supports exactly 24 seeded player rows.
- Confirmed the SQLite match constraint rejects an 11-over match.
- Confirmed the new live batter statistics query returns runs, legal balls faced, fours, and sixes.
- Confirmed the new bowler statistics query returns legal balls, runs conceded, wickets, and current-over conceded runs.
- `react-native-safe-area-context` is pinned to the Expo SDK 54 recommended `~5.6.0`.

Environment limitation:

- Dependency installation from npm timed out in this sandbox, so a full `npm run typecheck`, Expo device launch, and Android binary compilation could not be completed here.
- An EAS APK build profile and Windows build helper are included for producing the standalone APK.
