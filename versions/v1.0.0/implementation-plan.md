# v1.0.0 — Query implementation plan

1. **Q-01 Native parity:** derive options from `UseQueryOptions` and compose with native `UseQueryResult`.
2. **Q-02 Types:** infer callable operations, exact argument tuples, raw results, `select`, and initial data.
3. **Q-03 Read engine:** support built-in reads and explicitly declared custom reads through one factory.
4. **Q-04 Keys/cache:** preserve list/detail keys; add operation keys and QueryClient-backed cache helpers.
5. **Q-05 Advanced:** export hook-free query options for native hooks, prefetching, and hydration.
6. **Q-06 Reliability:** bind signals, test retry layers and lifecycle behavior, build a Next SSR example and performance baseline.
7. **Q-07 Closure:** run frozen install, build, typecheck, tests, consumer tarballs, and example builds; document outcomes and limits.
8. **C:** Core `kind` / `{ kind, run }` classification and `OPERATION_METADATA`; require custom
   kinds and validate HTTP methods at construction or each function request.
9. **M:** write-only resource-wide `useResourceMutation` over lazily created `MutationObserver`s;
   remove the single-operation overload.
10. **U:** `useResource` facade composing the public query and mutation hooks with flat
    `mutations` options.
11. **A:** correct advanced controller signatures and availability; retain hook-free options.
12. **V:** document breaking changes and rerun build, typecheck, tests, packed consumers, and
    available Next/Vite integrations.
13. **D:** Query DX refinement in the three hooks (prefetch, cache, cancel, infinite mode, direct
    mutation state, declarative optimistic layers, SSR prefetch helpers) and opt-in Core
    idempotency; then a hardening pass: deterministic race tests, a runtime matrix on the TanStack
    peer minimum, real-browser hydration, and packed/Core-only consumers.
14. **A:** Mocking stabilization after the audit: no URL-guessed custom operations on mocks,
    prototype-safe writes, Core as a peer dependency of Mocking, one `getAll` contract for Core mocks
    and `defineMockApi`, page-only reads and copy-on-write rows, per-dataset import paths, packed
    consumer checks in CI, and the tracked example inside `pnpm typecheck`.
15. **A:** inline `mock` handlers for custom declarative operations (typed records, store view,
    params, query, body, signal) inside Core's existing mock lifecycle.

16. **P — Final packaging:** preserve the Phase 1–3 implementation; make all workspaces private,
    compile one root distribution with shared runtime chunks and isolated canonical declarations,
    convert the existing consumer/browser/Edge and publishing checks to one tarball, update the
    source and distribution guards, documentation and agent rules, then verify Node 22/24 and npm
    dry-run. No real publication, commit or push.
