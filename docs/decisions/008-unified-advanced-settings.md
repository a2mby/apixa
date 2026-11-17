# ADR-008 — Unified advanced settings

**Status:** Accepted  
**Date:** 2026-11-16  
**Related:** [ADR-006](./006-operation-schema-and-simplified-api-state.md), [ADR-007](./ADR-007-apixa-v3-unified-api-contract.md)

## Context

Apixa already resolves root, resource, and operation configuration in one place (`prepareLayers`) and runs one request pipeline. Advanced behavior was spread across legacy fields (`timeout`, `retry`, `response`, `middleware`, query options). A second configuration engine would drift from those semantics.

ADR-007 already fixes path-parameter inference, response-stage relationships, pagination, retry, and middleware. This decision adds a `settings` namespace and the schema defaults that sit on that same resolver. It does not replace those contracts.

## Decision

### Scopes

There are three advanced-settings scopes, plus the existing operation layer:

```text
Apixa defaults < defineApis options.settings < defineApi settings < resource settings < operation fields < allowed call overrides
```

`defineApis(definitions, { settings })` carries collection defaults. The first argument stays a record of API names, so an API may still be named `settings` or `apis`. `defineApi` and each resource accept `settings`. Operations do not. An operation keeps its existing fields, which override inherited settings.

There is no shared mutable configuration. Each client closes over the settings resolved while it was built.

### One resolver

`resolveScopeSettings` checks a scope, rejects same-scope duplicates, and returns a layer the existing `prepareLayers` merge understands. After that merge, execution does not care whether a value came from `settings` or a legacy field.

Same-scope duplicates throw `ConfigError`. A deeper scope overriding a shallower one does not.

| Settings field                           | Existing field                                 | Merge                                                                               |
| ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `request.timeout`                        | `timeout`                                      | Whole value. A number is the total deadline. `{ total, perAttempt }` is unchanged.  |
| `retry`                                  | `retry`                                        | Whole value, including `false`. The field is `count`, not `attempts`.               |
| `response.unwrap` / `parse` / `validate` | `response.*`                                   | Per hook. `false` still disables that hook.                                         |
| `response.order`                         | none                                           | The array replaces the inherited array.                                             |
| `middleware`                             | `middleware`                                   | Hooks still concatenate from root to operation.                                     |
| `validation.strict`                      | none                                           | Most specific boolean. `false` turns strictness off.                                |
| `serialization`                          | `queryArrayFormat`, `query`, `querySerializer` | Client-wide only. Query option keys merge. The serializer and array format replace. |

`request.timeoutMs` is rejected. A number cannot express a per-attempt budget, and the existing `TimeoutOption` already can.

Headers, transforms, files, pagination, and transfers stay on their own fields. `settings` does not grow categories that do not call existing code. Upload, download, cache, diagnostics, and concurrency are not public options.

Unsafe keys (`__proto__`, `constructor`, `prototype`) are rejected. Caller objects are not mutated. Resolved retry and timeout values are copied at construction.

### Response order

When `settings.response.order` is absent, or lists the historical order, the pipeline is unchanged:

```text
unwrap → response key transform → parse → builtin normalization → response.validate
→ onResponse → schema.response → builtin result checks
```

`onResponse` and `schema.response` are not entries in `order`. Retry, request, and attempt hooks are not either. Pagination is not a stage: a paginated operation rejects a non-default order because unwrapping the envelope would drop the metadata the pagination parser needs. Streams and other non-JSON response types reject a custom order. Each of `unwrap`, `transform`, `parse`, `normalize`, and `validate` must appear once. Omitting a stage is not how a hook is disabled; `false` still is.

Mocks skip `unwrap` in every order, matching the default pipeline: mock data is already the logical result.

### Resource schemas

`schema.response` on a resource is the entity validator. It applies to builtins that return that entity:

| Operation                                 | Validation                                    |
| ----------------------------------------- | --------------------------------------------- |
| `getById`, `create`, `update`, `patch`    | the entity                                    |
| `getBy`, `findFirst`                      | the entity, or `null`                         |
| `getAll`, `getMany`, `createMany`         | each item, or each `data` item when paginated |
| `count`, `exists`, `delete`, `deleteMany` | not the entity schema                         |
| custom operations                         | not the entity schema                         |

An operation `schema.response` validates that operation's final result instead, and the entity schema is not also applied. `schema: { entity: false }` skips the entity schema. Resource `body` and `query` schemas are rejected.

The public entity type is the schema output. Response key transforms are not applied again to that output. An explicit `defineApi<ApiState>()` entity or a typed mock must be compatible with that output. Parsed output is what the call returns, per ADR-006.

`schema.error` validates a non-success HTTP body. The call still fails. A body that matches becomes `HttpError.data`. A body that does not match is a `SchemaValidationError` with `phase: "error"`, the HTTP status, and the original body. It is not a request `ValidationError` and not a successful result. `schema: { error: false }` disables an inherited error schema. Error schemas require a JSON response type because the body is already decoded. `catch` does not narrow the payload; `isHttpError` narrows to `HttpError`, and `data` stays honest about what was parsed.

`createResource({ schema: { response } })` brands the resource with the schema output. `createResource<T>()(definition)` is unchanged. An explicit `ApiState` entry still wins when it is compatible.

### Strict mode and custom GET

`settings.validation.strict: true` requires a known response type on every custom operation: `schema.response`, a literal `responseType`, a typed `response.parse`, or a typed function. Builtins already have result types. The check is static. A non-literal boolean is not treated as `true` by TypeScript, and runtime JavaScript does not reject an operation merely because the flag is set.

A custom declarative operation with no `method` is `GET`. Its kind is `read`. A body schema does not select a write method. `kind: "write"` without a method is a configuration error.

### Inspection

`inspectSettings(resource)` reads the effective collection, API, and resource settings from a `WeakMap` on that resource client. It does not add methods to the client. Headers are omitted. A string `unwrap` path is reported as that path. Functions are reported as present, not printed. Operation-level legacy overrides are not part of this view.

### Rejected

- A `settings` key inside the `defineApis` definition record. It would steal the API name `settings`.
- A fourth `settings` object on operations.
- Deep-merging retry policies. The existing rule replaces the whole policy.
- Making every response-stage permutation legal, including pagination and streams.
- Inferring multipart behavior from a Standard Schema.
- A status-to-schema map for errors.
- Placeholder options for cache, diagnostics, or concurrency.

### Deferred

Per-operation settings, status-specific error schemas, and exposing upload or security controls under `settings` when they would only duplicate existing fields. `inspectSettings` does not show operation overrides.

## Consequences

Existing configs that set no `settings` resolve through the same layer merge as before. Equivalent legacy and settings fields at different scopes override; at the same scope they throw. Clients, mocks, and React keep calling the same operations.
