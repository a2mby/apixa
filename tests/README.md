# Tests

Root home for Apixa automated tests of `@apixa/core` and `@apixa/mocking`.

## Run

From the repo root:

```bash
pnpm test
pnpm typecheck
```

## Layout

- `tests/core/*.test.ts` — Core behavior (definitions, operations, HTTP success/error).
- `tests/mocking/*.test.ts` — dataset load, registry, mock transport routing.
- `tests/helpers/` — fake `Transport` used by the Core suite.

Tests import packages and inject transports. They do not require the network or a live HTTP server.

See [`versions/v0.5.0/`](../versions/v0.5.0/) for the active milestone.
