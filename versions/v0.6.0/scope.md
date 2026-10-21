# v0.6.0 — Scope

## In scope

### Cancellation and timeouts (product surface)

- Document and test per-call `signal?: AbortSignal` and `timeout?: number` on operation call options
- Preserve merge precedence already in Core (call → operation → resource → api)
- Document thrown `AbortError` / `TimeoutError` (and when each applies)
- Ensure abort cancels in-flight Fetch (and retry loops when retries land)

### Configurable retries

- Public retry config on `defineApi` (and optionally resource / operation override — lock in plan)
- Safe defaults: retry only idempotent methods (at least `GET`; configurable allow-list)
- Configurable attempt count + backoff (simple fixed or exponential — lock one in plan)
- Retry on network failures and selected HTTP statuses (e.g. 408 / 429 / 5xx — lock list)
- Do **not** retry after caller abort; do not retry non-allow-listed methods by default

### Thin middleware / interceptors

- Small public hook API (name locked in plan: `middleware` or `interceptors`)
- At least: wrap the request pipeline so callers can mutate headers / inspect request, and observe or map the response / error
- Composition: ordered list; each can call `next()`
- Not a full auth product, logging framework, or plugin marketplace

### Workspace deliverables

- Reshape [`packages/core`](../../packages/core) — **no new packages**
- Update root [`tests/`](../../tests/) (fake `Transport`) for abort, timeout, retry, middleware
- Document in Core README / CHANGELOG; show abort + retry in `examples/next` only if it stays a tiny local demo (optional; docs + tests are enough)
- Append completion note to [`docs/story.md`](../../docs/story.md) when done

### Docs

- Living roadmap / context already point here; keep honesty about deferred items (schema, client, pagination conventions)

## Out of scope

| Item                                      | Why                            |
| ----------------------------------------- | ------------------------------ |
| `@apixa/client` / `@apixa/server`         | Environment packages later     |
| Schema validation library / Zod hooks     | Separate DX milestone          |
| `@apixa/tanstack-query`                   | Integration later              |
| Live pagination / filter / sort / search  | Separate conventions milestone |
| OpenAPI import/export                     | Advanced ecosystem             |
| `@apixa/transport-fetch` split            | Fetch stays in Core            |
| Full auth / logging product surface       | Thin middleware only           |
| File upload / download / streaming        | Later                          |
| Rewriting frozen v0.1–v0.5 feature intent | Errata only                    |
| React / Next / TanStack in Core           | Forbidden                      |

## Constraints (non-negotiable)

- No React, Next.js, or TanStack Query in Core dependencies.
- No custom Promise wrappers.
- No new packages under `packages/` for this milestone.
- Do not couple mocking to production request execution.
- Do not add a schema library dependency to Core.
- Keep documentation honest: planned ≠ implemented.
