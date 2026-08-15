# Dependencies

Deny by default. Pin exact versions in `package.json`.

## Production

| Package | Purpose |
|---------|---------|
| `expo` (+ modules in lockfile) | SDK + router, audio, FS, SecureStore, image, glass, blur, symbols, linking, web-browser, status-bar, splash, fonts, build-properties, constants, dev-client |
| `expo-sqlite` | On-device library songs catalog |
| `@shopify/flash-list` | FlashList for Library / Collection / Queue |
| `react` / `react-native` (+ screens, safe-area, gesture-handler, web, webview, worklets) | UI + router peers |
| `react-native-reanimated` | Expo Router peer (deny-list exception) |
| `@jellyfin/sdk` + `axios` | Jellyfin API (axios is peer only) |
| `zustand` | Stores |
| `@react-native-community/netinfo` | Reachability |
| `react-native-carplay` | CarPlay (`legacy-peer-deps`) |
| `react-native-google-cast` | Chromecast / Google Cast sender |
| `airplay-route-picker` (local module) | iOS `AVRoutePickerView` + route events |
| `melio-audio-graph` (local module) | Next-item priming + local crossfade secondary player |

## Dev

`typescript`, `eslint` + `eslint-config-expo`, `vitest` + `@vitest/coverage-v8`, `@types/react`

## Denied

TrackPlayer, expo-av, AsyncStorage, lodash/ramda, uuid/nanoid, date libs, app-wide axios, React Query/SWR, immer, analytics SDKs, Redux/MobX, UI kits.

## Audio engine

**Decision:** Gapless + EQ should eventually share one native graph via an **expo-audio extension** (patch and/or local module), not TrackPlayer/expo-av.

**Shipping:** Playback remains expo-audio `AVPlayer` + `replace()`. `melio-audio-graph` primes the next URI and can run a secondary `AVPlayer` for local **crossfade** overlap while the primary volume ramps down. Cast clears the primed next item.

**Not yet:** True gapless handoff and EQ insert need `AVAudioEngine` scheduled nodes (ReplayGain → EQ → output). Settings hide Gapless/EQ until that lands.

**Fallback:** Crossfade Off keeps today’s single-player `replace()` path.

