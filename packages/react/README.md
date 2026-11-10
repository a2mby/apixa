# `apixa/react`

Implementation: private workspace module `@apixa/react`. Public installation: `npm install apixa @tanstack/react-query` (React 18 or 19 comes from your app).

Three hooks map Apixa resource clients onto TanStack Query v5:

| Hook                  | Does                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `useResourceQuery`    | One native read observer (`getAll` or a selected read) plus every inherited read.     |
| `useResourceMutation` | Every enabled Core write as a native mutation, with per-operation state.              |
| `useResource`         | A thin facade over both, sharing one `queryKey`: flat state, flat operations, states. |

**Owns:** the React integration (hooks, controllers, query options, cache sync, optimistic updates,
mutation state). **Imports:** Core, the private `@apixa/internal-shared` (bundled at build time),
`react`, and `@tanstack/react-query`; never Mocking. This integration was developed as
`@apixa/tanstack-query` and was never published under that name.

Apixa adds resource identity (hierarchical keys), operation selection, exact Core argument/return
types, and signal binding. TanStack still owns observers, caching, deduplication, retries,
scheduling, polling, state transitions, Suspense, and hydration — Apixa adds no cache or scheduler.

Install `npm install apixa @tanstack/react-query` (TanStack Query >=5.90.1 within v5, React 18 or 19). `apixa/react` requires React and TanStack Query to be installed in your application: both are optional peers of `apixa` (Core-only projects need just `npm install apixa`), and npm does not install optional peers for you.

> **Troubleshooting:** if `@tanstack/react-query` is missing or not resolvable from `node_modules/apixa`, `useResourceQuery` and `useResource` (and `useResourceMutation`) lose their inferred types. Apixa types the result as `ApixaMissingPeer_Install_tanstack_react_query`, so reading `.data` is a compile error; install the package and it goes away. With `skipLibCheck: false` TypeScript also reports TS2307 inside `node_modules/apixa`; `skipLibCheck: true` hides that message.
> Wrap the app in `ApixaProvider`, or keep using TanStack's own `QueryClientProvider`: the hooks work under either, and there is exactly one cache, TanStack's.

Transfer events work through the hooks as plain call options: `useResourceQuery(api.files, { queryKey, operation: "download", args: [id, { onTransfer }] })`.
`onTransfer` is not part of the query key (like `signal`), so changing the callback never refetches.

### Files through the hooks (v1.6.0)

Files use the same three hooks and the same operations; there is no upload/download hook, store or
client. Verified on React 18.3.1 (TanStack 5.90.1) and React 19 against the packed package.

- **Uploads and downloads.** A write takes `File`/`Blob`/`FormData`/streams like the direct client:
  `await pets.create({ name, photo }, { onTransfer, signal })`. A download is an operation with
  `responseType: "blob"` and is typed `Blob`.
- **Progress is your state.** `onTransfer` is a per-call option (in `args` for `useResourceQuery`). Feed it into
  `useState`; it is never part of a query key, and a stale callback after unmount must be guarded with a ref.
  Compute a percentage only when `event.total` is defined; `unsupported` events mean the runtime or transport
  cannot observe that direction (browsers for sized uploads, workerd, custom transports that ignore
  `onTransfer`).
- **Cancel.** Pass an `AbortController` signal in the call options. A caller's `signal` and TanStack's own query
  signal are combined for reads, so either one cancels. A call `timeout` surfaces `TimeoutError`.
- **Reads through a hook are cached queries.** `users.download(id)` (a flat read) and `useResourceQuery` share
  TanStack's cache: a second call inside `staleTime` returns the cached `Blob` with no request and no transfer
  events. Use the direct client (or `staleTime: 0`) for a one-off download with progress.
- **Errors.** `ValidationError` (typed `violations`), `HttpError` (with body), `AbortError`, `TimeoutError` and
  `NetworkError` reach the query `error`, the mutation `error` / `states.<op>.error` and the rejected promise.
  Narrow with `instanceof`. A rejected file sends no request and is never retried.
- **Invalidation.** Every successful mutation invalidates the whole resource by default (unchanged). Scope it with
  `mutations: { create: { invalidate: "lists" } }`, `{ details: (data) => [data.id] }`, a function, or `false`
  (the existing option; it works the same for file writes).
