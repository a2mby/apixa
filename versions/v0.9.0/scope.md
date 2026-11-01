# v0.9.0 — Scope

## In scope

### Core resource mock syntax

- Replace `mock: boolean` + `mockConfig: { type, pagination? }` with:
  - `mock?: keyof MockDatasetIds | (string & {})` — dataset id string
  - `pagination?: boolean` — sibling of `path` / `slice` / `mock` (not nested under mock)
- Keep `slice` on the resource (already correct)
- Delete `mockConfig` from public types and runtime validators
- Reject legacy shapes at define/register time with clear errors (`mock: true`, `mockConfig`, nested `type` under mock)

### Dataset-id autocomplete without `@apixa/mocking` import

- Populate Core’s `MockDatasetIds` with the known catalog ids that `defineMockApi` / inline mock can load (same set as mocking’s catalog, excluding oversized / non-unique-id datasets)
- `mock` (and `defineMockApi` string / `type`) autocomplete from Core types alone
- Stop requiring a side-effect import of `@apixa/mocking/data` (or per-dataset modules) for ids to appear
- Runtime resolution and dataset loading remain in `@apixa/mocking`

### `@apixa/mocking` bridge + `defineMockApi`

- Bridge / register path reads string `mock` + resource-level `pagination` / `slice`
- `defineMockApi` accepts per resource:
  - string: `"users-mock"`
  - or object: `{ type, slice?, pagination? }` (unchanged object fields)
- Update package README and Core-facing docs that still show `mock: true` / `mockConfig`

### Workspace deliverables

- Reshape Core types + peer-mocking validators
- Reshape mocking bridge / processor / any augmentation that still documents empty `MockDatasetIds` + import merges
- Tests under `tests/mocking/` (and Core peer tests if present) for new shape + legacy rejection
- Minimal Next migration: [`examples/next/lib/api.ts`](../../examples/next/lib/api.ts) and any remaining `mock: true` / `mockConfig` call sites
- CHANGELOG + living docs honesty (`docs/context.md`, architecture / guides that mention `mockConfig`)
- Completion note in [`docs/story.md`](../../docs/story.md)

## Out of scope

| Item                                              | Why                                               |
| ------------------------------------------------- | ------------------------------------------------- |
| `mock: { type, … }` object on `defineApi`         | No mock-only knobs this release; string is enough |
| Delay / fail rate / custom handlers / persistence | New engine features — later                       |
| Live API pagination / filter / sort conventions   | Roadmap DX follow-up, not mock syntax             |
| Rewriting frozen v0.1–v0.8 folders for new syntax | Historical; errata only                           |
| Other `examples/*` (vue, vite, …)                 | Next only                                         |
| New packages (client, server, openapi, …)         | Not this milestone                                |
| TanStack Query API changes                        | Unrelated to mock resource keys                   |

## Constraints (non-negotiable)

- No React / Next / TanStack Query in `@apixa/core`
- Core does not embed the mock engine; peer lazy-load / register stays
- Integrations → Core; never Core → mocking as a hard dependency
- Planned ≠ implemented in docs
- Prefer reshape of existing files over new abstractions
