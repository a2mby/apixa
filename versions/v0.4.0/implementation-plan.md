# v0.4.0 — Implementation plan

## Design decisions (locked)

1. `defineApi<T>()(config)` — `T` is resources only; config is `ApiInput<T>` (= resources runtime + `ApiRootConfig`).
2. Resource: `path` + `entity`; derive `Omit<Entity,"id">` / `Partial<Entity>`.
3. `BuiltinHeaders` on root/resource `headers`.
4. Remove `type` / `Type` / `Infer`.
5. No store/cache / idKey this release.

## Ordered steps

1. Update this version contract + issue #21 note.
2. Add `BuiltinHeaders`; make `ApiState` resources-only; derive create/update from entity.
3. Migrate tests + Next example + docs.

## Non-steps

- Do not add schema libraries, mocking, or a store product surface.
