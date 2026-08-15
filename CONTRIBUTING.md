# Contributing to Melio

Thanks for wanting to help. This guide is how changes get into `main`.

## Ways to contribute

- Bug reports and reproductions
- Fixes and small features
- Tests, docs, and polish
- Performance / offline reliability work

If you are unsure whether something fits, open an issue first.

## Development setup

You need:

- Node from `.nvmrc` (24+)
- macOS 15 + Xcode 16.1+
- CocoaPods
- A Jellyfin server to talk to

```bash
git clone https://github.com/kgrubb/melio.git
cd melio
npm ci

npx expo prebuild --clean --platform ios
npx expo run:ios
npx expo start --dev-client
```

Expo Go is not supported. Use a development build.

## Project conventions

- Keep route screens thin. Business logic and tests live under `src/`.
- Prefer `const`. Avoid `let` and other mutables unless required for a hot path. Prefer `for...of` / indexed helpers over `for (let i…)`. No `for...in`.
- Pin new dependency versions in `package.json`. Default to not adding packages. Ask in an issue if you need something heavy or that overlaps an existing module.
- Avoid TrackPlayer, expo-av, AsyncStorage, lodash/ramda, uuid/nanoid, date libs, app-wide axios, React Query/SWR, immer, analytics SDKs, Redux/MobX, and UI kits.
- Update [CHANGELOG.md](./CHANGELOG.md) for user-visible changes.
- `patches/expo-audio+1.1.1.patch`: lock-screen next/prev, catalog duration, and JS-owned remote play/pause/seek. Drop it when upgrading past Expo SDK 54 if upstream covers those.

## Branch and commits

1. Fork (or create a branch from latest `main`)
2. Use a short branch name: `fix/...`, `feat/...`, `docs/...`
3. Keep commits focused. Prefer small PRs over kitchen-sink ones.

Commit messages can be conventional (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`) but clarity matters more than strict prefixes.

## Checks before you open a PR

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

CI runs the same suite. A green local run saves review time.

### Manual smoke (library / offline changes)

When you touch library sync, downloads, or playback failover:

- Large library: Library Songs scrolls smoothly. Play-from-middle does not dump the full catalog into Zustand first.
- Airplane mode / Jellyfin down: Songs still list from SQLite. A downloaded track plays. An undownloaded track fails cleanly or skips to the next cached one. Reopen stays hydrated. A failed sync leaves the catalog intact.
- A completed listen still enqueues while offline and flushes on reconnect.

## Pull requests

- Target `main`
- Describe what changed and why
- Link related issues
- Call out risk areas (playback, offline, casting, CarPlay)
- Include screenshots or a short screen recording for UI changes when you can

Maintainers review for correctness, regressions, and fit with the architecture above.

## Code of conduct

Be respectful. Assume good intent. Harassment and personal attacks are not welcome.

## Questions

Open a GitHub issue for bugs and design questions. For security-sensitive reports, prefer a private maintainer contact if one is listed on the repo. Otherwise open a minimal issue without exploit detail and ask for a private channel.
