# Apixa × Next.js (primary frontend example)

Real usage of `@apixa/core` + `@apixa/mocking` inside a Next.js App Router app.

## Prerequisites

```bash
pnpm --filter @apixa/core build
pnpm --filter @apixa/mocking build
```

No live HTTP server is required for the users resource — it uses resource-level mocking.

## Run

```bash
pnpm example:next
```

Open http://localhost:3000

## API shape

[`lib/api.ts`](./lib/api.ts) uses Core `defineApi` with resource-level mocking plus v0.6.0 reliability:

```ts
defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  timeout: 10_000,
  retry: { retries: 2, methods: ["GET", "HEAD"], baseDelayMs: 150 },
  middleware: [withTrace],
  users: {
    path: "/users",
    mock: true,
    mockConfig: { type: "users-mock", slice: 100 },
  },
});
```

[`lib/users.ts`](./lib/users.ts) passes TanStack Query’s `signal` into `api.users.getAll({ signal })` so cancel maps to Core `AbortError`. Paginated envelopes stay on `mockApi.comments` in this example.

Typed entity: `import type { User } from "@apixa/mocking/data"`.

## Standalone mock API

[`lib/mock-api.ts`](./lib/mock-api.ts) uses `defineMockApi()` instead — no `defineApi()`, no network, state kept in memory:

```ts
export const mockApi = defineMockApi({
  users: { type: "users-mock", pagination: true },
  products: { type: "products-mock", slice: 50 },
});
```

`api.ts` (Core inline mocking) and `mock-api.ts` are independent and share no state.
