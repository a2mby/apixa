# v0.5.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Ship **Simple Mocking**: version-controlled local JSON datasets plus a small public API so developers can mock Apixa responses **without** a live backend — and remove the FastAPI `backend/` from the repo.

> Browse datasets as local files (and docs). Wire a mock transport / registry into an Apixa client. Production `defineApi` execution stays free of mocking.

## Identity (this release)

- Packages: `@apixa/core` (unchanged product surface for live HTTP) + new `@apixa/mocking` for datasets / registry / mock transport
- Tagline: Define your API once. Use it everywhere.
- Stack: TypeScript + pnpm monorepo
- Datasets: local, committed under the repo (e.g. `datasets/` or inside `packages/mocking`)

## What success looks like

```ts
import { defineApi } from "@apixa/core";
import { createMockTransport } from "@apixa/mocking";
import { loadDataset } from "@apixa/mocking/node"; // Node only

type AppApi = {
  users: { path: "/users"; entity: User };
};

const transport = createMockTransport({
  dataset: await loadDataset("users-sample"),
});

const api = defineApi<AppApi>()({
  baseURL: "https://mock.local",
  transport,
  users: { path: "/users" },
});

await api.users.getAll(); // from local JSON — no network, no backend
```

Exact dataset metadata and route-mapping shapes are locked in the implementation plan.

## Principles that bind this release

1. **Do not couple mocking to production request execution** — no Core `mocks` config on the hot path.
2. Mocking depends on Core (injectable `Transport`); Core never depends on mocking.
3. Datasets are local JSON + metadata; version-controlled; no DB / auth / hosted catalog runtime.
4. Prepare docs/shape for a **future** online catalog — do not implement hosting now.
5. No website app in this milestone — continue with docs + Next example only.
6. Remove `backend/` and backend run scripts; examples prove mocking instead of FastAPI.
7. Keep Core free of React / Next / TanStack Query.

## Intentionally out

- Apixa marketing website / dataset browse UI
- Hosted dataset service, auth, database
- Online runtime dependency for mocks
- Abort / retries / middleware product surface (separate reliability work)
- `@apixa/tanstack-query` package
- Rewriting frozen v0.1–v0.4 folders for features
