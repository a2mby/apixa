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
- `tests/core/*.test.ts` also covers the client-scoped mock engine, operation independence, HTTP security, headers, retry/timeout, middleware, transforms, config validation, `defineApis`, and compile-time contracts (`types-architecture.test.ts`).
- `tests/mocking/*.test.ts` — dataset catalog + lazy loading, Node loaders, standalone `defineMockApi()` on the shared engine.
- `tests/helpers/` — fake `Transport` and shared type helpers.

Tests import packages and inject transports. They do not require the network or a live HTTP server.

See [`versions/v0.5.0/`](../versions/v0.5.0/) for the active milestone.
