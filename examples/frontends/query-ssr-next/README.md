# Next.js App Router query hydration

This runnable example prefetches Apixa resources on the server with `prefetchResourceQuery` and
`prefetchResourceInfiniteQuery`, dehydrates the request-scoped Apixa `QueryClient`, and renders
client components against the hydrated cache:

- `useResource` with the hydrated list, an optimistic `create` (with a Core idempotency key)
  that invalidates it, `users.create.isPending`, hover prefetching with `users.prefetch(...)`, and
  a Core `kind: "read"` custom operation (`stats`) fetched through the QueryClient cache;
- `useResourceQuery` in infinite mode for cursor-paginated posts (`fetchNextPage`).

The paging config lives in `lib/api.ts` so the server and the client build the same cache key.
A second page, `/files`, covers files end to end (`lib/files-demo.ts`, `app/files/`): a rule-checked
upload (`fileFields: { photo: { maxSize, accept } }`) that rejects locally with typed
`ValidationError.violations` and sends no request; a counted stream upload and a download with
`onTransfer` progress (known total); and cancellation with an `AbortController`. Progress is plain React
state fed by `onTransfer`; the Server Component downloads a `Blob` itself and passes only plain values
down (binary data does not cross the Server -> Client boundary). `pnpm verify` drives this page in
Chromium. A deterministic local transport supplies data, so no API service or credentials are required.

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

The `/files` page also demonstrates an explicitly configured 13-byte chunked upload with one
intentional interruption, a caller-owned checkpoint and authoritative resume against the local
`/api/transfers` demo backend. Chromium verifies interruption at 4 confirmed bytes and completion
at 13 bytes in both dev and production. This tiny fixture demonstrates protocol behavior, not a
production storage backend. The backend caps file/session memory; implement your real protocol and
access control on your own server. `lib/s3-transfer.ts` provides a backend-mediated S3 recipe with
no SDK or browser signing credentials. Public `apixa/...` imports resolve to workspace packages
through local TypeScript aliases; the verification consumer installs only the packed `apixa` package.
