# v1.6.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Advanced Framework & Consumer Integration (Advanced File Handling, phase 7): prove, and where the
audit finds real defects fix, that the complete v1.1.0–v1.5.0 file-handling system works through
Apixa's **existing** React/TanStack integration (`useResourceQuery`, `useResourceMutation`,
`useResource`) and Next.js — uploads, downloads, progress, cancellation, validation errors, mocks
and streams — with runtime evidence on React 18 and 19, and a tracked, maintainable example. The
default expectation is **tests, documentation and small corrections, not new API**.

> Common workflows work without configuration; unusual backend requirements stay configurable.

```tsx
// The intended shape already exists; v1.6.0 verifies and documents it (no new hook).
const pets = useResource(api.pets, { queryKey: ["pets"] });
const [progress, setProgress] = useState<TransferEvent>();

await pets.create(
  { name: "Mia", photo },
  { onTransfer: setProgress, signal: controller.signal }, // typed, per call, not in any query key
);
// ValidationError -> pets.states.create.error / the rejected promise, with typed `violations`.
```

## The problem (audit of the v1.5.0 tree)

Facts, from reading the code and CI, not assumptions:

1. **React 18 has no runtime hook test.** `tests/react/*` runs on the workspace React 19 only.
   `scripts/verify-react-consumers.mjs` and `verify-unified-consumer.mjs` install React 18.3.1 /
   TanStack 5.90.1 in a packed consumer, but they check types, a Vite build and SSR, never an executed
   hook that uploads, downloads or reports progress. v1.3.0, v1.4.0 and v1.5.0 each recorded this gap.
2. **The maintained Next scenarios are not on `main`.** `.gitignore` ignores `examples/**` except
   `examples/query-ssr-next`. `examples/next` (50 source files, the file upload/download/progress/
   validation scenarios, `react-hook-form` in its manifest) exists only locally, while `AGENTS.md`
   calls it "the only maintained example". The tracked, CI-driven Next app (`query-ssr-next`) has no
   file scenario. The contradiction is real and needs one decision (see O1).
3. **Hooks pass call options straight to Core**, and `normalizeIdentity` strips `signal`, `timeout`,
   `retry`, `idempotencyKey`, `onTransfer` and `maxResponseSize` from query identity. That is
   tested for `useResourceQuery` args; it is **not** audited for infinite queries, prefetch helpers,
   `createResourceQueryOptions` or mutation variables.
4. **Binary values and TanStack's cache.** A `Blob`/`ArrayBuffer` result is a valid cache value
   client-side. A `File`/`Blob` _argument_ in a query identity hashes like `{}` (TanStack's
   `hashKey` JSON-stringifies), so two different files could share one cache entry. Unverified.
5. **Streams and the cache.** A `stream` result is owned by its consumer (v1.3.0). TanStack aborts its
   `signal` only while a fetch is in flight; once the query function resolves with a stream,
   a refetch, `remove` or garbage collection replaces or drops the cache entry without cancelling the
   old stream. Whether that leaks a connection until the call `timeout` (or forever) is unverified.
6. **Dehydration.** `dehydrate()` from `apixa/react/advanced` is a pass-through to TanStack. A
   prefetched binary or stream query would be serialized by TanStack's default rules and handed to a
   React Server → Client boundary, where `Blob`/`File`/`ReadableStream` are not plain JSON. Unverified
   in a real Next build.
7. **Invalidation.** Every successful mutation invalidates `keys.all()` for the whole resource
   (v1.0.0 design). File uploads, replacements and deletes use the same path. It is correct but broad;
   whether narrower invalidation is _needed_ for files is a product question, not a defect.
8. **Progress consumption.** `onTransfer` is a callback; React state for progress is userland
   (`useState`). Hooks have no progress field. No recipe is documented or tested.
9. **Errors.** Hook `error` is typed as TanStack's default error type; narrowing to `ValidationError`
   (`violations`), `HttpError`, `AbortError`, `TimeoutError`, `NetworkError` relies on `instanceof`.
   Core tests cover the classes; hook-level propagation of each is partly covered.
10. **Mocks through hooks.** v1.5.0 added fixtures, namespaces and listing; `tests/react/
mock-storage.test.tsx` covers the basics. Fixtures + validation + downloads + invalidation
    together through the hooks are not covered as one scenario.

