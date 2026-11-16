# Pagination

Apixa paginates list operations with one logical input model and one normalized result per strategy
(`page`, `cursor`, `offset`). The backend stays authoritative for record selection, sorting, limits and
consistency: Core never paginates a real backend response locally. Status: **implemented** unless a
section says otherwise.

## Minimal

```ts
const api = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    products: { path: "/products", paginationConfig: "page" }, // standard envelope
  },
});

const page = await api.products.getAll({ query: { page: 1, pageSize: 20, category: "books" } });
// { data, total, page, pageSize, ...extension metadata the backend sent }
```

## Configuration and activation

| Where                                                                           | Meaning                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| resource `paginationConfig`                                                     | Shared configuration. **Built-in `getAll` paginates automatically.** It activates nothing else. (Resource `pagination` is rejected with `ConfigError`.)    |
| operation `pagination: true`                                                    | Use the shared `paginationConfig`; without one, the standard `"page"` contract.                                                                            |
| operation `pagination: false`                                                   | Off (also on `getAll`).                                                                                                                                    |
| operation `pagination: "page"`/`"cursor"`/`"offset"`, a preset name, or `{ … }` | An **independent** configuration. It replaces the resource configuration completely: nothing is deep-merged (reuse a shared constant to avoid repetition). |
| operation `pagination` omitted                                                  | `getAll`: follows `paginationConfig`. Every other operation: not paginated.                                                                                |

```ts
paginationConfig: "laravel",
operations: {
  search: { method: "GET", pagination: true },      // shared Laravel mapping
  archived: { method: "GET", pagination: "cursor" }, // independent: no Laravel mappings
  stats: { method: "GET", pagination: false },
},
```

Pagination is allowed on `getAll`, `getMany` and declarative custom operations of any HTTP method. Other
builtins keep their established response meaning (`getById`, `exists`, `count`, writes) and reject it.
`slice` cannot be combined with an active `getAll` pagination (`ConfigError`).

## Strategies

| Strategy | Logical request keys             | Result (required → optional)                                            |
| -------- | -------------------------------- | ----------------------------------------------------------------------- |
| `page`   | `page` (1-based), `pageSize`     | `data, page, pageSize, total` → `pageCount, hasMore`                    |
| `offset` | `offset` (≥ 0), `pageSize`       | `data, offset, pageSize, total` → `nextOffset, previousOffset, hasMore` |
| `cursor` | `cursor`, `before`\*, `pageSize` | `data, nextCursor` (`null` = reported end) → `previousCursor, hasMore`  |

\* `before` (continue backwards) is only sent when a backend name is mapped in `params.before`.

- **Page**: page numbers are always one-based. `pageBase: 0` converts both ways for zero-based backends.
  Empty pages are normal results. A backend error for an out-of-range page stays an error.
- **Offset**: no assumption that the next offset is `offset + requestedSize`. Navigation uses the
  backend's `nextOffset`, or continues after the rows actually returned when a `total` shows more exist.
- **Cursor**: opaque. Preserved byte for byte, never decoded, never echoed in errors. Forward-only
  backends are supported: no previous cursor is invented. Keyset pagination is just a cursor backend.
- `total` is required for the standard envelope and presets, and for custom `fields` mappings that
  declare it; it is optional (and typed optional) for `parseList` and for mappings that omit it. Missing
  metadata is never fabricated.

Metadata that is present is validated (type and range). Contradictory metadata (for example
`hasMore: false` with a `nextCursor`) is rejected with `ParseError`, not resolved silently.

## Mapping a backend

```ts
paginationConfig: {
  strategy: "page",
  fields: { data: "items", total: "paging.count", page: "paging.p", pageSize: "paging.size" },
  params: { pageSize: "limit" },     // logical name -> backend query name
  pageBase: 0,                        // backend pages start at 0
  defaultPageSize: 25,                // sent only if the caller gives none
  maxPageSize: 100,                   // reject (never clamp) larger requests
}
```

Presets name one concrete envelope each (not a whole framework):

