# Extend mock dataset types

## What you get

When you use Core with `@apixa/mocking` and set `mock: "…"`, that string picks which local dataset fills the resource. Built-in catalog ids (like `"users-mock"`) autocomplete from Core alone. You can add your own id the same way the package registers presets.

## How it works (simple)

1. Core ships known catalog ids on `MockDatasetIds` (for autocomplete without importing mocking).
2. A custom dataset file calls `registerDatasetPreset("my-id", dataset)` at runtime.
3. The same file merges `"my-id"` into `MockDatasetIds` with `declare module "@apixa/core"`.
4. Your app **imports that file** so TypeScript sees the merge. Then `"my-id"` appears in `mock` suggestions.

Core never imports `@apixa/mocking` at runtime. Custom ids are taught from the outside on purpose.

## What to do

1. Create a small module (in your app, or under `packages/mocking/src/data/` if it belongs in the package).
2. Build a `Dataset` (`meta` + `records`).
3. Call `registerDatasetPreset` with a stable string id.
4. Add the matching `declare module "@apixa/core" { interface MockDatasetIds { "your-id": true } }`.
5. Import that module from the file that calls `defineApi`.

Copy-paste shape and notes: [`packages/mocking/README.md`](../../../packages/mocking/README.md) → **Customizing `mock` suggestions**.

## Things that surprise people

- Importing only an entity type (for example `CountryCode`) does **not** add custom ids. Only modules that contain the `declare module` merge teach suggestions.
- Typos still type-check: the type is “known ids **or** any string,” because custom registry ids are legal. Missing presets fail when the mock runs, not at compile time.
- Do not put new catalog ids into Core unless you are shipping a package catalog change (v0.9.0 filled the built-in list once).
- With `defineMockApi` and `pagination: true`, `getAll()` returns a **page** (`data`, `total`, `page`, `pageSize`, `previous`, `next`), not `T[]`. In `useQuery`, keep that page as `data` and read `.data` / `.next` / `.previous` — do not default the whole page to `[]`.
