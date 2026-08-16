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
- Do not edit [CHANGELOG.md](./CHANGELOG.md). CI writes it from conventional PR titles when a release is cut.
- `patches/expo-audio+1.1.1.patch`: lock-screen next/prev, catalog duration, and JS-owned remote play/pause/seek. Drop it when upgrading past Expo SDK 54 if upstream covers those.

## Branch and commits

1. Fork (or create a branch from latest `main`)
2. Use a short branch name: `fix/...`, `feat/...`, `docs/...`
3. Keep commits focused. Prefer small PRs over kitchen-sink ones.
4. **Squash-merge** so the PR title becomes the git commit on `main`.

PR titles must be [conventional](https://www.conventionalcommits.org/):

```
feat: add sleep timer presets
fix: keep lock-screen skip from double-firing
perf: skip artwork decode on the mini player
docs: explain EAS production secrets
chore: pin vitest
```

`feat` bumps minor. `fix` and `perf` bump patch. `BREAKING CHANGE:` or `feat!:` / `fix!:` bumps major. `chore`, `docs`, `ci`, `test`, `refactor`, and `style` do not open a version bump by themselves.

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
- Use a conventional title (CI checks it)
- Describe what changed and why
- Link related issues
- Call out risk areas (playback, offline, casting, CarPlay)
- Include screenshots or a short screen recording for UI changes when you can

Maintainers review for correctness, regressions, and fit with the architecture above.

## Releases

Merges to `main` run [release-please](https://github.com/googleapis/release-please). If there are unreleased `feat` / `fix` / `perf` / breaking changes, it opens or updates a PR titled `[release vX.Y.Z]` that bumps `package.json`, `app.config.ts`, and `CHANGELOG.md`. Merging that PR tags `vX.Y.Z`, creates the GitHub Release, then (when `EXPO_TOKEN` is set) starts an EAS iOS production build. App Store submit additionally needs `EXPO_ASC_API_KEY_ID`, `EXPO_ASC_API_KEY_ISSUER_ID`, and `EXPO_ASC_API_KEY_P8`.

The release PR is opened with `GITHUB_TOKEN`, so GitHub will not run CI on it. Quality still runs on the merge to `main` before the tag is created. Do not edit the changelog or version files on that PR.

## Code of conduct

Be respectful. Assume good intent. Harassment and personal attacks are not welcome.

## Questions

Open a GitHub issue for bugs and design questions. For security-sensitive reports, prefer a private maintainer contact if one is listed on the repo. Otherwise open a minimal issue without exploit detail and ask for a private channel.
