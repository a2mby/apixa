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

[`lib/api.ts`](./lib/api.ts) imports `@apixa/mocking` (registers the Core processor), then uses Core `defineApi` with:

```ts
users: {
  path: "/users",
  mock: true,
  mockConfig: { type: "users-sample", size: 100, pagination: true },
}
```

Typed entity: `import type { User } from "@apixa/mocking/data/users"`.
