# Next.js App Router query hydration

This runnable example prefetches Apixa resources on the server with `prefetchResourceQuery` and
`prefetchResourceInfiniteQuery`, dehydrates the request-scoped Apixa `QueryClient`, and renders
client components against the hydrated cache:

- `useResource` with the hydrated list, an optimistic `create` (with a Core idempotency key)
  that invalidates it, `users.create.isPending`, hover prefetching with `users.prefetch(...)`, and
  a Core `kind: "read"` custom operation (`stats`) fetched through the QueryClient cache;
- `useResourceQuery` in infinite mode for cursor-paginated posts (`fetchNextPage`).

The paging config lives in `lib/api.ts` so the server and the client build the same cache key.
A deterministic local transport supplies data, so no API service or credentials are required.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @apixa/example-query-ssr-next build
pnpm --filter @apixa/example-query-ssr-next dev
```

The server imports the React-free `@apixa/react/advanced` entry (`QueryClient`, `dehydrate`, the
prefetch helpers). Client components import the main entry (`ApixaProvider`,
`ApixaHydrationBoundary`, the hooks), which is built with a `"use client"` directive.