- **Binary values and the cache.** A `Blob`/`ArrayBuffer` result caches client-side like any value. A `File`, `Blob`,
  `ArrayBuffer`, `FormData` or `ReadableStream` in a query's arguments throws a clear error (TanStack hashes them all
  as `{}`, so different files would share one entry): send files with a mutation, or give the query an identity with
  `keyParts`. A `stream` result held by a query is the app's to consume or cancel; the call `timeout` still bounds it.
- **Next.js.** `dehydrate()` (from `apixa/react/advanced`) leaves out queries whose data is a `Blob`, `File`,
  `ArrayBuffer` or `ReadableStream` (a stream is single-use, bytes would bloat the page payload, and React 18 / older
  Next cannot serialize them); the client fetches those itself. A Server Component may read a binary result and pass
  only plain values down. See `examples/query-ssr-next` (`/files`).

### `ApixaProvider` and `QueryClient`

```tsx
import { ApixaProvider, QueryClient } from "apixa/react";

// Let the provider create one client and keep it for its lifetime…
<ApixaProvider config={{ staleTime: 60_000, retry: 1 }}>{children}</ApixaProvider>;

// …or own it yourself.
const client = new QueryClient({ staleTime: 60_000, gcTime: 300_000, retry: false });
<ApixaProvider client={client}>{children}</ApixaProvider>;
```

`QueryClient` is TanStack's `QueryClient` (same instance type for the hooks, the controllers in
`apixa/react/advanced`, optimistic updates and dehydration). It accepts every native option plus
five shorthands that set `defaultOptions.queries`: `staleTime`, `gcTime`, `retry`, `networkMode`
and `meta`. An explicit `defaultOptions.queries` value wins over its shorthand; mutation defaults
are never touched. With `client` omitted, `ApixaProvider` creates the client once from `config`
and never recreates it on re-render.

## A list query

```tsx
"use client";
import { useResourceQuery } from "apixa/react";
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
`defineApi` (`kind` is required for every custom operation):

```ts
operations: {
  stats: { kind: "read", method: "GET", path: "/stats" },
  report: { kind: "read", run: async (ctx, range: "day" | "week") => ctx.request({ query: { range } }) },
}
```

```tsx
const stats = useResourceQuery(api.users, { queryKey: ["users"], operation: "stats" });
```

Its arguments become its key. A custom write cannot be observed as a query. The legacy
`readOperations` option has been removed.

The signal is bound at the position Core records for each operation's `RequestOptions` (the
`OPERATION_METADATA` Core attaches to every client), so nested params or filter objects that
happen to contain `query`/`meta` keys are never mistaken for options. Function operations —
custom or overriding a builtin — own their signatures, so Apixa never injects anything into them;
forward a signal yourself with an argument builder: `args: ({ signal }) => [period, { signal }]`.

Built-in query arguments exclude Core's `{ full: true }` option: it changes the operation's result
to an `ApiResponse` envelope and would invalidate the raw payload type used for this cache key.
Use native `useQuery` with the Core operation directly when a full response is required.

## Keys, filters, pagination, and cache

List keys remain `[...scope, ...queryKey, "list", query?]`; detail keys remain `[...scope, ...queryKey, "detail", id]` (extra arguments follow the id). Other reads use `[...scope, ...queryKey, "operation", name, ...identity]`. Identity is the exact argument tuple minus the signal; an empty options object and trailing `undefined`s are dropped, so `getById("42")` and `getById("42", {})` share one entry, and `invalidateDetail("42")` also covers keyed variants such as `[..., "detail", "42", { query }]`. `query: { active: true }` is a short form for the ordinary `getAll({ query })` call and is included in the list key. Use either `query` or `args`, not both. With `args`, all tuple values except top-level AbortSignals are included by default. `keyParts` overrides that derivation and is mandatory for argument builders.

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

## Prefetching, cache access, and cancellation

Every query result (and `useResource`) carries three helpers. They use the hook's QueryClient,
its keys, and its query function; they mount no observer.

```tsx
const users = useResourceQuery(api.users, { queryKey: ["users"], staleTime: 60_000 });

await users.prefetch(); // the observed query, with the hook's options
await users.prefetch({ operation: "getById", args: ["42"] }); // any read (writes are rejected)
await users.prefetch({ query: { page: 2 } }); // another getAll variant
await users.prefetch({ operation: "stats", args: ["week"], staleTime: 0 }); // override inherited options