| Preset                     | Backend envelope                                                                            | Query names                                |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `laravel`                  | Laravel API resource collection: `{ data, meta: { total, current_page, per_page } }`        | `per_page`                                 |
| `laravel-paginator` page   | `paginate()` JSON: `{ data, total, current_page, per_page }`                                | `per_page`                                 |
| `laravel-paginator` cursor | `cursorPaginate()` JSON: `{ data, next_cursor, prev_cursor }` (`previousCursor` is exposed) | `per_page`                                 |
| `strapi`                   | Strapi REST: `{ data, meta: { pagination: { total, page, pageSize } } }`                    | `pagination[page]`, `pagination[pageSize]` |
| `payload`                  | Payload CMS REST: `{ docs, totalDocs, page, limit }`                                        | `limit`                                    |
| `nestjs`                   | nestjs-typeorm-paginate: `{ items, meta: { totalItems, currentPage, itemsPerPage } }`       | `limit`                                    |

No new preset ships without a documented real-world contract. For anything else use `fields`, or the adapters below.

## Request input and collisions

Logical keys (`{ page, pageSize, cursor, before, offset }`) can be passed in `options.pagination` or
directly in `options.query` for every paginated operation, including POST searches, and are mapped to
backend names by `params`. Passing any logical pagination key in both `options.pagination` and `options.query`
is rejected with `ValidationError`. Passing `options.pagination` on a
non-paginated operation is rejected with `ConfigError`. Other query parameters pass through;
the caller's input is never mutated. Values are validated before any request is made
(positive/non-negative integers, string cursors, `maxPageSize`) with `ValidationError` (mocks: `MockError`).

An ambiguous request is rejected, not resolved silently: for example `{ pageSize: 20, per_page: 50 }`
when `pageSize` maps to `per_page`, two logical keys mapped to one backend name (config error), a
transformed key that lands on a mapped name, a mapped name present both in the URL and in the structured
query, or middleware that adds a logical name beside its mapped name.

**Detection boundary:** values present when the call is built and, once more, after request middleware
and before the URL/query merge. Custom serializers or middleware that rewrite data later cannot be
detected.

### `buildRequest` (live only): query, body or headers

`params` only places values in the query. For anything else, give `buildRequest` the validated logical
values; it returns `{ query?, body?, headers? }`:

```ts
pagination: {
  strategy: "cursor",
  buildRequest: ({ cursor, pageSize }) => ({
    body: { pagination: { after: cursor, first: pageSize } },
    headers: { "x-page-size": String(pageSize ?? "") },
  }),
}
```

Body parts are shallow-merged into a plain-object body (collisions, `__proto__`/`constructor`/`prototype`
names, non-object bodies and body-less operations are rejected); header names/values are checked against
injection. It replaces `params` (combining them is a `ConfigError`). Mocks consume the logical query and
never run it.

### `parseList` (response adapter)

`parseList(body, { status, headers, request })` returns the normalized fields for shapes `fields` cannot
describe (Link headers, envelopes with computed values, …). `request.pagination` is the logical input the
call used. Output is validated like any other mapping.

## Navigation (no requests are sent)

```ts
import { nextPageInput, previousPageInput, paginationContextKey } from "apixa";

const input = { query: { page: 1, pageSize: 20, category: "books" } };
const page = await api.products.getAll(input);

const next = nextPageInput("page", page, input);
// { available: true | false | undefined, input?: {...}, reason?: string }
if (next.input) await api.products.getAll(next.input);
```

`available` answers _is another page known to exist?_ (`true` / `false` / `undefined` = unknown).
`input` answers _can Apixa build the request?_ They differ: `hasMore: true` without a cursor gives
`available: true` and no `input`. Precedence for pages: `hasMore`, then `pageCount`, then `total` with the
reported page size. A short page alone never means "last page". Results contain no closures, so they and
their continuations serialize for SSR and external caches.

Cursor previous direction defaults to the `before` key; Laravel sends `prev_cursor` back as `cursor`:
`previousPageInput("cursor", page, input, { previousKey: "cursor" })`.

