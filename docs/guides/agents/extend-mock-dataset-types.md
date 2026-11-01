# Extend mock dataset types (agents)

## Goal

Add a `mock: "…"` id that autocompletes and resolves at runtime, without Core importing `@apixa/mocking`.

## Rules

- Built-in catalog ids already live on Core’s `MockDatasetIds` (v0.9.0). Do **not** re-merge those in mocking data modules.
- For **custom** ids: keep `registerDatasetPreset(id, dataset)` and `declare module "@apixa/core" { interface MockDatasetIds { … } }` in the **same file**.
- Something in the consumer program must import that file (value import or a barrel that loads it). Type-only imports of unrelated symbols do not merge ids.
- `mock` stays `keyof MockDatasetIds | (string & {})` — open registry; do not close it to a hard enum unless the issue asks for that.

## Checklist

1. Read `packages/core/src/types/mock-dataset-ids.ts` and `packages/core/src/types/extensions.ts`.
2. For a custom preset, mirror the README “Customizing `mock` suggestions” pattern:
   - `Dataset` + `registerDatasetPreset("…", dataset)`
   - `declare module "@apixa/core" { interface MockDatasetIds { "…": true } }`
3. If the preset is a package builtin: wire `ensureBuiltinPresets` in `packages/mocking/src/presets/builtins.ts`, export/register from `packages/mocking/src/data/`, and add the id to Core’s `MockDatasetIds`.
4. Update `packages/mocking/README.md` only if the public story for custom ids changes.
5. Tests: extend `tests/mocking/mock-api-data.test.ts` and/or `tests/mocking/resource-mocks.test.ts` for new exports / resolve path.
6. Rebuild `@apixa/mocking` (and Core if types changed) so `dist` matches source for local consumers.
7. Example: only `examples/next`.

## `defineMockApi` + TanStack Query lists

- `pagination: true` → `getAll(): Promise<Page<EntityOf<type>>>` with `data`, `total`, `page`, `pageSize`, `previous`, `next`
- `pagination` false/omitted → `getAll(): Promise<EntityOf<type>[]>`
- String shorthand: `defineMockApi({ users: "users-mock" })`
- For `useQuery`, keep the page as query data; UI reads `page.data` / `page.next` / `page.previous`. Do not `data = []` on a `Page`.

## Verify

```bash
pnpm --filter @apixa/core build
pnpm --filter @apixa/mocking build
pnpm test
```

Confirm contextual type of `mock` includes the new literal after the merge module is in the program (custom ids) or after Core’s filled `MockDatasetIds` (builtins).