users.cache.get(); // raw data of the observed query (never `select` output); no request
users.cache.set((old) => [...(old ?? []), newUser]); // setQueryData; no request
users.cache.get({ operation: "getById", args: ["42"] }); // User | undefined
users.cache.remove(); // only the observed entry (exact)
users.cache.remove({ lists: true }); // explicit prefix: every list variant
users.cache.remove({ all: true }); // explicit prefix: everything under the resource key

await users.cancel(); // cancelQueries for the observed entry (or a target / prefix)
```

- `prefetch` is `queryClient.prefetchQuery` (or `prefetchInfiniteQuery`): fresh data per
  `staleTime` is not fetched again, and concurrent prefetches share one request. A target inherits
  the hook's `staleTime`, `gcTime`, `retry`, `retryDelay`, `networkMode`, and `meta` unless it
  sets them.
- Targets build exactly the key the hook, `createResourceQueryOptions`, and imperative reads use.
  Without an observed query (no `getAll`), pass a target — there is no ambiguous default.
- `cache.set` writes raw cache data; on an infinite entry it must keep `pages` and `pageParams`
  arrays of equal length. Removal is separate from invalidation; neither replaces `refetch()`.
- `prefetch`, `cache`, and `cancel` are reserved result names. An operation with one of those names
  stays callable through `users.operations.<name>`.

## Infinite queries

Infinite pagination is a mode of `useResourceQuery` (no separate hook), backed by native
`useInfiniteQuery`:

```tsx
const posts = useResourceQuery(api.posts, {
  queryKey: ["posts"],
  staleTime: 30_000,
  infinite: {
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor, // null / undefined: no next page
    getPreviousPageParam: (firstPage) => firstPage.prevCursor, // optional
    query: (cursor) => ({ cursor, limit: 10 }), // merged into Core's RequestOptions.query
    maxPages: 5, // optional native eviction
  },
});

posts.data?.pages; // typed pages of getAll's response
posts.data?.pageParams;
posts.hasNextPage;
posts.isFetchingNextPage;
await posts.fetchNextPage();
await posts.fetchPreviousPage();
```

- Any read works (`operation: "feed"`). `infinite.query(pageParam)` fills Core's query for
  operations whose signature Core owns; `infinite.args(pageParam, context)` builds the exact
  argument tuple for anything else (forward `context.signal` yourself there). Page-number APIs use
  `initialPageParam: 1` and `getNextPageParam: (last) => last.page < last.totalPages ? last.page + 1 : undefined`.
- The key is `[...scope, ...queryKey, "infinite", operation, ...keyParts]`: never shared with a
  regular list (`InfiniteData` vs `T[]`) and never including the page parameter. Put filters that
  change results in `queryKey` or `keyParts`.
- `invalidate()`, `invalidateLists()`, and mutation `invalidate: "lists"` include infinite lists.
- The mode is fixed for a mounted component: switching `infinite` on or off throws (hook order
  never changes). Use a different component or React `key`.

## Hook-free query options

Import the factory from `apixa/react/advanced` in React components, server components, loaders, or imperative code. It uses the same key and execution engine as the hook and carries TanStack's query-key data tag.

```tsx
import { createResourceQueryOptions } from "apixa/react/advanced";
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

`createResourceInfiniteQueryOptions(resource, { queryKey, infinite })` is the infinite counterpart for native `useInfiniteQuery`, `useSuspenseInfiniteQuery`, and `prefetchInfiniteQuery`. `useSuspenseQuery` does not accept `enabled`, `placeholderData`, or `throwOnError`, per TanStack's own semantics; use a suitable generated options object without those fields. Do not pass a `suspense` boolean to `useResourceQuery`.

### Server rendering (Next.js App Router)

```tsx
// app/page.tsx (server component)
import { ApixaHydrationBoundary } from "apixa/react";
import {
  QueryClient,
  dehydrate,
  prefetchResourceInfiniteQuery,
  prefetchResourceQuery,
} from "apixa/react/advanced";

export default async function Page() {
  const client = new QueryClient(); // request-scoped: never share a server cache between users
  await Promise.all([
    prefetchResourceQuery(client, api.users, { queryKey: ["users"] }),
    prefetchResourceInfiniteQuery(client, api.posts, {
      queryKey: ["posts"],
      infinite: postsPaging,
    }),
  ]);
  return (
    <ApixaHydrationBoundary state={dehydrate(client)}>
      <Users />
      <Posts />
    </ApixaHydrationBoundary>
  );
}
```

