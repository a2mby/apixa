# v1.6.0 — Scope

## In scope

| Area                       | Item                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transfer through hooks     | Runtime tests that upload/download with `onTransfer` through `useResourceQuery` (args), `useResourceMutation` and `useResource` (per-call options): events, attempt isolation, unsupported signals, cancellation, errors, streams    |
| Mutations with files       | Native TanStack states and per-operation `states.*`, invalidation, optimistic updates, `onError`/`onSettled`, `reset`, retries (never of a stream) with file bodies                                                                  |
| Queries with binary values | Downloads through query operations: caching, refetch, `select`, cancellation on unmount/StrictMode, `gcTime`, Blob lifetime guidance; identity safety for `File`/`Blob` arguments                                                    |
| Streams in framework state | Cancellation and timeout ownership of a `stream` result held by a query or mutation; behavior on refetch, removal and unmount; documented rule where a hook cannot own a stream                                                      |
| Progress consumption       | Evaluate hook ergonomics; document and test a recipe (`useState` + `onTransfer`) with cleanup on unmount; no new hook unless O2                                                                                                      |
| Cache invalidation         | Tests that file create/update/replace/delete invalidate the resource's queries and not other resources'; scoped-invalidation recipe via the cache controller; no behavior change unless a defect is proven                           |
| Error propagation          | `ValidationError` (typed `violations`), `HttpError` (with body), `AbortError`, `TimeoutError`, `NetworkError`, transfer `error` events reach `error`, `states.*.error` and rejected promises; typing/narrowing documented and tested |
| Runtime compatibility      | `File`/`Blob`/`FormData`/`ArrayBuffer`/`ReadableStream` differences in jsdom, Node, Chromium, Edge, workerd handled through existing detection (`detectTransferSupport`); limits documented per runtime                              |
| Next.js SSR/hydration      | Server/client boundary tests with Blob, File and stream values; stream ownership in Server Components; `dehydrate` safety for non-serializable data (guard only if proven); hydration without refetch for serializable data          |
| Mock integration           | `defineMockApi`, mock fixtures, namespaces, validation and downloads through the hooks, with cache behavior and `resetMock`/isolation between tests                                                                                  |
| TypeScript inference       | Typed file inputs, `onTransfer`, binary results, `ValidationError.violations`, built-in/custom operations and hook returns, in workspace tests and packed declarations                                                               |
| React 18/19 runtime        | The runtime hook scenarios executed against the **packed** package in clean consumers: React 18.3.1 + TanStack 5.90.1 and React 19 + current TanStack, jsdom (closes the gap recorded since v1.3.0)                                  |
| Packed consumers           | Core-only, React 18/19, optional peers, missing-peer behavior, TS 5.5.4 / 5.9.3 / latest, bundler and nodenext, `skipLibCheck` on/off (existing matrix extended, not replaced)                                                       |
| Tracked example            | A maintained, tracked Next.js example covering upload, download, progress, cancellation and validation, driven in Chromium by a verification script; no generated artifacts (location per O1)                                        |
| Cross-runtime verification | Chromium, Node, Next SSR (`start`/`dev`), Vercel Edge, workerd, with runtime limits documented accurately                                                                                                                            |
| Docs                       | React README (files with hooks, progress recipe, binary/SSR rules, errors), architecture, public API notes, examples README, story/roadmap                                                                                           |

## Out of scope

| Item                                                                                                        | Why                                         |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| React Hook Form adapter (and carrying `react-hook-form` from the ignored playground)                        | Separate optional milestone                 |
| Zod / schema libraries                                                                                      | Constraint                                  |
| Chunked, resumable, parallel transfers, checkpoints, presigned URLs, S3/cloud adapters                      | Roadmap phase 8                             |
| New framework packages (Vue, Angular, …), new public npm packages, new dependencies                         | Constraint                                  |
| A new progress hook, global transfer registry, form-state system or upload/download client                  | Reuse rule; only via O2 with owner approval |
| Changing default invalidation (`keys.all()`), query identity rules or error classes without a proven defect | Compatibility                               |
| Unrelated Core redesigns; mock storage drivers                                                              | Out of milestone                            |

## Affected packages

| Package                      | Change                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/react` (private)   | Only fixes the audit proves (candidates: identity safety for binary args, orphaned stream handling, dehydrate guard); otherwise **no source change**                                |
| `packages/core` (private)    | **No change expected.** Any change needs a stated, test-proven reason and must stay framework-free                                                                                  |
| `packages/mocking` (private) | No change expected                                                                                                                                                                  |
| `apixa` facade (`src/`)      | Only if a proven fix adds an export (none planned)                                                                                                                                  |
| `scripts/`                   | `verify-react-consumers.mjs` / `verify-unified-consumer.mjs` (runtime hook scenarios, React 18/19), `verify-type-consumers.mjs` + fixtures, `verify-browser.mjs`, `verify-edge.mjs` |
| `examples/`                  | One tracked Next.js file scenario (O1); `.gitignore`/`examples/README.md` wording as needed; no unrelated example touched                                                           |
| `tests/`                     | New hook-level suites, SSR/binary tests, helpers; existing tests unedited                                                                                                           |
| Docs and rules               | `packages/react/README.md`, `docs/architecture.md`, `docs/public-api.md`, `examples/README.md`, `.cursor/rules/*.mdc` + regenerated `AGENTS.md` if the example rule changes         |

No new workspace packages and no new runtime dependencies. Consumer-only dev dependencies inside
temporary verification projects (for example `@testing-library/react`) are allowed.

## Compatibility requirements

- All v1.1.0–v1.5.0 tests pass without edits (a justified, documented edit is the exception, as in
  v1.4.0).
- Hook signatures, return shapes, query keys, invalidation, error classes and `onTransfer` semantics are
  unchanged unless a defect fix is recorded with a failing test first.
- Public API changes are additions only, recorded in `docs/public-api.md`, and only with owner approval.
- React 18 and 19 and TanStack Query ≥ 5.90.1 stay supported; Core stays framework-free.

## Boundaries

- Core and `@apixa/mocking` never import React, Next or TanStack.
- Hooks do not own file networking: they call the operation Core exposes with the options the caller
  passes.
- Progress state is the application's; Apixa reports events, it does not store them.
- The example consumes the published package surface (`apixa/...`), never private workspaces.
