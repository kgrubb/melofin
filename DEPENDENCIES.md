# Dependencies

Deny by default. Pin exact versions in `package.json`.

## Production

| Package | Purpose |
|---------|---------|
| `expo` (+ modules in lockfile) | SDK + router, audio, FS, SecureStore, image, glass, blur, symbols, linking, web-browser, status-bar, splash, fonts, build-properties, constants, dev-client |
| `react` / `react-native` (+ screens, safe-area, gesture-handler, web, webview, worklets) | UI + router peers |
| `react-native-reanimated` | Expo Router peer (deny-list exception) |
| `@jellyfin/sdk` + `axios` | Jellyfin API (axios is peer only) |
| `zustand` | Stores |
| `@react-native-community/netinfo` | Reachability |
| `react-native-carplay` | CarPlay (`legacy-peer-deps`) |

## Dev

`typescript`, `eslint` + `eslint-config-expo`, `vitest` + `@vitest/coverage-v8`, `@types/react`

## Denied

TrackPlayer, expo-av, AsyncStorage, lodash/ramda, uuid/nanoid, date libs, app-wide axios, React Query/SWR, immer, analytics SDKs, Redux/MobX, UI kits.