`QueryClient` and `dehydrate` come from the React-free advanced entry because a Server Component
cannot construct a value exported from a `"use client"` module. `ApixaHydrationBoundary` is a client
component and comes from the main entry.

Client components call the hooks with the same `queryKey` (and the same `infinite` config, kept in
a shared module) under `ApixaProvider` (or `QueryClientProvider`); with a `staleTime` the hydrated data is used without
an immediate refetch. The advanced entry is hook-free and server-safe; the main entry keeps
`"use client"`. Native `queryClient.prefetchQuery(createResourceQueryOptions(...))` remains the
escape hatch. A [working example](../../examples/query-ssr-next/) includes a production build.

## Cancellation, retries, and errors

TanStack's signal is forwarded to standard Core read operations (and infinite pages), so a key change (search, page), an unmount, or `users.cancel()` aborts the obsolete request; TanStack reverts the query state instead of reporting an error, and an intentional abort is not retried. Core combines it with its timeout and preserves its own `HttpError`, `TimeoutError`, `AbortError`, and other error classes. Cancelling through `queryClient.cancelQueries` aborts an in-flight request. A custom read's argument builder must forward `signal` explicitly. Core retry and TanStack retry are separate layers: a Core retry repeats a transport attempt within one operation call; a TanStack retry repeats the operation call. Set one layer deliberately if exact attempt counts matter. Native `throwOnError` supports React error boundaries.

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

users.create.isPending; // state directly on the callable operation
users.create.data;
users.create.variables;
users.states.create.isPending; // the same state through `states`
users.states.update.error;
users.states.exportUser.data;
```

- **Every enabled Core write is inherited**, including custom writes; `mutations` only
  overrides options or adds client-only operations. Calls take the operation's own separate
  arguments and return its exact result type; TanStack receives them as a tuple.
- Editors suggest every write operation name inside `mutations: {}` and every native
  `UseMutationOptions` field inside each entry (`retry`, `retryDelay`, `gcTime`, `networkMode`,
  `scope`, `throwOnError`, `meta`, `onMutate`, `onSuccess`, `onError`, `onSettled`).
- An unknown name needs a `mutationFn`; a `mutationFn` on an inherited name is rejected (inherited
  operations always run Core). Disabled operations are absent.
- `users.<op>.isPending` (and `data`, `error`, `variables`, `status`, `isIdle`, `isSuccess`,
  `isError`, `isPaused`, `context`, `failureCount`, `failureReason`, `submittedAt`, `reset`) are
  live getters over the same observer as `states.<op>` — never copied values. Reading one creates
  only that operation's observer.
- `states.<op>` is TanStack's `MutationObserverResult` for the **latest** call, exactly like
  `useMutation`. Every call still resolves its own promise; for all in-flight calls use native
  `useMutationState({ filters: { mutationKey: users.keys.mutation("create") } })`.
- Observers are created lazily on first call or `states` access — unused operations cost nothing.
  The hook makes a fixed number of React hook calls (one external store over native
  `MutationObserver`s) and follows QueryClient, resource, and option changes.
- Mutation keys: `[...scope, ...queryKey, "mutation", op]`. Apixa's `scope` is the key prefix;
  TanStack's serial-execution `scope: { id }` belongs inside an operation's config.
- Writes are not retried unless configured (TanStack's default). When the Core operation has
  `idempotency` configured, Apixa creates one key per call and passes it on every TanStack retry
  (`options.idempotencyKey`), so retries of one logical write share a key. Core transport retries
  inside an attempt reuse it too. A key you pass in the call options wins.

**Invalidation** (after success only, awaited before your `onSuccess`): writes and client-only
operations default to `"all"` (every query under the resource key). Reads use `useResourceQuery`.

```ts
invalidate: "all" | "lists" | false
invalidate: { lists: true, details: (data, [id]) => [id] }
invalidate: async ({ client, keys, data, args }) => { /* your own QueryClient work */ }
```

### Declarative optimistic updates

```tsx
const users = useResourceMutation(api.users, {
  queryKey: ["users"],
  mutations: {
    update: {
      optimistic: {
        detail: ([id]) => id, // every cached variant of this detail
        update: (current, [, changes]) => ({ ...current, ...changes }), // typed: User → User
      },
    },
    create: {
      optimistic: { list: (users, [body]) => [...users, { id: "temp", ...body }] }, // every list
    },
    delete: {
      optimistic: { list: (users, [id]) => users.filter((u) => u.id !== id) },
    },
    archive: {
      optimistic: {
        targets: ([id], keys) => [{ queryKey: keys.operation("stats"), update: (s: Stats) => s }],
      },
    },
  },
});
```

What happens per call: Apixa cancels in-flight fetches of the affected entries, applies the change
to entries that already have data (it never invents an entry), runs the Core operation through the
native mutation lifecycle, and on failure removes **only that call's change**. Updaters receive
raw cached data (not `select` output) and must return new objects.

Concurrency: each entry keeps its last server data plus an ordered stack of optimistic changes.
A failing call is removed from the stack and the entry is recomputed, so it never restores a stale
snapshot over another call's change (A fails after B succeeded → B's change stays). Server data
that arrives while calls are pending (a refetch or invalidation) becomes the new base and pending
changes are re-applied on top. A fetch of an affected entry that was sent before the server had the
change, and is still running when the call succeeds, is restarted (native `cancelRefetch`), so a
stale response never replaces confirmed data. Bookkeeping is dropped when nothing is pending.
Rollback still runs after an unmount: the callbacks belong to the mutation, not the component.

Manual writes take over: `cache.set()` or native `setQueryData` on an entry with pending changes
hands that entry back to you. Apixa forgets its changes there and never rolls it back, so a
functional write built on the optimistic value keeps that value even if the call later fails,
until the next fetch (the default `invalidate: "all"` brings it). Other entries stay managed.

Ordering model: the visible data applies successful changes in the order the calls were sent. If
two calls change the same field and the server finishes them in a different order, the cache and
the server can disagree until the next fetch. The default `invalidate: "all"` (or any invalidation
covering the entry) resolves it; with `invalidate: false` it persists until the entry refetches.

Callback order: internal optimistic work → your `onMutate` (its result is the native context of
every callback and `states.<op>.context`); on error: rollback → your `onError`; on success: the
`invalidate` policy (default `"all"`) → your `onSuccess`; then `onSettled`. Without `optimistic`,
mutations behave exactly as before.

You can still write optimistic updates by hand with native `onMutate` / `onError`, `QueryClient`,
and rollback context.
`states.<op>.context` and the callbacks infer `onMutate`'s (awaited) return. **TypeScript limit:**
when `onMutate` has an unannotated parameter _and_ a sibling callback reads the context,
TypeScript fixes the config before it sees `onMutate`'s return, and that callback's context is
`{}`. Annotate the parameter (`async ([id, body]: OperationParameters<typeof api.users, "update">)`)
or omit it.

For a standalone native `UseMutationResult`, call TanStack’s `useMutation` with a Core
operation as `mutationFn`, or use `operationMutationOptions` from the advanced entry.

## Unified facade: `useResource`

```tsx
const users = useResource(api.users, {
  queryKey: ["users"],
  query: { staleTime: 60_000, select: (list) => list.filter((u) => u.active) },
  mutations: { create: { invalidate: "lists" } },
});

