# Melio

iOS Jellyfin music client (Expo SDK 54). Offline cache, playstate reporting, CarPlay.

Local iOS builds target **Xcode 16.1+** (including 16.4 on macOS 15). Expo SDK 55+ requires Xcode 26 / macOS 16 and is intentionally not used here.

## Setup

- Node 24 (`.nvmrc`)
- Xcode 16.1+ (16.4 on macOS Sequoia is supported)
- CocoaPods (`pod --version`)
- Apple Developer + Expo account
- `npm ci`

### Local iOS (recommended on macOS 15)

```bash
npx expo prebuild --clean --platform ios
npx expo run:ios
# or open ios/Melio.xcworkspace in Xcode and build
npx expo start --dev-client
```

### EAS (optional)

```bash
npm i -g eas-cli@latest
eas login
eas build -p ios --profile development
npx expo start --dev-client
```

Expo Go is unsupported. CarPlay needs `com.apple.developer.carplay-audio` on App ID `app.melio.player`. EAS Update is off for v1.

## Checks

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

## Auth

Password, Quick Connect, SSO (`jellyfin-plugin-sso`). HTTP requires the insecure toggle.

Deps: [DEPENDENCIES.md](./DEPENDENCIES.md). License: MIT.
