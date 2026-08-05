# Contributing

Node from `.nvmrc`, then `npm ci`. Before a PR:

```bash
npm run lint && npm run typecheck && npm run test:coverage
```

Keep screens thin. Logic lives in `src/` with tests. New deps need a line in `DEPENDENCIES.md`. No `let` / `for`. Update `CHANGELOG.md` for user-visible changes.