users.data;
users.isLoading;
users.refetch();
users.invalidate();
await users.getById(id); // read → QueryClient cache
await users.create(body); // write → mutation lifecycle
users.states.create.isPending;
users.create.isPending; // this write — not the same as users.isPending (the list query)
await users.prefetch({ operation: "getById", args: [id] });
users.cache.get();
await users.operations.archive(id); // guaranteed namespace
```

`query: { infinite: { … } }` gives the facade the infinite result (`fetchNextPage`, `pages`, …)
next to the same writes and helpers.

`query` takes `useResourceQuery` options minus the shared `queryKey`/`scope`.
`mutations` is the resource-wide mutation configuration. Read-classified operations run through the query layer and
writes/client-only operations through mutations — never both. `states` holds writes and
client-only operations only. Flat names never shadow query fields or `states`/`operations`; every
operation is always in `operations`. Without a guaranteed `getAll`, there is no list state and no
automatic query.

## Migrating from v0.8

`users.create(body)`, `users.update(id, body)`, `users.delete(id)`, and `users.mutations.*` moved
off `useResourceQuery`. Use `useResource` for the old all-in-one shape (`users.create(body)`,
`users.states.create`), or `useResourceMutation(api.users, { queryKey })` for writes alone.

`createResourceController` remains in the advanced entry, composing the query and mutation
controllers. Conventional `createOptions`, `updateOptions`, and `deleteOptions` use exact Core
argument tuples as mutation variables. For example, `mutateAsync([id, body])` for `update`. The advanced entry also exports `ResourceMutationStore`,
`applyInvalidation`, and `describeOperations` for custom integrations.

## Query and mutation DX additions (unreleased)

Runtime-verified with React 18.3.1 and 19.1.1 against `@tanstack/react-query` 5.90.1 (the peer
minimum) and 5.106.1; SSR hydration verified in Chromium with Next.js 15.5.

Additive: `prefetch`, `cache`, and `cancel` helpers; infinite mode in `useResourceQuery`
(`createResourceInfiniteQueryOptions`, `prefetchResourceQuery`, `prefetchResourceInfiniteQuery`
in the advanced entry); mutation state on callable operations; declarative `optimistic` updates;
Core `idempotency` keys reused across TanStack retries. Behavior changes for existing code:

- Framework properties win over operation names. A read named after a query-result property is
  not flattened onto the result; call it through `operations.<name>` (always available, typed).
  Reserved on `useResourceQuery`: `query`, `keys`, `controller`, `invalidate`, `invalidateLists`,
  `invalidateDetail`, `operations`, `prefetch`, `cache`, `cancel`, every native result field
  (`data`, `status`, `refetch`, `promise`, …), and the infinite fields (`fetchNextPage`,
  `fetchPreviousPage`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`,
  `isFetchingPreviousPage`, `isFetchNextPageError`, `isFetchPreviousPageError`) in both modes.
  `useResource` adds `states`. New in this release: `prefetch`, `cache`, `cancel`, and the infinite
  fields.
