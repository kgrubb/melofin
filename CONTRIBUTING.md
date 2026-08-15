# Contributing

Node from `.nvmrc`, then `npm ci`. Before a PR:

```bash
npm run lint && npm run typecheck && npm run test:coverage
```

Keep screens thin. Logic lives in `src/` with tests. New deps need a line in `DEPENDENCIES.md`. No `for...in`. Prefer `const`; `let` / `for` / `for…of` when clearer. Update `CHANGELOG.md` for user-visible changes.

## Perf / offline smoke

Manual checks after large library or offline work:

- Large library: Library Songs scrolls smoothly; play-from-middle does not dump the full catalog into Zustand first.
- Airplane mode / Jellyfin down: Library Songs still lists from SQLite; play a downloaded track; undownloaded track fails cleanly or skips to next cached; reopen still hydrated; a failed sync leaves the catalog intact.
- Completed listen still enqueues while offline and flushes on reconnect.
