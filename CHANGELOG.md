# Changelog

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
