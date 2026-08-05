# Melio

iOS Jellyfin music client (Expo SDK 57). Offline cache, playstate reporting, CarPlay.

## Setup

- Node 24 (`.nvmrc`)
- Apple Developer + Expo account
- `npm ci`

```bash
npm i -g eas-cli@latest
eas login
eas init
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
