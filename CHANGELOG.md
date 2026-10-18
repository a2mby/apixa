# Changelog

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
