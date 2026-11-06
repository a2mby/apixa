# `@apixa/tanstack-query`

Three independent hooks map Apixa resource clients onto TanStack Query v5:

| Hook                  | Does                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `useResourceQuery`    | One native read observer (`getAll` or a selected read) plus every inherited read.     |
| `useResourceMutation` | Every enabled Core operation as a native mutation, with per-operation state.          |
| `useResource`         | A thin facade over both, sharing one `queryKey`: flat state, flat operations, states. |

Apixa adds resource identity (hierarchical keys), operation selection, exact Core argument/return
types, and signal binding. TanStack still owns observers, caching, deduplication, retries,
scheduling, polling, state transitions, Suspense, and hydration — Apixa adds no cache or scheduler.

Install `@apixa/tanstack-query`, `@apixa/core`, `@tanstack/react-query` 5.90.1 or later in v5, and React 18 or 19. Use TanStack's `QueryClientProvider`; Apixa has no provider or global cache.

## A list query

```tsx
"use client";
import { useResourceQuery } from "@apixa/tanstack-query";
import { api } from "./api";

function Users() {
  const users = useResourceQuery(api.users, { queryKey: ["users"] });
  if (users.isPending) return <p>Loading…</p>;
  if (users.isError) return <p role="alert">{users.error.message}</p>;
  return (
    <ul>
      {users.data.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

With no `operation`, `getAll` must be a guaranteed Core method. An explicitly selected read does not need `getAll`. Disabled methods are rejected by TypeScript. Methods controlled by a runtime boolean are not treated as guaranteed; narrow or construct a resource with a definite configuration first.

The returned value includes **every native `UseQueryResult` field** (`isFetching`, `isRefetching`, `failureCount`, `dataUpdatedAt`, `fetchStatus`, `refetch`, etc.) and `users.query`, the native result itself. Native fields are lazy getters over TanStack's tracked result, so a component re-renders only for the fields it reads — the same render count as calling `useQuery` directly. Apixa also adds `keys`, `controller`, `invalidate()`, `invalidateLists()`, and `invalidateDetail(id)`.

**Every enabled read is inherited automatically**, with its Core name and exact signature:
`users.getById(id)`, `users.count()`, `users.search(options)`, `users.stats()` (a custom
`kind: "read"` operation), and so on. Each is an imperative `QueryClient.fetchQuery` against the
same key a reactive query of that operation uses; none fetches until called. Only the default
`getAll` (or the selected `operation`) is observed. All reads are also under
`users.operations.*`, which keeps names that collide with native fields (an operation called
`refetch` is `users.operations.refetch()`; `users.refetch()` stays TanStack's).

A resource without a guaranteed `getAll` (e.g. `operations: { getAll: false }`) works in
operation-only mode: no automatic query and no list state in the type, inherited reads only.

## Native options and selected data

All installed TanStack v5 `UseQueryOptions` fields are forwarded, including `enabled` callbacks, `staleTime` functions and `"static"`, `gcTime`, `networkMode`, `subscribed`, retry controls, polling/refetch controls, `select`, `initialData`, `placeholderData`, `structuralSharing`, `throwOnError`, `notifyOnChangeProps`, `meta`, and supported future fields. Apixa owns the generated `queryFn` and final hierarchical key; `queryKeyHashFn` is excluded because controller cache helpers use TanStack's default hashing. Use native `useQuery` directly for arbitrary query functions or custom hashing.

```tsx
const users = useResourceQuery(api.users, {
  queryKey: ["users"],
  staleTime: 60_000,
  gcTime: 300_000,
  retry: 2,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  placeholderData: (previous) => previous,
  select: (data) => data.filter((user) => user.active),
});
// users.data is User[] | undefined; the underlying cache still stores the original User[].
```

For conditional reads use `enabled: Boolean(id)` (or a TanStack callback). `initialData: value` or `initialData: () => value` makes `data` defined in TypeScript; optional initial data and placeholder data leave it possibly undefined. Initial data is cached; placeholder data is observer-only.

## Other read operations

`operation` selects the actual Core method. The nine standard reads are `getAll`, `getById`, `getBySlug`, `getMany`, `getBy`, `findFirst`, `search`, `count`, and `exists`. `args` is its exact parameter tuple, with no reordering.

```tsx
const detail = useResourceQuery(api.users, {
  queryKey: ["users"],
  operation: "getById",
  args: ["42"],
});
const matches = useResourceQuery(api.users, {
  queryKey: ["users"],
  operation: "search",
  args: [{ query: { name: "Ada" } }],
});
const count = useResourceQuery(api.users, {
  queryKey: ["users"],
  operation: "count",
  args: [],
});
```

For a Core path like `/organizations/:orgId/users`, pass the actual generated signature: `getAll(orgId, options)` becomes `args: [orgId]`; a detail operation with multiple path parameters uses `args: [{ orgId, id }]`. Apixa adds an AbortSignal to built-in request options. For an overridden operation with a different signature, bind the exact tuple yourself:

```tsx
const users = useResourceQuery(api.users, {
  queryKey: ["users"],
  operation: "getAll",
  keyParts: [orgId, filters],
  args: ({ signal }) => [orgId, { query: filters, signal }],
});
```

An argument-builder function requires `keyParts`, since functions cannot be a safe cache identity.

Custom operations are reads only when Core says so — never by name or HTTP verb. Mark them in
`defineApi` (omitted `kind` means `"write"`):

```ts
operations: {
  stats: { kind: "read", method: "GET", path: "/stats" },
  report: { kind: "read", run: async (ctx, range: "day" | "week") => ctx.request({ query: { range } }) },
}
```

```tsx
const stats = useResourceQuery(api.users, { queryKey: ["users"], operation: "stats" });
```

Its arguments become its key. A custom operation Core does not classify as a read can still be
observed with the legacy opt-in `readOperations: ["name"]` plus `keyParts`.

The signal is bound at the position Core records for each operation's `RequestOptions` (the
`OPERATION_METADATA` Core attaches to every client), so nested params or filter objects that
happen to contain `query`/`meta` keys are never mistaken for options. Function operations —
custom or overriding a builtin — own their signatures, so Apixa never injects anything into them;
forward a signal yourself with an argument builder: `args: ({ signal }) => [period, { signal }]`.

Built-in query arguments exclude Core's `{ full: true }` option: it changes the operation's result
to an `ApiResponse` envelope and would invalidate the raw payload type used for this cache key.
Use native `useQuery` with the Core operation directly when a full response is required.

## Keys, filters, pagination, and cache

List keys remain `[...scope, ...queryKey, "list", query?]`; detail keys remain `[...scope, ...queryKey, "detail", id]` (extra arguments follow the id). Other reads use `[...scope, ...queryKey, "operation", name, ...identity]`. Identity is the exact argument tuple minus the signal; an empty options object and trailing `undefined`s are dropped, so `getById("42")` and `getById("42", {})` share one entry, and `invalidateDetail("42")` also covers keyed variants such as `[..., "detail", "42", { query }]`. `query: { active: true }` is a short form for the ordinary `getAll({ query })` call and is included in the list key. Use either `query` or `args`, not both. With `args`, all tuple values except top-level AbortSignals are included by default. `keyParts` overrides that derivation and is mandatory for custom operations or argument builders.

```tsx
const page = useResourceQuery(api.users, {
  queryKey: ["users"],
  scope: ["backend", tenantId],
  query: { page: pageNumber, pageSize: 20 },
  placeholderData: (previous) => previous,
});
// For cursor pagination, use query: { cursor } instead. Core's page/cursor envelope is preserved.
```

Use distinct scopes for clients, tenants, backends, or authorization contexts. If headers or request context change the response, include that context in `scope` or `keyParts`. Apixa does not infer identity from arbitrary runtime objects. Keys are copied, never mutated. TanStack's default deterministic hashing handles equivalent serializable objects.

```tsx
await users.invalidate(); // all resource queries; active ones normally refetch
await users.invalidateLists(); // all list variants
await users.invalidateDetail("42"); // one detail
await users.getById("42"); // cached imperative fetch, if available
```

Invalidation only marks inactive/disabled queries stale; it does not promise a fetch. The advanced `createResourceQueryController` delegates `refetch`, `cancel`, `remove`, `reset`, `getCached`, `setCached`, `fetch`, `prefetch`, and `ensure` to `QueryClient`, preserving each native action's distinct semantics. `getCached` and `setCached` operate on **raw** data, before `select`.

## Hook-free query options

Import the factory from `@apixa/tanstack-query/advanced` in React components, server components, loaders, or imperative code. It uses the same key and execution engine as the hook and carries TanStack's query-key data tag.

```tsx
import { createResourceQueryOptions } from "@apixa/tanstack-query/advanced";
import { useQuery, useQueries, useSuspenseQuery } from "@tanstack/react-query";

