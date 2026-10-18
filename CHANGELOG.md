# Changelog

## 0.3.0

### Breaking

- Operation `body` and `response` markers must use `type<T>()` from `@apixa/core`.
  `{} as User` (and other non-`Type` values) no longer type-check on those fields.

### Added

- `type<T>()`, `Type<T>`, and `Infer<M>` for branded per-operation markers.
- Inference unwraps markers so `response: type<User[]>()` yields `Promise<User[]>`.

### Notes

- Follow-ups (not in this release): `crud<>()` preset, path-param template inference.
