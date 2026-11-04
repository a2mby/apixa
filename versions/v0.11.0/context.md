# v0.11.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Harden the still-unshipped v0.10.0 operation-customization surface before calling the library
"usable," and close the handful of DX/scalability gaps a full-library analysis found while that
surface was fresh. This is a corrective + closing-the-gap release, not a new product surface: every
item either fixes a real bug introduced or exposed by v0.10.0, or ships a roadmap "Later" item that
the analysis showed is now blocking real usage (live pagination, TanStack coverage of the new
builtins). **v1.0.0 — the first release called "usable" — starts only after this version's
acceptance criteria pass.**

## Identity (this release)

- Packages: `@apixa/core`, `@apixa/mocking`, `@apixa/tanstack-query`
- Scope: bug fixes to the v0.10.0 operation surface + a short list of "fits cleanly" improvements
  identified by the same analysis
- No new workspace packages

## What success looks like

```ts
// 1. Composed builtins track overrides (bug fix)
const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  users: { path: "/users", operations: { getById: { path: "/u/:id" } } },
});
await api.users.exists("123"); // now hits /u/123, not the hardcoded /:id default

// 2. A malformed JSON body throws ParseError instead of silently becoming `null`
await api.users.getAll(); // throws ParseError if the server's JSON body is truncated/invalid

// 3. Core's mock:"<id>" bridge no longer leaks mutable store references
const u = await api.users.getById(1);
u.name = "mutated"; // no longer corrupts the shared in-memory dataset

// 4. Resource-level read-only shorthand
users: { path: "/users", readOnly: true } // sugar for the 7 write ops set to false

// 5. Opt-in pagination convention for live getAll, zero behavior change when absent
users: { path: "/users", pagination: "page" }
const page = await api.users.getAll({ page: 1, pageSize: 20 }); // typed envelope response

// 6. TanStack Query covers all 16 builtins
const users = useResourceQuery(api.users, { queryKey: ["users"] });
await users.patch(id, partial);
users.mutations.search.isPending;

// 7. The Core mock bridge accepts the same `operations` overrides defineMockApi already has
users: { mock: "users-mock", operations: { archive: (ctx, id) => ctx.request(...) } }
```

## Principles that bind this release

1. **Fix before feature** — every bug found in the v0.10.0 surface is fixed here before v1.0.0
   planning starts. A hardened v0.10.0 is the foundation v1.0.0 stands on.
2. **Only ship analysis items that "fit cleanly"** — the full-library analysis tagged each new-feature
   idea against the project's stated non-goals. Only "fits cleanly" items are in scope here; items
   tagged "tension with a stated principle" (schema validation hooks, operation deprecation/versioning
   metadata) stay on the roadmap, untouched, for a later, deliberately-scoped milestone.
3. **No silent invention, still** — the new `pagination` convention is opt-in and produces zero
   behavior change when absent, consistent with principle 9 in `docs/context.md`.
4. **Custom beats convention, uniformly** — composed builtins (`exists`, `findFirst`, `getMany`)
   must delegate to the resource's actually-resolved operations, not hardcode wire shapes, so an
   override of `getById`/`getAll` is honored everywhere, not just when called directly.
5. **Mock engines converge in capability, not just transport** — the Core `mock: "<id>"` bridge gets
   the same `operations` override mechanism `defineMockApi` already has, and the same clone-on-read
   safety `resource.ts` already has.
6. **Framework-agnostic Core, still** — the TanStack Query coverage expansion and request-dedup ideas
   live in `@apixa/tanstack-query`, never in Core.

## Baseline in the repo today

- `versions/v0.10.0/` shipped (in working tree, not yet committed) always-on builtins + function
  operations + removal via `false`, across `@apixa/core` and `@apixa/mocking`.
- A full-library analysis (DX / performance / scalability) against that baseline found 9 concrete
  weak points and a short list of "fits cleanly" improvements — see `scope.md` for the itemized list,
  carried over verbatim from the analysis.
- `@apixa/tanstack-query`'s `useResourceQuery` / `ResourceLike` predate v0.10.0 and only know the
  original 5 builtins.
- Live `getAll` has no pagination convention; `@apixa/mocking` already has one (`Page<T>`,
  `pagination: true`) — this asymmetry is called out in `docs/roadmap.md` under "Later."

v0.11.0 **fixes and completes** v0.10.0's surface; it does not open new surface beyond the items
listed in [scope.md](./scope.md).

## Non-goals for this folder

OpenAPI, new workspace packages, auth as a Core concern, schema-validation hooks, operation
deprecation/versioning metadata, request deduplication inside Core (belongs in
`@apixa/tanstack-query` if/when scoped separately), rewriting any shipped `versions/v0.1–v0.9`
folder.

See [scope.md](./scope.md).