const options = createResourceQueryOptions(api.users, {
  queryKey: ["users"],
  operation: "getById",
  args: ["42"],
});
const user = useQuery(options);
const suspenseUser = useSuspenseQuery(options); // in a Suspense boundary
const parallel = useQueries({ queries: [options] });
await queryClient.prefetchQuery(options);
await queryClient.fetchQuery(options);
await queryClient.ensureQueryData(options);
```

Native `useInfiniteQuery` remains available for infinite pagination. Build its `queryFn` using the Core operation and native `pageParam`; there is no separate Apixa infinite-query scheduler. `useSuspenseQuery` does not accept `enabled`, `placeholderData`, or `throwOnError`, per TanStack's own semantics; use a suitable generated options object without those fields. Do not pass a `suspense` boolean to `useResourceQuery`.

For Next.js App Router, create a **request-scoped** `QueryClient` in the server page, prefetch generated options, pass `dehydrate(client)` to `HydrationBoundary`, and call the hook from a client component under `QueryClientProvider`. A [working example](../../examples/query-ssr-next/) includes a production build. The main package entry retains `"use client"`; the hook-free advanced entry does not.

## Cancellation, retries, and errors

TanStack's signal is forwarded to standard Core read operations. Core combines it with its timeout and preserves its own `HttpError`, `TimeoutError`, `AbortError`, and other error classes. Cancelling through `queryClient.cancelQueries` aborts an in-flight request. A custom read's argument builder must forward `signal` explicitly. Core retry and TanStack retry are separate layers: a Core retry repeats a transport attempt within one operation call; a TanStack retry repeats the operation call. Set one layer deliberately if exact attempt counts matter. Native `throwOnError` supports React error boundaries.

## Mutations: `useResourceMutation`

```tsx
const users = useResourceMutation(api.users, {
  queryKey: ["users"],
  mutations: {
    create: { onSuccess: (user) => toast(user.name), retry: 1 },
    update: { invalidate: "lists" },
    archive: { onError: (error) => console.error(error) },
    exportUser: { mutationFn: async (id: string) => exporter.run(id) }, // client-only
  },
});

