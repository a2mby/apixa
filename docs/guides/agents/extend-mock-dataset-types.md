# Extend mock dataset types (agents)

## Goal

Add a `mockConfig.type` id that autocompletes and resolves at runtime, without Core importing `@apixa/mocking`.

## Rules

- Do **not** hardcode dataset ids inside Core.
- Keep `registerDatasetPreset(id, dataset)` and `declare module "@apixa/core" { interface MockDatasetIds { … } }` in the **same file**.
- Something in the consumer program must import that file (value import or a barrel that loads it). Type-only imports of unrelated symbols do not merge ids.
- `mockConfig.type` stays `keyof MockDatasetIds | (string & {})` — open registry; do not close it to a hard enum unless the issue asks for that.

## Checklist

1. Read `packages/core/src/types/inference.ts` (`MockDatasetIds`, `ResourceMockConfigInput`).
2. Mirror `packages/mocking/src/data/users-mock.ts`:
   - `Dataset` + `registerDatasetPreset("…", dataset)`
   - `declare module "@apixa/core" { interface MockDatasetIds { "…": true } }`
3. If the preset is a package builtin: wire `ensureBuiltinPresets` in `packages/mocking/src/presets/builtins.ts` and export/register from `packages/mocking/src/data/` as needed.
4. Update `packages/mocking/README.md` only if the public story for custom ids changes.
5. Tests: extend `tests/mocking/mock-api-data.test.ts` and/or `tests/mocking/resource-mocks.test.ts` for new exports / resolve path.
6. Rebuild `@apixa/mocking` (and Core if types changed) so `dist` matches source for local consumers.
7. Example: only `examples/next` — import the module that carries the merge.

## `defineMockApi` + TanStack Query lists

- `pagination: true` → `getAll(): Promise<Page<EntityOf<type>>>` with `data`, `total`, `page`, `pageSize`, `previous`, `next`
- `pagination` false/omitted → `getAll(): Promise<EntityOf<type>[]>`
- For `useQuery`, keep the page as query data; UI reads `page.data` / `page.next` / `page.previous`. Do not `data = []` on a `Page`.

## Verify

```bash
pnpm --filter @apixa/core build
pnpm --filter @apixa/mocking build
pnpm test
```

Confirm contextual type of `mockConfig.type` includes the new literal after the merge module is in the program.
