# Skipped It

A savings app for the money you didn't spend. Every purchase you skip on purpose lands in a pile, drawn as one of six animated visuals (glass pig, crow's hoard, summit, firefly jar, money tree, galaxy), toward a target or a monthly goal.

Expo (React Native) · Skia for the visuals · everything stored on the phone, no server.

## Run it

```bash
npm install
npx expo start            # scan the QR code with Expo Go on a phone
npm test                  # logic tests (TZ=America/New_York npm test to match the design's timezone)
npx tsc --noEmit -p .     # types
npx expo lint
```

Web preview (also how the visuals are checked automatically):

```bash
npx expo export --platform web --output-dir dist-app && NODE_PATH=$(npm root -g) node e2e-app.js   # full walkthrough, screenshots in shots-app/
npx expo export --platform web --output-dir dist && NODE_PATH=$(npm root -g) node e2e-web.js galaxy 0.42      # one visual via the harness (?harness=<key>)
```

## Builds

Cloud builds run on Expo's EAS (no Mac needed). `eas.json` has the profiles:

- `preview` → Android APK you install by tapping it; iOS build for registered devices.
- `testflight` → App Store Connect / TestFlight (needs the Apple Developer Program).

GitHub Actions (`.github/workflows/eas-build.yml`) builds the Android APK on every push to `main`, or on demand for iOS. It needs one repository secret, `EXPO_TOKEN`, from expo.dev → Account settings → Access tokens. The Expo project is `blinds0r/savings-app` (`extra.eas.projectId` in `app.json`).

## Layout

- `src/model/` — types, pure logic (amount parsing, milestones, weekly run, months strip) with tests, and the persisted store.
- `src/screens/` — onboarding (2 steps), the home screen, and the sheets (log/edit, settings, share, goal reached, preview).
- `src/visuals/` — one folder per visual, each exporting a `VisualDef` (see `contract.ts`, `PORTING.md`). The harness at `?harness=<key>` on web renders any visual alone.
- `src/notify.ts` — local notifications: nudge after N quiet days, Friday heads-up when a weekly run is at risk, Sunday recap.
- `src/copy.ts`, `src/theme.ts` — per-visual wording and palettes; the chosen background scene per visual is in `theme.ts`.
