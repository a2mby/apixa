# v0.5.0 — Scope

## In scope

### Simple mocking concept + public API

- New workspace package `@apixa/mocking` (depends on `@apixa/core`; Core does not depend on it)
- Public surface (names finalized in implementation):
  - Dataset load / registry (on-demand load of local datasets)
  - Mapping from dataset records → Apixa resource operations (at least builtin CRUD for a path resource)
  - `createMockTransport` (or equivalent) implementing Core’s `Transport` so `defineApi({ transport })` serves mocks
- Document that live Fetch path in Core is unchanged and does not read mock config

### Local JSON datasets + metadata

- Version-controlled datasets under the repo (preferred: `datasets/` at root **or** `packages/mocking/datasets/` — pick one in the plan and stick to it)
- Metadata format: id, title/description, record count, schema summary, license, version, resource/operation hints
- At least one sample dataset suitable for the Next `users` example

### Registry

- Lightweight registry: list available local datasets + load by id on demand
- No network calls; no remote catalog client

### Remove FastAPI backend

- Delete `backend/` (app, requirements, scenarios, README)
- Remove or rewrite platform `run-backend` / `stop-backend` / `restart-backend` scripts
- Update README, `scripts/README.md`, living docs, and Next example env so nothing assumes `127.0.0.1:8787` FastAPI
- Next example uses `@apixa/mocking` (or documents how) instead of the backend

### Docs / future catalog

- Living docs + CHANGELOG describe Simple Mocking as implemented
- Short “future online catalog” note (planned) — no implementation
- `docs/story.md` kickoff + completion when done

### Tests

- Unit tests for dataset load, registry, mock transport routing (fake filesystem or fixtures)
- Ensure Core production path still has no `mocks` product API

## Out of scope

| Item | Why |
| --- | --- |
| Apixa website / dataset browse pages | Explicitly deferred — no site in repo |
| Hosted catalog, auth, DB, CDN | Future |
| Online runtime fetch of datasets | Local only this release |
| Core `mocks` on `defineApi` config | Must not couple mocking to production execution |
| Abort / retries / middleware product surface | Other reliability work |
| `@apixa/tanstack-query` package | Later integration |
| Schema validation library | Later |
| Rewriting frozen v0.1–v0.4 | Errata only |

## Constraints (non-negotiable)

- No React / Next / TanStack Query in `@apixa/core` or as Core dependencies
- Mocking must not hitch a ride on Core’s production request pipeline as a product feature
- Integrations / mocking → Core; never Core → mocking
- Keep docs honest: planned ≠ implemented
