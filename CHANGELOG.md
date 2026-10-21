# Changelog

## Unreleased

### Fixed

- `@apixa/mocking` selective mock transport honors `AbortSignal` (aborted → `AbortError`) so Core cancel works with resource `mock` / `mockConfig`.

## 0.6.0

### Added

- First-class cancel / timeout on operation call options (`signal`, `timeout`) with documented `AbortError` / `TimeoutError`.
- Opt-in `retry` on `defineApi` (resource / operation overrides; `false` disables). Safe defaults: `GET` / `HEAD`, network + `408` / `429` / `5xx`, exponential backoff.
- Thin ordered `middleware` hooks (`ctx` + `next`) wrapping the full retry loop; header mutation before transport.
- Public types: `RetryConfig`, `Middleware`, `MiddlewareContext`, `MiddlewareNext`.

### Notes

- No new packages; Fetch remains inside Core. Schema validation, client/server packages, and live pagination conventions remain planned.

## Unreleased (post-0.5.0 mocking follow-ups)

### Added

- `@apixa/mocking` — `defineMockApi()`: standalone, in-memory mock API seeded from local datasets (`type`, `size`, `pagination`); typed `getAll` / `getById` / `create` / `update` / `patch` / `delete`; no `defineApi()`, no network.
- `MockApiError` with stable `code`s (`INVALID_CONFIG`, `UNKNOWN_DATASET`, `NOT_FOUND`, `DUPLICATE_ID`, `INVALID_INPUT`, `INVALID_PAGINATION`).
- `@apixa/mocking/data` — typed, read-only records for the small synthetic datasets, plus entity types for all 16 datasets `defineMockApi()` can load.
- `@apixa/mocking/register` — stable entry for Core’s optional peer lazy-load (processor + built-in presets).
- Core optional peer `@apixa/mocking`: `defineApi` with `mock` / `mockConfig` works without a side-effect `import "@apixa/mocking"`.

### Removed

- `createMockTransport()` and its options type (superseded by `defineMockApi()` / resource-level `mock`).
- `createSelectiveMockTransport` from the public exports (needed an unexported `MockStore`; still used internally by the Core bridge).
- Required side-effect `import "@apixa/mocking"` for resource-level mocks (lazy peer load replaces it).

### Notes

- Not loadable through `defineMockApi()`: `states-csc`, `states-parseapi`, `counties-parseapi` (each >500 KB; the two parseapi sets also have non-unique id fields).

## 0.5.0

### Added

- `@apixa/mocking` — `loadDataset`, `listDatasets`, `createMockTransport` (injectable Core `Transport`).
- Resource-level `mock` / `mockConfig` on Core `defineApi` via `registerDefineApiProcessor` (behavior owned by `@apixa/mocking`).
- Typed presets `@apixa/mocking/data/users` and `data/users-mock`.
- Local version-controlled datasets under `datasets/<domain>/<id>/` (`meta.json` + `data.json`) with `manifest.json` provenance.
- Imported CC0 / ODbL reference geography sets; deterministic synthetic users/products/orders/social (Faker seed).
- Sample `users-sample` dataset for demos and the Next example.
- `pnpm datasets:build` to regenerate the collection from the fixed source URL list.

### Removed

- FastAPI `backend/` and platform `run-backend` / `stop-backend` / `restart-backend` scripts.
- Happy-path dependency on `127.0.0.1:8787` in the Next / basic examples.

### Notes

- Core production Fetch path is unchanged; no Core `mocks` product API.
- A future online dataset catalog is planned only — not implemented.

## 0.4.0

### Breaking

- Removed `type()`, `Type`, and `Infer` from `@apixa/core`.
- Typed payloads use a Zustand-style resource-only state: `defineApi<AppApi>()({ … })`.
- Developer state declares `path` + `entity` only — not `create` / `update` / root `baseURL`.
- `create` / `update` bodies are derived as `Omit<Entity, "id">` / `Partial<Entity>`.
- Runtime `operations` are value-only (`method`, `path`, `headers`, `timeout`, `hasBody`).

### Added

- `BuiltinHeaders` for common header keys plus a custom-header escape hatch (types only).
- `ApiState`, `ApiInput`, `ResourceState`, and `OperationState` for the state-typing model.

## 0.3.0

### Breaking

- Operation `body` and `response` markers must use `type<T>()` from `@apixa/core`.
  `{} as User` (and other non-`Type` values) no longer type-check on those fields.

### Added

- `type<T>()`, `Type<T>`, and `Infer<M>` for branded per-operation markers.
- Inference unwraps markers so `response: type<User[]>()` yields `Promise<User[]>`.

### Notes

- **Superseded by 0.4.0** — `type()` was removed in favor of `defineApi<T>()`.