await users.create(body);
await users.update(id, body);
await users.archive(id);
await users.exportUser(id);

users.states.create.isPending;
users.states.update.error;
users.states.exportUser.data;
```

- **Every enabled Core operation is inherited**, including custom ones; `mutations` only
  overrides options or adds client-only operations. Calls take the operation's own separate
  arguments and return its exact result type; TanStack receives them as a tuple.
- Editors suggest every operation name inside `mutations: {}` and every native
  `UseMutationOptions` field inside each entry (`retry`, `retryDelay`, `gcTime`, `networkMode`,
  `scope`, `throwOnError`, `meta`, `onMutate`, `onSuccess`, `onError`, `onSettled`).
- An unknown name needs a `mutationFn`; a `mutationFn` on an inherited name is rejected (inherited
  operations always run Core). Disabled operations are absent.
- `states.<op>` is TanStack's `MutationObserverResult` for the **latest** call, exactly like
  `useMutation`. Every call still resolves its own promise; for all in-flight calls use native
  `useMutationState({ filters: { mutationKey: users.keys.mutation("create") } })`.
- Observers are created lazily on first call or `states` access — unused operations cost nothing.
  The hook makes a fixed number of React hook calls (one external store over native
  `MutationObserver`s) and follows QueryClient, resource, and option changes.
- Mutation keys: `[...scope, ...queryKey, "mutation", op]`. Apixa's `scope` is the key prefix;
  TanStack's serial-execution `scope: { id }` belongs inside an operation's config.
- Writes are not retried unless configured (TanStack's default).

**Invalidation** (after success only, awaited before your `onSuccess`): writes and client-only
operations default to `"all"` (every query under the resource key); reads default to none.

```ts
invalidate: "all" | "lists" | false
invalidate: { lists: true, details: (data, [id]) => [id] }
invalidate: async ({ client, keys, data, args }) => { /* your own QueryClient work */ }
```

Optimistic updates use native `onMutate` / `onError` with `QueryClient` and rollback context.
`states.<op>.context` and the callbacks infer `onMutate`'s (awaited) return. **TypeScript limit:**
when `onMutate` has an unannotated parameter _and_ a sibling callback reads the context,
TypeScript fixes the config before it sees `onMutate`'s return, and that callback's context is
`{}`. Annotate the parameter (`async ([id, body]: OperationParameters<typeof api.users, "update">)`)
or omit it.

The single-operation form remains: `useResourceMutation(api.users, "create", { queryKey })`
returns a native `UseMutationResult` called with a tuple (`mutateAsync([body])`).

## Unified facade: `useResource`

```tsx
const users = useResource(api.users, {
  queryKey: ["users"],
  query: { staleTime: 60_000, select: (list) => list.filter((u) => u.active) },
  mutation: { mutations: { create: { invalidate: "lists" } } },
});