A continuation is only valid for the filters, sorting and body it was issued for. Compare
`paginationContextKey(input)` (everything except the position) before reusing one. For POST / PUT / PATCH
/ DELETE operations, a next input does not make repeating the call safe; the operation author owns that.

### With TanStack Query (`apixa/react`)

```ts
useResourceQuery(api.products, {
  queryKey: ["products", paginationContextKey(base)],
  infinite: {
    initialPageParam: null as string | null,
    query: (cursor) => ({ ...base.query, cursor: cursor ?? undefined }),
    getNextPageParam: (last) =>
      nextPageInput("cursor", last, base).input?.query.cursor as string | undefined,
  },
});
```

The React package derives nothing about pagination itself: `getNextPageParam` is yours; the helpers keep it
consistent with the result contracts. No caching, accumulation or prefetching exists in Core.

## Response pipeline order (paginated operations)

1. The decoded payload is kept as `ApiResponse.source` (visible with `{ full: true }`).
2. The envelope is decoded and normalized from that **raw** payload. A configured `response.unwrap`
   therefore does **not** apply to paginated operations (field paths address the raw body).
3. `transforms.response` runs on `data` rows only; pagination metadata keys are untouched.
4. `response.parse`, then `response.validate`, run on the normalized object.
5. `middleware.onResponse` runs on the processed `ApiResponse`.
6. `schema.response` (when configured) validates the post-middleware value.
7. The final pagination contract is validated (`ParseError`, with `status`, `data` = source, `response`).
8. Returns the normalized object, or the full response with `{ full: true }`.

Non-JSON `responseType` on a paginated operation is a `ConfigError`. Real HTTP
errors are untouched. Only the standard envelope keeps backend extension keys on the result; for mapped
envelopes read the rest from `source`.

**Browsers and headers:** headers given to `parseList` must be exposed by the server
(`Access-Control-Expose-Headers`) for cross-origin calls. A custom transport must return the headers the
adapter reads.

## Mocks

Mocked resources (`mock:` and `defineMockApi`) produce the same contracts for all three strategies, run
the same logical validation (including collisions and `maxPageSize`), and apply `defaultPageSize`. A
mock cursor is a decimal row index; mocks are forward-only and report a fixed total.

Custom mock handlers on a paginated operation:

- return an **array** (an unpaginated collection) and the engine paginates it once;
- return an **object** (a finished page) and it is not paginated again; it is validated against the
  contract, and a malformed page fails with `ParseError`.

Mocks do **not** reproduce a backend's cursor stability, ordering, concurrent insert/delete behaviour,
snapshot consistency, filter/sort capabilities or opaque token format. An out-of-range mock page is an
empty page; a live backend may answer with an error. `offset` is a reserved key in mock queries (like
`page` / `pageSize` / `cursor`); it is not a row filter.

## Not implemented (deliberately deferred)

Following next/previous URLs or `Link` headers automatically (use `parseList` to read them; backend URLs
are untrusted metadata and are never requested), snapshot-token lifecycle, declarative header
pagination (use `buildRequest`), infinite scrolling / accumulation / prefetching / cache invalidation in
Core, custom strategies beyond the three, and extra presets without a documented contract.

## Migration

- Rename resource `pagination` to `paginationConfig` (resource `pagination` is rejected with `ConfigError`; `pagination` is reserved for operation definitions and `options.pagination` call inputs).
- `PageResult` (previously a page/cursor union) is now the page contract; the union is `PaginatedResult`.
  Result types gained optional metadata (`pageCount`, `hasMore`, `previousCursor`, …), so exact-type
  assertions (`toEqualTypeOf`) on results need updating.
- Custom `fields` / `parseList` page and offset mappings no longer require `total`; a declared field must
  still exist. A cursor result always requires `nextCursor` (`null` at the end).
- `laravel-paginator` cursor results now include `previousCursor`.
- Validation error text for `pagination` now lists `"offset"`; invalid request values are rejected
  before dispatch with `ValidationError`; `parseList` receives `{ status, headers, request }`.