## Current capabilities (verified, not rebuilt)

| Capability                                                                                                        | Where                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Three hooks over TanStack v5, exact Core arguments, signal binding at the right position                          | `packages/react/src/use-*.ts`, `query-options.ts`     |
| `onTransfer` typed through hooks; stripped from query identity; rules/limits are config, not options              | v1.3.0–v1.4.0, `query-options.ts`                     |
| Mutation states per operation, resource-wide invalidation, optimistic helpers, cache controller                   | `mutation-controller.ts`, `optimistic.ts`, `cache.ts` |
| Hydration, request-scoped `QueryClient`, `prefetchResourceQuery`, `ApixaHydrationBoundary`                        | `advanced.ts`, `hydration*.ts`                        |
| React peer guard (`RequireTanStackQuery`) and missing-peer detection                                              | `peer.ts`                                             |
| Files: uploads (v1.1.0), downloads (v1.2.0), transfer events (v1.3.0), validation (v1.4.0), mock storage (v1.5.0) | Core and `@apixa/mocking`                             |
| Packed-npm type consumers (62 checks), React 18/19 builds + SSR, Chromium, Next SSR, Vercel Edge, workerd         | `scripts/verify-*.mjs`                                |
| Hook runtime tests for downloads, transfer, file mutations, validation, mock storage (React 19)                   | `tests/react/*.test.tsx`                              |

## Principles that bind this release

1. **Reuse, then prove.** The three hooks and `onTransfer` are the integration surface. A new public
   API is allowed only when a Batch 0 failing test shows an existing API cannot satisfy a concrete
   requirement; the plan records each such case and the owner approves it.
2. **Core stays framework-free; React and TanStack stay optional peers.** No new package, no new
   dependency, no `node:*` or DOM-only API in Core. Any hook-side fix lives in `packages/react`.
3. **One networking path.** Nothing here adds an upload/download client, a transfer registry, a
   global store or a form-state system. Progress is userland state fed by `onTransfer`.
4. **Distinguish defects from platform limits.** Every finding is classified: _defect_ (fixed, with a
   regression test), _documented limitation_ (stated where users will read it, with a test that pins
   the behavior), or _non-issue_ (evidence recorded). Nothing is silently waived.
5. **Binary data never crosses a serialization boundary unannounced.** Whatever the audit proves about
   Blob/File/stream and dehydration is enforced or documented, never left to a runtime error.
6. **Evidence on the published artifact.** Runtime behavior on React 18/19 is verified against the
   packed `apixa` tarball in a clean consumer, not only the workspace sources.
7. **Examples show implemented API only**, are tracked, contain no generated artifacts, and are driven
   by a verification script, not just type-checked.
8. **Backward compatible.** All v1.1.0–v1.5.0 behavior, errors, types and tests are preserved.

## Definition of success

- A runtime hook test suite, executed on React 18.3.1 + TanStack 5.90.1 (minimum peer) and React 19 +
  current TanStack against the packed package, covers upload progress, download, cancellation, typed
  `ValidationError`/`HttpError`/`AbortError`/`TimeoutError`/`NetworkError`, mocks with fixtures, and
  invalidation.
- Every audit finding above is classified and either fixed with a regression test or documented with a
  pinning test; no defect is waived.
- Next.js SSR/hydration with binary and stream values is verified in a real build (`next start` and
  `next dev`), and the safe pattern is documented.
- A tracked example demonstrates upload, download, progress, cancellation and validation and is driven
  in Chromium by `pnpm verify`.
- The React documentation explains file uploads/downloads with the hooks, a progress recipe, the
  cache and SSR rules for binary values, and per-runtime limits.
- `pnpm verify` passes; owner sign-off is recorded.

## Intentionally out

A React Hook Form adapter (the ignored playground's `react-hook-form` dependency is not carried into
tracked code), Zod, chunked/resumable/parallel transfers, presigned URLs, S3/cloud adapters, new
framework packages (Vue, Angular, etc.), a transfer-progress hook or registry unless O2 proves one
necessary, separate networking clients, and unrelated Core redesigns. See `docs/roadmap.md`.
