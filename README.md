<p align="center">
  <img src="assets/images/icon.png" alt="Melio" width="128" height="128" />
</p>

<h1 align="center">Melio</h1>

<p align="center">
  <strong>Your Jellyfin library, tuned for iPhone.</strong><br />
  Offline-first music player built with Expo.
</p>

<p align="center">
  <a href="https://github.com/kgrubb/melio/actions/workflows/ci.yml"><img src="https://github.com/kgrubb/melio/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/kgrubb/melio/actions/workflows/release.yml"><img src="https://github.com/kgrubb/melio/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="GPL-3.0" /></a>
  <img src="https://img.shields.io/badge/platform-iPhone-black.svg" alt="iPhone" />
  <img src="https://img.shields.io/badge/Expo-SDK%2054-000020.svg?logo=expo" alt="Expo SDK 54" />
  <img src="https://img.shields.io/badge/node-%3E%3D24.19-339933.svg?logo=node.js&logoColor=white" alt="Node >= 24.19" />
</p>

---

Melio is a native-feeling Jellyfin music client for iOS. Browse your library, queue tracks, download for the commute, cast to speakers, and keep listening when the network flakes out.

## Screenshots

| Home | Mix |
| :---: | :---: |
| <img src="assets/screenshots/home.png" alt="Home" /> | <img src="assets/screenshots/mix.png" alt="Instant Mix" /> |

| Library | Now playing |
| :---: | :---: |
| <img src="assets/screenshots/library.png" alt="Library albums" /> | <img src="assets/screenshots/now-playing.png" alt="Now playing" /> |

| Search | Downloads |
| :---: | :---: |
| <img src="assets/screenshots/search.png" alt="Search" /> | <img src="assets/screenshots/downloads.png" alt="Downloads" /> |

## Features

| | |
|:--|:--|
| **Library that scales** | SQLite-backed Songs catalog, FlashList scrolling, sort and filter that stay snappy on large libraries |
| **Playback that sticks** | Gapless local handoffs, optional crossfade, Direct Play with smart failover, lock screen controls |
| **Offline by default** | Downloads, sync packs for albums/playlists, prefetch, and listen sync that flushes when you reconnect |
| **Home that feels personal** | Continue listening, Instant Mixes, favorites, genres, and seed-based "Your Mixes" cards |
| **Cast wherever** | AirPlay, Chromecast, and Jellyfin remote sessions from a Devices sheet |
| **Extras that matter** | Lyrics, ReplayGain, sleep timer, playlists, Autoplay / Start Radio, multi-server accounts |

CarPlay templates and play wiring are in the tree, gated until the Audio entitlement is on the App ID.

## Requirements

- macOS 15 with **Xcode 16.1+** (16.4 is fine)
- **Node 24** (see `.nvmrc`)
- CocoaPods
- Apple Developer + Expo account
- A Jellyfin server (password, Quick Connect, or SSO)

Expo Go is not supported. Use a dev client. Expo SDK 55+ needs newer Xcode and is not used here.

## Quick start

```bash
git clone https://github.com/kgrubb/melio.git
cd melio
npm ci

npx expo prebuild --clean --platform ios
npx expo run:ios
npx expo start --dev-client
```

Or open `ios/Melio.xcworkspace` in Xcode after prebuild.

### EAS

Development client:

```bash
npm i -g eas-cli@latest
eas login
eas build -p ios --profile development
npx expo start --dev-client
```

Production iOS builds run from the [Release](https://github.com/kgrubb/melio/actions/workflows/release.yml) workflow after a version tag is cut. Set `EXPO_TOKEN` on the repo. To submit to App Store Connect as well, add `EXPO_ASC_API_KEY_ID`, `EXPO_ASC_API_KEY_ISSUER_ID`, and `EXPO_ASC_API_KEY_P8`.

EAS Update is off for v1.

## Releases

Merges to `main` open a `[release vX.Y.Z]` PR from conventional commit titles (`feat` / `fix` / `perf` / breaking). Merging that PR tags the version, writes the changelog, publishes a GitHub Release, and kicks off the EAS production iOS build. See [CONTRIBUTING.md](./CONTRIBUTING.md#releases).

## CarPlay

Ready behind a feature flag. Leave it off until Apple grants the entitlement or signing fails.

1. Enable **CarPlay Audio** (`com.apple.developer.carplay-audio`) on App ID `app.melio.player`
2. Set `"CARPLAY_ENABLED": true` in `features.json`
3. `npx expo prebuild --platform ios` then rebuild

## Development

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full checklist and offline smoke notes.

## Docs

| Doc | What it covers |
| --- | --- |
| [CHANGELOG.md](./CHANGELOG.md) | What shipped (written by CI) |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to land a change, including conventional PR titles |
| [PRIVACY.md](./PRIVACY.md) | App Store / in-app privacy policy |

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, conventions, and the PR checklist.

## License

[GPL-3.0](./LICENSE) © Melio contributors

Melio is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.
