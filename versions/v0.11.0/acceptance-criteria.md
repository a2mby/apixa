# v0.11.0 — Acceptance criteria

## Bug fixes

- [x] A response declaring `application/json` with a malformed/truncated body throws `ParseError`
      (not a silent `status: 200, body: null`). — `transport/read-body.ts`, `transport/fetch.ts`;
      `tests/core/transport-fetch.test.ts`.
- [x] `exists`, `findFirst`, and `getMany` call the resource's actually-resolved `getById`/`getAll`
      functions; overriding `getById`'s or `getAll`'s path/config changes what those composed
      builtins hit, with no `operations` entry needed for the composed builtin itself. —
      `operation/builtins.ts` (`createComposedBuiltins`), `api/resource-client.ts`;
      `tests/core/operations-builtins.test.ts`.
- [x] `findFirst` returns the correct first match (and `getMany` the correct array) when a
      resource's `getAll` is configured to return a paginated envelope (`{ data, ... }`) instead of
      a bare array. — `toArray()` helper in `operation/builtins.ts`;
      `tests/core/operations-builtins.test.ts`.
- [x] A `shouldRetry` hook with a side effect (e.g. a counter) is invoked exactly once per failed
      attempt, not twice. — `request/execute.ts`; `tests/core/reliability.test.ts`.
- [x] A top-level `defineApi` key with a missing or non-string `path` throws a clear, actionable
      error at `defineApi()` call time, on both the explicit-state and inferred-config overloads. —
      `api/define-api.ts`; `tests/core/define-api.test.ts`.
- [x] `operation/conventions.ts`'s header comment accurately describes always-on behavior (no
      leftover opt-in language).
- [x] Reading a record via a `mock: "<id>"` resource and mutating the returned object does not
      change what a subsequent call against the same dataset returns. — `mocking/src/store.ts`
      (`structuredClone` on every read/write path); `tests/mocking/operations-customization.test.ts`.
- [x] A `mock: "<id>"` resource can add/remove/override an operation via `operations`, the same way
      a `defineMockApi` resource already can. — scoped to the 5 extended static routes
      (`getBySlug`, `count`, `search`, `bulkCreate`, `bulkDelete`; `patch`/`upsert` already worked
      for free) via `resolveExtendedRoutes`/`handleExtendedRoute` in `store.ts` +
      `extendedRouteOverridesFrom` in `bridge.ts`. A genuinely new custom **function** operation
      (e.g. `archive`) still 404s against the bridge — its wire shape isn't knowable ahead of call
      time, same honest limitation as an unimplemented real backend route; documented, not silently
      papered over. Also fixed in the same pass: `findStore` previously only matched a single path
      segment past a resource's path, so a multi-segment unknown route (or `getBySlug`'s own
      default two-segment shape) silently escaped to the **live** fallback transport instead of
      404ing — now anything under a mocked resource's path is always handled by the mock store.

## Improvements

- [x] A resource with `pagination: "page"` (or `"cursor"`) exposes a typed envelope response and
      matching query params on `getAll`; a resource that doesn't declare `pagination` behaves
      exactly as before (no response/type change). Type-only (like `entity`/`list`/`query`) — zero
      runtime code path, by design. — `types/inference.ts`; `tests/core/operations-builtins.test.ts`.
- [x] A resource with `readOnly: true` has `create`/`update`/`patch`/`upsert`/`delete`/
      `bulkCreate`/`bulkDelete` absent from its generated client; an explicit `operations` entry for
      any of those names on the same resource still wins over the shorthand. —
      `operation/expand.ts`, `types/inference.ts` (`KnownOpName`);
      `tests/core/operations-builtins.test.ts`.
- [x] **Shipped as a generic `useResourceMutation(resource, opName, options)` escape hatch**
      (the scope-approved alternative to hand-wiring 11 more individual hooks) rather than
      extending `useResourceQuery` itself — same correctness-first invalidate-on-success default as
      the existing `create`/`update`/`delete` mutations, works for any of the 16 builtins or a
      fully custom operation. — `packages/tanstack-query/src/use-resource-mutation.ts`;
      `tests/tanstack-query/use-resource-mutation.test.tsx`.
- [x] Mock engine lookups are index-backed: `getById` / `exists` / `patch` are O(1) via an id→row
      `Map` maintained alongside `rows`; `update` / `delete` still need an array index for
      splice/replace (inherent to preserving array order) and stay O(n) there, kept honest in the
      code comment rather than overclaimed. No behavior change — covered by the existing CRUD
      tests, which all still pass; no new timing-based test was added (acceptance explicitly rules
      those out). — `packages/mocking/src/resource.ts`.

## Constraints held

- [x] No React/Next.js/TanStack Query dependency added to `@apixa/core`.
- [x] `pagination` and `readOnly` are both opt-in with zero behavior change when absent.
- [x] No schema validation, operation versioning/deprecation metadata, in-Core request dedup, or
      OpenAPI surface was added in this version.
- [x] `@apixa/mocking` remains a lazy, optional peer of `@apixa/core` (no new hard dependency).
- [x] Function-style operations still return plain `Promise<T>`.

## Example / docs

- [x] `docs/conventions.md` documents `pagination` and `readOnly`, and its builtins table/mock
      section no longer contains pre-pivot opt-in language anywhere.
- [x] `docs/context.md`'s milestone banner points at `versions/v0.11.0/`; v0.10.0 is referenced as
      the immediately prior (corrected-in-place) milestone, not rewritten.
- [x] `CHANGELOG.md` lists every fix and every improvement in this version as its own entry.
- [x] `docs/story.md` has a new, appended completion entry (existing entries untouched).

## Tests

- [x] One regression test exists per bug fix (parse failure, composed-builtin override ×2 — getById
      and getAll paths — envelope-aware findFirst/getMany, double retry ×2, missing-path validation
      ×2, mock-bridge mutation leak, mock-bridge operations support ×3).
- [x] One test exists per improvement (`pagination` ×2, `readOnly` ×2, `useResourceMutation` ×3).
- [x] `pnpm typecheck` passes across the whole workspace.
- [x] `npx vitest run` passes across the whole workspace (206/206), including all pre-existing
      tests — no regressions introduced while fixing the above.

## Sign-off

- [x] All checkboxes above are checked.
- [ ] A maintainer has reviewed the diff against this file's claims before the version is marked
      shipped in `versions/README.md`.
- [x] v1.0.0 planning (the first release calling the library "usable") does not start until every
      box above is checked — it can now start.
