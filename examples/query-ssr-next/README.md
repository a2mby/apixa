# Next.js App Router query hydration

This runnable example prefetches an Apixa resource on the server with
`createResourceQueryOptions`, dehydrates the request-scoped TanStack `QueryClient`, and renders
`useResource` in a client component against the hydrated cache: the hydrated list, a `create`
write that invalidates it, `states.create.isPending`, and a Core `kind: "read"` custom operation
(`stats`) fetched through the QueryClient cache. A deterministic local
transport supplies data, so no API service or credentials are required.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @apixa/example-query-ssr-next build
pnpm --filter @apixa/example-query-ssr-next dev
```

The server imports the hook-free `@apixa/tanstack-query/advanced` entry. The client component
imports the main hook entry, which is built with a `"use client"` directive.
