# v0.2.0 — Scope

## In scope

### Public API

- Path-only resources receive built-in operations automatically:
  - `getAll()`
  - `getByID(id)`
  - `create(body)`
  - `update(id, body)`
  - `delete(id)`
- `operations` is **optional**. When omitted, all five builtins exist with convention method/path defaults.
- When `operations` is present, entries are **partial overrides** (and/or custom ops), not a replacement of the full builtin set.
- Resource-level `headers` (and other resource options already supported or wired in this milestone) apply to builtins and custom ops unless overridden.
- Resource-level `request` settings that map cleanly onto the existing transport/`fetch` path (for example `credentials`) may be added if implemented end-to-end — not as type-only stubs.
- Type markers `body` / `response` / `query` remain for inference (no Zod/etc. dependency).
- Precedence: API defaults → resource config → builtin defaults → operation overrides → per-call options (existing `RequestOptions`).

### Types and runtime

- Infer resource clients that always include the five builtins plus any custom operation keys.
- Preserve autocomplete for overrides and custom ops.
- Reuse the existing request pipeline (`request/`, `http/`, `transport/`).
- Header merge by key; path join stays deterministic; method overrides are scalar replaces.

### Workspace deliverables

- Reshape Core under `packages/core/src/` — no new packages.
- Update ignored local examples that we still maintain (`examples/basic`, `examples/next`) to the minimal path-first style.
- Expand root tests for defaults, merges, overrides, and custom coexistence.
- Update living docs, README, and `docs/story.md`.

### Docs

- Living docs describe default-first resources as the primary DX.
- Mark schema validation and extra conventions as planned where still future.

## Out of scope

| Item                                                        | Why                                          |
| ----------------------------------------------------------- | -------------------------------------------- |
| Runtime schema validation library / `schema:` product API   | Roadmap hooks later; v0.1.0 already deferred |
| Object-style args (`getByID({ id })`)                       | Prefer existing positional conventions       |
| `getBySlug`, `getByUUID`, `getBy`                           | Nice-to-have; not required                   |
| Retries, pagination, middleware product surface             | Separate reliability/DX work                 |
| TanStack Query / OpenAPI / mocking / client-server packages | Later milestones                             |
| New workspace packages                                      | Core-only                                    |
| Custom TypeScript transforms / codegen                      | Forbidden                                    |

## Constraints (non-negotiable)

- No React, Next.js, or TanStack Query in Core.
- No custom Promise wrappers.
- Explicit operation overrides and custom ops take precedence over builtins for that name.
- Do not invent schemas or claim URL alone infers model types.
- Keep documentation honest: planned ≠ implemented.
- Do not rewrite the frozen `versions/v0.1.0/` folder except factual errata.
