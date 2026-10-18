# v0.4.0 — Scope

## In scope

### Public API

- Zustand-style `defineApi<T>()(config)` where `T` is **resources only**
- Root builtins always from Core (not on `T`): `baseURL`, `headers?`, `transport?`, `timeout?`
- Resource state: `path` + `entity` (+ optional `headers` / `timeout` / `operations`)
- **Derive** CRUD bodies: `create` = `Omit<Entity, "id">`, `update` = `Partial<Entity>` (fixed `"id"`; no developer `create` / `update` keys)
- `BuiltinHeaders` — common optional header keys + index escape hatch (types only)
- Operation state may include type-only `body` / `response` / `query` for custom ops
- **Remove** public `type`, `Type`, and `Infer`
- Path arity / positional call conventions unchanged

### Runtime

- `OperationDefinition` is value-only: `method`, `path`, `headers`, `timeout`, `hasBody?`
- `hasBody` defaults for builtin `create` / `update`; custom body ops set `hasBody: true`
- No automatic header injection

### Workspace deliverables

- Reshape Core types; no new packages / deps
- Tests for entity-only state, derived create/update, BuiltinHeaders, removal of `type`
- Next example uses entity-only `AppApi`
- README, CHANGELOG, living docs, story

## Out of scope

| Item                                         | Why                           |
| -------------------------------------------- | ----------------------------- |
| Store / cache product surface                | Core stays framework-agnostic |
| `idKey` / custom primary key                 | Later                         |
| Schema / Zod validation                      | Later                         |
| `crud<>()` sugar helper                      | Follow-up                     |
| Mocking package / website datasets           | Separate milestone            |
| Abort / retries / middleware product surface | Reliability later             |
| Credentials helpers                          | Later                         |
| New packages                                 | Core-only                     |
| Rewrite frozen v0.1–v0.3 for features        | Errata only                   |

## Constraints

- No React / Next / TanStack Query in Core
- No custom Promise wrappers
- Keep docs honest about the breaking removal of `type()`