- `invalidateLists()` and mutation `invalidate: "lists"` / `{ lists: true }` also invalidate the
  resource's infinite lists (details, custom-read entries, and other resources are untouched).
- Mutation invalidation restarts a fetch that is already running for an inactive matching entry
  (it was sent before the write); idle inactive entries are only marked invalid, as natively.
- The key factory gains `infinite(op?, keyParts?)` and `infinites()`.

## v1.0.0 breaking changes

- Custom declarative operations require `kind: "read" | "write"`; custom functions require
  `{ kind, run }`. A bare custom function is rejected. Built-in overrides inherit their fixed kind.
- GET, HEAD, and OPTIONS require `"read"`; POST, PUT, PATCH, and DELETE require `"write"`.
  This includes every `ctx.request()` made by a function operation.
- Reads are available through `useResourceQuery`; writes and client-only mutations are available
  through `useResourceMutation`. A read name cannot be configured under `mutations`.
- `useResourceMutation(resource, "create", options)` and `readOperations` were removed.
- `useResource` takes `mutations` at the top level, alongside `queryKey`, `scope`, and `query`.

## Performance baseline

After building, run `node scripts/query-performance.mjs [iterations]` from the repo root. It measures generated list/detail options plus warm `ensureQueryData` cache hits. This is a local reproducible baseline, not a cross-machine target. `useResourceQuery` mounts one query observer; inherited reads and prefetches mount none; mutation observers exist only for operations actually used. The test suite asserts render-count parity with native `useQuery`.

## Limits

- Core's `{ full: true }` option is excluded from hook arguments (hooks cache raw payloads); call
  the Core client directly for `ApiResponse` envelopes.
- Imperative inherited reads use `fetchQuery`'s default `staleTime` (0): each call refetches
  unless the entry is fresh. Use the reactive hook, `prefetch` (which inherits the hook's
  `staleTime`), or `ensureQueryData` for cache-first reads.
- Direct mutation state (`users.create.isPending`) is the latest call, like `useMutation`. It
  does not mean every earlier concurrent call finished: await each promise, or use native
  `useMutationState` for all in-flight calls.
- Optimistic `list` updaters cover regular lists only; reach infinite lists with `targets`
  (`keys.infinite()`), whose updater receives `{ pages, pageParams }`.
- Optimistic ordering and manual-write takeover follow the model described under
  [Declarative optimistic updates](#declarative-optimistic-updates).
- A first fetch of an entry that has no data yet is never restarted (TanStack deduplicates it); if
  it was sent before a write, invalidate that entry after the write to be sure.
- Core `idempotency` applies to declarative operations; function operations reject the option
  (`ConfigError`) and pass their own header through `ctx.request({ headers })`.
- Hook results update on TanStack's notification tick, not synchronously inside `act()`; tests
  should `waitFor` the new value.
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
