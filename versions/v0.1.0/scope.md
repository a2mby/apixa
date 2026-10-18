# v0.1.0 — Scope

## In scope

### Public API

- `defineApi({ baseURL, headers?, transport?, …resources })` as the primary entry (evolve/replace `createApi`).
- Resource definitions with a `path` and **explicit** operation configuration.
- Configurable generated operations:
  - `getAll()`
  - `getByID(id)`
  - `create(body)`
  - `update(id, body)` (or equivalent clear signature)
  - `delete(id)`
- Custom operations / endpoints that **override or extend** generated ones.
- No silent invention: only generate operations the developer enables or lists.

### Types and runtime

- Infer request arguments, bodies, and response types from definitions.
- Operations return native `Promise<T>` (prefer unwrapping response data for query-fn compatibility; document the choice in the implementation plan).
- URL construction: base URL + resource path + path params + query string.
- JSON request body serialization and shared headers.
- Default Fetch transport; injectable `Transport` for tests.
- Standardized errors: at least `ApiError`, `HttpError`, `NetworkError` (keep existing hierarchy where useful).
- Response parsing for JSON (and empty bodies).

### Workspace deliverables

- Reshape [`packages/core`](../../packages/core) — no new packages.
- Rewrite [`examples/basic`](../../examples/basic) to the new API (implemented syntax only).
- Add tests under root [`tests/`](../../tests/) covering:
  - API / resource definition
  - Operation generation / overrides
  - URL / path / query building
  - Success path
  - Error path (HTTP failure / network failure as practical)

### Docs

- Living docs already describe direction; keep README and example honest about what ships.
- Update [`docs/story.md`](../../docs/story.md) when implementation lands.

## Out of scope

| Item                                            | Why                                                          |
| ----------------------------------------------- | ------------------------------------------------------------ |
| TanStack Query package / helpers                | Integration depends on Core; later milestone                 |
| OpenAPI import/export                           | Advanced ecosystem                                           |
| `@apixa/client` / `@apixa/server`               | Environment packages later                                   |
| `@apixa/transport-fetch` split                  | Fetch stays in Core (ADR 002)                                |
| `@apixa/mocking` / production `mocks` on config | Do not couple mocking to execution                           |
| Auth as a Core product surface                  | Can return later; not required to prove the idea             |
| Logging middleware as a product feature         | Optional later                                               |
| Schema validation library dependency            | Optional hooks later                                         |
| Retries, pagination, filtering conventions      | Reliability / DX follow-up                                   |
| File upload / download / streaming              | Later                                                        |
| `getBySlug`, `getByUUID`, `getBy(key, value)`   | Nice-to-have conventions; not required for v0.1.0 acceptance |
| React / Next.js dependencies                    | Forbidden in Core                                            |

## Constraints (non-negotiable)

- No React, Next.js, or TanStack Query in Core dependencies.
- No custom Promise wrappers when ordinary promises suffice.
- Custom endpoints take precedence over conventions.
- Do not invent backend endpoints the developer did not configure.
- Do not add new packages in this milestone.
- Keep documentation honest: planned ≠ implemented.
