# v0.3.0 — Scope

## In scope

### Public API

- Marker helper in `packages/core/src/types/marker.ts`:
  - `declare const brand: unique symbol;`
  - `export interface Type<T> { readonly [brand]: T }`
  - `export const type = <T>(): Type<T> => ({}) as Type<T>;` (the only cast allowed for markers)
  - `export type Infer<M> = M extends Type<infer T> ? T : never;`
- Per-operation markers on `OperationDefinition`:
  - `body?: Type<unknown>`
  - `response?: Type<unknown>` (when present; missing ⇒ inferred response `unknown`)
- Inference extracts through `Infer<Op["body"]>` and `Infer<Op["response"]>`.
- Export `type`, `Type`, and `Infer` from the package entry point next to `defineApi`.
- User-facing shape:

```ts
getAll:  { method: "GET", response: type<User[]>() }
create:  { method: "POST", body: type<Omit<User, "id">>(), response: type<User>() }
delete:  { method: "DELETE", path: "/:id", response: type<void>() }
```

- **Breaking:** `{} as User` (or any non-`Type` value) is not assignable to `body` / `response`. Document in docs and a changelog entry.

### Types and runtime

- Update `InferBody` / `InferResponse` in Core inference to unwrap `Type<T>` via `Infer<>`.
- Path arity and positional call conventions from prior releases stay (no call-style change).
- Runtime still does not read marker values for typing; execution behavior unchanged aside from type surface.

### Workspace deliverables

- Reshape under `packages/core/src/` — no new packages, no new dependencies.
- Root tests for marker inference and rejection of `{} as T` on markers.
- Local Next example (`examples/next`) updated to `type<T>()` when implementing.
- Living docs, README, `CHANGELOG.md` (create if missing), and `docs/story.md`.

### Docs

- Describe `type<T>()` as the supported marker DX.
- Document breaking change from `{} as T`.
- List follow-ups (`crud<>()`, path-param inference) as planned, not implemented.

## Out of scope

| Item                                                      | Why                                                     |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Resource-level `types` bag                                | Deferred; use per-op markers only                       |
| Inferring types from method / path / op names             | Explicit markers only                                   |
| `crud<>()` preset                                         | Follow-up; no Core type changes required beyond markers |
| Path-param template-literal inference                     | Follow-up                                               |
| Schema libraries / runtime validation                     | Later milestones                                        |
| Codegen / OpenAPI                                         | Later                                                   |
| Call-style changes (object bags, etc.)                    | Out                                                     |
| AbortSignal / retries / middleware / mocking / pagination | Reliability later (see roadmap)                         |
| New workspace packages                                    | Core-only                                               |
| Rewrite frozen `versions/v0.1.0/` or `versions/v0.2.0/`   | Errata only                                             |

## Follow-ups (not built in 0.3.0)

- `crud<Entity, Create = Omit<Entity, "id">, Update = Partial<Entity>>()` returning typed operation objects for spread into `operations`, overridable per operation. Envelopes configured at preset level.
- Path param inference from `"/:id"` via template-literal types.

## Constraints (non-negotiable)

- No React, Next.js, or TanStack Query in Core.
- No custom Promise wrappers.
- No new npm dependencies for this milestone.
- Keep documentation honest: planned ≠ implemented.
- The only intentional cast for markers is inside `type<T>()`.
