# v0.1.0 — Acceptance criteria

Check every item before calling v0.1.0 done.

## API and types

- [x] `defineApi` is the documented public entry for creating a client.
- [x] A `users` resource can be defined in a few lines with `path` and explicit operations.
- [x] Configured operations include at least `getAll`, `getByID`, and `create` (plus `update` / `delete` if enabled in the resource config).
- [x] TypeScript infers argument and response types for those operations without manual cast noise at call sites.
- [x] Operations return native promises (`Promise<T>` preferred).
- [x] A custom operation with the same name as a convention **overrides** the generated behavior.
- [x] Operations that were not configured are **not** present on the client (no silent invention).

## Runtime behavior

- [x] Successful requests execute over the default Fetch transport (or an injected `Transport` in tests).
- [x] Path parameters and query parameters are applied correctly to the final URL.
- [x] JSON request bodies and shared headers are sent as defined.
- [x] Non-OK HTTP responses throw a documented error type (`HttpError` or subclass of `ApiError`).
- [x] Network / transport failures surface as documented error types where applicable.

## Constraints

- [x] `@apixa/core` has no React, Next.js, or TanStack Query dependencies.
- [x] No new packages under `packages/` for this milestone.
- [x] Production request path does not require or expose a Core `mocks` product API.
- [x] Fetch remains the default transport **inside** Core (no premature `@apixa/transport-fetch`).

## Example and docs

- [x] `examples/frontends/basic` runs against the **implemented** `defineApi` API.
- [x] README usage matches implemented behavior (not aspirational only).
- [x] Planned ecosystem packages remain clearly marked as future in docs/README.

## Tests

- [x] Root tests cover definition, generation/overrides, URL building, success path, and error path.
- [x] Tests use an injectable / fake transport (no flaky live network requirement).
- [x] `pnpm` typecheck and test scripts relevant to Core pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or consciously waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note.

Implementation-plan notes: all eight steps completed. Auth, middleware, and mock modules were **deleted** (not kept as unexported internals) after they were removed from the production request path. Timeout/`AbortSignal` remain in the pipeline as low-cost existing behavior, not as a documented product surface. Operations unwrap response data as `Promise<T>`.