users.data;
users.isLoading;
users.refetch();
users.invalidate();
await users.getById(id); // read → QueryClient cache
await users.create(body); // write → mutation lifecycle
users.states.create.isPending;
await users.operations.archive(id); // guaranteed namespace
```

`query` takes exactly `useResourceQuery`'s options and `mutation` exactly `useResourceMutation`'s,
minus the shared `queryKey`/`scope`. Read-classified operations run through the query layer and
writes/client-only operations through mutations — never both. `states` holds writes and
client-only operations only. Flat names never shadow query fields or `states`/`operations`; every
operation is always in `operations`. Without a guaranteed `getAll`, there is no list state and no
automatic query.

## Migrating from v0.8

`users.create(body)`, `users.update(id, body)`, `users.delete(id)`, and `users.mutations.*` moved
off `useResourceQuery`. Use `useResource` for the old all-in-one shape (`users.create(body)`,
`users.states.create`), or `useResourceMutation(api.users, { queryKey })` for writes alone.

`createResourceController` remains in the advanced entry for old controller users, composing the
query and mutation controllers. The advanced entry also exports `ResourceMutationStore`,
`applyInvalidation`, and `describeOperations` for custom integrations.

## Performance baseline

After building, run `node scripts/query-performance.mjs [iterations]` from the repo root. It measures generated list/detail options plus warm `ensureQueryData` cache hits. This is a local reproducible baseline, not a cross-machine target. `useResourceQuery` mounts one query observer; inherited reads and prefetches mount none; mutation observers exist only for operations actually used. The test suite asserts render-count parity with native `useQuery`.

## Limits

- Core's `{ full: true }` option is excluded from hook arguments (hooks cache raw payloads); call
  the Core client directly for `ApiResponse` envelopes.
- Imperative inherited reads use `fetchQuery`'s default `staleTime` (0): each call refetches
  unless the entry is fresh. Use the reactive hook or `ensureQueryData` for cache-first reads.
- Hand-written resource objects without Core metadata receive exactly their supplied arguments.
  Automatic signal injection is unavailable for these functions; use an `args` builder and
  `keyParts` to explicitly forward TanStack's signal when the function supports it.
- A generic Core operation such as `echo<T extends { id: string }>(value: T): Promise<T>`
  loses its input/output type relationship through operation wrappers. Call the Core operation
  directly when preserving the generic result is required.
- Replace a mounted `QueryClientProvider` together with a keyed remount of its consumers; native
  TanStack query observers retain the client they were created with.

### Advanced cache synchronization

The advanced create and update helpers invalidate by default. Pass a mapping function only when the response contains a complete entity: `(response) => ({ id: response.userId, entity: response })`. This supports custom identifier fields and avoids treating acknowledgments or partial responses as complete records. Delete removes the detail and invalidates lists.
