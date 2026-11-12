# Product Management API

A realistic, standalone HTTP API over the PostgreSQL `products` table, built as a permanent testing
backend for the Apixa SDK. It uses ordinary Laravel and ordinary HTTP: no Apixa code runs in Laravel and
no Apixa-specific request convention is required. Workspace scoping is **routing, not authorization**;
there is no authentication, so do not treat it as tenant security.

- Base URL (development): `http://127.0.0.1:8000/api`
- Everything is under `/workspaces/{workspace}/products`
- Send `Accept: application/json` and, for bodies, `Content-Type: application/json`
- MongoDB products are independent snapshots and are **not** exposed here.

## 1. Architecture

| Layer        | Files                                                                                                                                                 | Responsibility                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Routes       | `routes/api.php`                                                                                                                                      | Fixed paths (`stats`, `exports`, `bulk/*`…) are registered before `{product}`.    |
| Controllers  | `app/Http/Controllers/Products/` `ProductController`, `ProductCatalogController`, `ProductInventoryController`, `ProductBulkController`, `ProductTransferController` | Thin: bind request → call service → shape response.                               |
| Requests     | `app/Http/Requests/Products/`                                                                                                                         | Validation only. `ProductFormRequest` holds the shared field rules.               |
| Resource     | `app/Http/Resources/ProductResource.php`                                                                                                              | The one response shape for a product (also used by exports and bulk results).     |
| Services     | `app/Services/Products/` `ProductService`, `ProductQueryService`, `InventoryService`, `ProductBulkService`, `ProductTransferService`                    | All behavior: persistence, filtering, concurrency, bulk, import/export.           |
| Support      | `app/Support/Money.php`, `ProductEtag.php`, `app/Rules/`, `app/Exceptions/ApiException.php`, `app/Http/Middleware/RejectMalformedJson.php`             | Exact decimals, validators, error type, JSON guard.                               |
| Config       | `config/products.php`                                                                                                                                 | Every limit (page size, batch size, import size/rows, low-stock threshold…).      |
| Error format | `bootstrap/app.php`                                                                                                                                   | One error body for every `/api/*` failure.                                        |

No migration was added: the existing table, constraints (`price >= 0 AND stock >= 0`, unique `sku` and
`slug`) and GIN index on `attributes` are sufficient. Existing ids, fixtures and seeders are untouched.

## 2. Product representation

```json
{
  "data": {
    "id": "product-002",
    "workspace_id": "ws-1",
    "sku": "APX-0002",
    "slug": "product-002",
    "name": "Notebook 2",
    "category": "accessories",
    "price": "2.74",
    "stock": 2,
    "active": true,
    "tags": ["manual", "sale"],
    "attributes": { "color": "blue", "dimensions": { "width": 2, "height": 2 }, "variants": [{ "code": "a", "available": true }] },
    "created_at": "2026-01-01T09:00:00Z",
    "updated_at": "2026-01-01T09:00:00Z"
  }
}
```

- `price` is always a **two-decimal string** (`"19.90"`). Send a string (preferred), an integer, or a JSON number
  with at most two decimals. `0.1 + 0.2` (`0.30000000000000004`) is rejected, never rounded.
- `tags` is always a list (`[]` when empty); `attributes` is always an object (`{}` when empty). Nested `{}` and `[]`
  are preserved exactly.
- Timestamps are UTC (`…Z`), whatever time zone the database session uses.
- Every single-product response carries a weak `ETag` (see §9). `POST` also sets `Location`.
- `id` is generated (`product-<ulid>`), never client-chosen. `workspace_id` and `id` cannot be sent (`422`).

## 3. Endpoint reference

All paths are relative to `/api/workspaces/{workspace}/products`. An unknown workspace, an unknown product,
or a product that belongs to a different workspace is `404 not_found`.

| Method & path                       | Purpose                                                         | Success                       |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| `GET /`                             | Filtered, sorted, paginated list (§4)                            | `200` `{data, links, meta}`   |
| `POST /`                            | Create                                                          | `201` + `Location`, `ETag`    |
| `GET /{product}`                    | Read                                                            | `200` + `ETag`                |
| `PUT /{product}`                    | **Replace** all editable fields                                 | `200`                         |
| `PATCH /{product}`                  | **Partial** update                                              | `200`                         |
| `DELETE /{product}`                 | Delete                                                          | `204`; again → `404`          |
| `GET /filters`                      | Filter-panel metadata (categories, tags, ranges, limits)        | `200`                         |
| `GET /stats`                        | Dashboard aggregates (§6)                                       | `200`                         |
| `GET /lookup?sku=`                  | Exact SKU lookup                                                | `200` / `404`                 |
| `GET /low-stock?threshold=`         | List with `0 < stock <= threshold` (all list params apply)      | `200`                         |
| `GET /out-of-stock`                 | List with `stock = 0` (all list params apply)                   | `200`                         |
| `PATCH /{product}/stock`            | Set exact stock `{stock}`                                       | `200`                         |
| `POST /{product}/stock/adjustments` | Atomic delta `{delta}`                                          | `200` / `409`                 |
| `PATCH /{product}/price`            | Set price `{price}`                                             | `200`                         |
| `PATCH /{product}/activation`       | Set state `{active}` (idempotent)                               | `200`                         |
| `POST /{product}/duplicate`         | Copy (optional `name`, `sku`, `slug`, `copy_stock`, `active`)   | `201` + `Location`           |
| `POST /bulk/updates`                | Per-item PATCH `{items:[{id,…fields}]}`                          | `200` / `409`                 |
| `POST /bulk/deletions`              | `{ids}`                                                         | `200` / `409`                 |
| `POST /bulk/activation`             | `{ids, active}`                                                 | `200` / `409`                 |
| `POST /bulk/price-adjustments`      | `{ids, operation: set\|add\|percent, value}`                     | `200` / `409`                 |
| `POST /bulk/stock-adjustments`      | `{items:[{id, delta}]}`                                         | `200` / `409`                 |
| `POST /imports`                     | Multipart CSV/JSON import (§8)                                  | `200` summary                 |
| `GET /exports?format=`              | Streaming `csv` (default), `json`, `ndjson` download            | `200` stream                  |
| `GET /exports/preview`              | Count + sample + formats, no download                           | `200`                         |

### Create / PUT / PATCH semantics

| Field                           | `POST`                    | `PUT` (replace)                       | `PATCH` (partial)                |
| ------------------------------- | ------------------------- | ------------------------------------- | -------------------------------- |
| `name`, `sku`, `category`, `price`, `stock`, `active` | required   | required                              | optional                         |
| `slug`                          | optional (derived from name, made unique) | required                | optional                         |
| `tags`, `attributes`            | optional → `[]` / `{}`    | optional → **reset** to `[]` / `{}`   | optional; **replaces** the whole value |

`PATCH` with an empty body is a valid no-op. `attributes: null` resets to `{}`.

Constraints: `name` ≤ 255; `sku` ≤ 100, `[A-Za-z0-9][A-Za-z0-9._-]*`, **globally** unique (it is a table-level
unique index, so a SKU used in another workspace is also "taken"); `slug` lowercase kebab-case, globally unique;
`category` ≤ 100; `price` `0` … `9999999999.99`; `stock` `0` … `2147483647`; `tags` ≤ 50 distinct strings ≤ 50
chars; `attributes` a JSON object ≤ 20,000 bytes.

```http
POST /api/workspaces/ws-1/products
{ "name": "USB-C cable", "sku": "CAB-100", "category": "accessories", "price": "9.90", "stock": 25,
  "active": true, "tags": ["sale"], "attributes": { "color": "black", "dimensions": { "width": 1, "height": 100 } } }

201 Created
Location: http://127.0.0.1:8000/api/workspaces/ws-1/products/product-01j…
ETag: W/"3f2a…"
```

## 4. Listing, filtering, sorting, pagination

`GET /` (also `low-stock`, `out-of-stock`, `exports`, `exports/preview`) accept the same query:

| Param                                       | Meaning                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `q`                                         | Case-insensitive substring in `name`, `sku` or `slug` (`%` and `_` are literal).                          |
| `category[]=a&category[]=b` or `category=a,b` | Any of the categories.                                                                                  |
| `active=true\|false`                        | Active state (`1`/`0` also accepted).                                                                     |
| `price_min`, `price_max`                    | Inclusive range (`price_max >= price_min`).                                                               |
| `stock_min`, `stock_max`                    | Inclusive range.                                                                                          |
| `in_stock=true\|false`                      | `stock > 0` / `stock = 0`.                                                                                |
| `low_stock=true` `[&low_stock_threshold=N]` | `0 < stock <= N` (default `config('products.low_stock_threshold')` = 5).                                  |
| `tags[]=a&tags[]=b` or `tags=a,b`, `tags_match=any\|all` | JSONB containment. `any` (default): has at least one. `all`: has every one.                  |
| `attr[color]=blue`, `attr[dimensions.width]=4`, `attr[dimensions.height]`, `attr[variant]=a` | Whitelisted JSONB paths only (`GET /filters` lists them). Multiple `attr` filters are AND-ed. `variant` matches `attributes.variants[].code`. |
| `created_from`, `created_to`, `updated_from`, `updated_to` | ISO date or date-time. A bare `to` date means through the **end of that day** (UTC). Dates without an offset are UTC. |
| `sort=name,-price`                          | Up to 3 distinct fields from `name, price, stock, category, created_at, updated_at`; `-` = descending. Ties are broken by `id`, so pages never overlap or skip. |
| `page`, `per_page`                          | Page pagination. Default 15, max 100 (`422` above).                                                       |
| `pagination=cursor` or `cursor=…`           | Cursor pagination for infinite scroll: no `COUNT(*)`, stable under inserts. Use `meta.next_cursor`.       |

Unknown sort fields, unsupported `attr` paths, bad dates or ranges are `422` — user input is never interpolated
into SQL; sortable columns and JSON paths come from `config/products.php`.

```http
GET /api/workspaces/ws-1/products?q=cable&category[]=accessories&tags=sale&price_max=20&sort=-price&per_page=2

200 OK
{ "data": [ {…product…}, {…product…} ],
  "links": { "first": "…&page=1", "last": "…&page=4", "prev": null, "next": "…&page=2" },
  "meta":  { "current_page": 1, "from": 1, "to": 2, "last_page": 4, "per_page": 2, "total": 7, "path": "…", "links": […] } }
```

Cursor responses have `meta.per_page`, `meta.next_cursor`, `meta.prev_cursor` and `links.next`/`links.prev` (no `total`).

`GET /filters` → categories and tags with counts, `attribute_values.color`, price/stock ranges (`null` when
the workspace is empty), `sortable`, `attribute_filters`, `pagination` limits, `low_stock_threshold`.

## 5. Validation and error format

Every `/api/*` failure has the same top-level shape — **branch on `code`, show `message`**:

```json
{ "message": "The price field must be …", "code": "validation_failed", "errors": { "price": ["…"] } }
```

| Status | `code`                                                              | When                                                                     |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 400    | `malformed_json`                                                    | JSON content type but unparsable body.                                   |
| 404    | `not_found`                                                         | Unknown workspace/product, or a product of another workspace.            |
| 405    | `method_not_allowed`                                                | Wrong verb for a path.                                                   |
| 409    | `insufficient_stock`, `stock_limit_exceeded`, `version_conflict`, `bulk_atomic_failed`, `import_conflict` | Business or concurrency conflict (§7, §9). May add keys (`available`, `data`…). |
| 413    | `payload_too_large`, `too_many_rows`                                | Import file over the size or row limit (also PHP `post_max_size`).       |
| 415    | `unsupported_media_type`                                            | Import not multipart, wrong extension/MIME, or binary content.           |
| 422    | `validation_failed`, `import_failed`, `invalid_file`, `empty_import`, `upload_failed` | Field errors in `errors`; import errors in `data.errors`.     |
| 429    | `too_many_requests` (+ `Retry-After`)                               | Imports only (`config('products.import.rate_per_minute')`, default 30). |
| 500    | `server_error`                                                      | Unexpected error. Never contains traces, SQL or paths, even with `APP_DEBUG=true`. |

`null`, `false`, `0`, `[]` and `{}` are distinct, valid values where the field allows them (`stock: 0`,
`active: false`, `tags: []`, `attributes: {}`).

## 6. Statistics

`GET /stats[?threshold=N]` — workspace scope, computed in PostgreSQL with two aggregate queries (no rows loaded).

```json
{ "data": { "total": 60, "active": 30, "inactive": 30, "in_stock": 48, "out_of_stock": 12,
  "low_stock": 10, "low_stock_threshold": 5, "total_stock_units": 580,
  "inventory_value": "26574.80", "active_inventory_value": "12179.20",
  "price": { "min": "1.38", "max": "98.64", "average": "43.57" },
  "categories": [ { "category": "office", "products": 20, "stock_units": 175, "inventory_value": "7826.20" } ] } }
```

Definitions: **inventory value** = Σ(`price × stock`) over **all** products (exact `numeric`, rounded to 2 dp);
`active_inventory_value` limits it to active products. **Low stock** = `0 < stock <= threshold`; **out of stock** =
`stock = 0`. An empty workspace returns zeros (`"0.00"`, `[]`) and `null` prices.

## 7. Inventory operations and concurrency

| Operation                          | Mechanism                                                                                                                                  | Conflict behavior                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `POST …/stock/adjustments {delta}` | One conditional `UPDATE … WHERE stock + delta BETWEEN 0 AND max`. No read-modify-write in PHP.                                              | `409 insufficient_stock` (`available`, `requested_delta`) or `409 stock_limit_exceeded`. Never oversells, never loses an increment. |
| `PATCH …/stock`, `/price`, `/activation` | Row lock (`SELECT … FOR UPDATE`) then write; optional `If-Match`.                                                                     | `409 version_conflict` when `If-Match` is stale.                                    |
| `PUT` / `PATCH` / `DELETE`         | Row lock; optional `If-Match`.                                                                                                              | Without `If-Match`: **last write wins**.                                            |
| Activation                         | Setting the current state changes nothing (not even `updated_at`/`ETag`).                                                                   | —                                                                                  |
| Duplicate                          | Generates `<sku>-COPY`, `-COPY-2`… (or uses your `sku`); stock starts at `0` unless `copy_stock`; new id; same workspace.                   | Your own colliding `sku`/`slug` → `422`.                                            |

**Retry safety.** Adjustments (`delta`) are **not idempotent**: retrying after a timeout applies the delta again.
There is no idempotency-key store (it would require new tables). For safe retries use absolute writes (`PATCH …/stock`)
with `If-Match`. Absolute writes, activation, delete (second call `404`) and price are naturally retryable.

Verified with real concurrency (separate OS processes, separate PostgreSQL connections): 80 simultaneous `-1`
adjustments on 50 units → exactly 50 succeed, 30 `409`, final stock `0`; 60 simultaneous `+1` → `60`; six writers with
the same `If-Match` → exactly one `200`, five `409`; opposite-order bulk adjustments do not deadlock; six simultaneous
creates of one SKU → one `201`, five `422`.

## 8. Bulk operations

Common body fields: `transaction`: `"atomic"` (default) or `"partial"`. Limit: `config('products.bulk_max_items')` (100).
Ids must be unique strings (duplicate ids are `422`, not silently collapsed). Request-level problems (shape, limits,
invalid field values in an item) reject the **whole** request with `422` before anything runs.

- **atomic**: one transaction. If any item fails (unknown/out-of-workspace id, would-be-negative stock or price,
  duplicate SKU/slug) everything rolls back: `409 bulk_atomic_failed`, items that would have succeeded are reported
  `rolled_back`.
- **partial**: failed items are skipped; the rest commit. Always `200` with a per-item report.

Rows are loaded once and locked in id order (no per-item reads, no lock-order deadlocks); each item runs in its own
savepoint so one failure cannot poison the transaction.

```json
{ "data": { "transaction": "partial", "committed": true, "requested": 3, "succeeded": 2, "failed": 1, "rolled_back": 0,
  "results": [
    { "id": "product-002", "status": "ok", "product": { "…": "…" } },
    { "id": "ghost", "status": "error", "error": { "code": "not_found", "message": "No product with this id exists in the workspace." } },
    { "id": "product-004", "status": "ok", "deleted": true } ] } }
```

Price adjustments use exact decimal math: `set` (value ≥ 0), `add` (signed amount), `percent` (signed, rounded half-up to
2 dp). A result below `0` is a per-item `invalid_price` error.

## 9. Optimistic concurrency (`ETag` / `If-Match`)

There is no `version` column. The `ETag` is a hash of every stored column, so it changes with any change. To protect
an edit form, send the `ETag` you loaded as `If-Match` on `PUT`/`PATCH`/`DELETE`/`stock`/`price`/`activation`. A
mismatch is **`409 version_conflict`** (not `412`) and carries the current `ETag`. `If-Match: *` always matches; omitting
the header means last write wins. Delta adjustments and bulk operations are not `If-Match`-guarded (they are atomic
instead).

## 10. Imports

`POST /imports` — `multipart/form-data`, part **`file`** (`.csv` or `.json`) plus options:

| Option     | Values                                  | Default  | Meaning                                                                                       |
| ---------- | --------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `mode`     | `create`, `upsert`                      | `create` | `create`: an existing SKU is a row error. `upsert`: update the product with that SKU **in this workspace** (a SKU owned by another workspace is a row error). |
| `on_error` | `abort`, `skip`                         | `abort`  | `abort`: any invalid row → nothing is written (`422 import_failed`). `skip`: write valid rows, report the rest. |
| `dry_run`  | boolean                                 | `false`  | Validate and report counts, write nothing.                                                    |

Limits: `5120` KB, `5000` rows (`config/products.php`); over → `413`. Wrong media type → `415`. Imports are
synchronous and run in one transaction. Existing products are never deleted or replaced wholesale; `upsert` only
updates the columns present in the file.

**CSV**: UTF-8 (BOM tolerated), header required, columns `sku` (required) plus any of
`slug,name,category,price,stock,active,tags,attributes`; read-only columns `id,workspace_id,created_at,updated_at` are
ignored; other columns → `422 invalid_file`. `tags` is `a|b|c`; `attributes` is a JSON object string; `active` accepts
`true/false/yes/no/1/0`. An empty cell means "not provided" (default on create, unchanged on upsert). For new
products `name, category, price, stock` are required; `slug` defaults to the slugified SKU.

**JSON**: an array of product objects, or `{"products": [...]}`. Same fields; unknown fields are row errors.

```json
{ "data": { "dry_run": false, "mode": "create", "on_error": "skip", "total": 3, "created": 2, "updated": 0, "failed": 1,
  "errors": [ { "row": 3, "sku": "BAD-1", "code": "invalid_row", "errors": { "price": ["The price must be …"] } } ] } }
```

Row `code`s: `invalid_row`, `malformed_row`, `sku_exists`, `sku_taken`, `slug_taken`, `duplicate_in_file` (the first
occurrence wins). `row` is the CSV line number (header = 1) or the 1-based JSON array position.

## 11. Exports

`GET /exports?format=csv|json|ndjson` plus all list filters/sort. Streamed in chunks of
`config('products.export.chunk_size')` rows from one `REPEATABLE READ` snapshot (so concurrent writes cannot skip or
repeat rows); nothing is buffered whole; the loop stops if the client disconnects. Files are served as attachments:

| Format   | `Content-Type`              | Body                                                                          |
| -------- | --------------------------- | ----------------------------------------------------------------------------- |
| `csv`    | `text/csv; charset=UTF-8`   | Header + rows, `\r\n` line ends, no BOM. Columns as in `exports/preview`.      |
| `json`   | `application/json`          | `{"data":[…],"meta":{"count":N,"exported_at":"…"}}` (rows are the API shape). |
| `ndjson` | `application/x-ndjson`      | One product JSON object per line.                                             |

`Content-Disposition: attachment; filename=products-<workspace>-<timestamp>.<ext>`. **CSV formula injection:** text
cells that begin with `= + - @` are prefixed with `'` so spreadsheets treat them as text (JSON/NDJSON are exact).
Exports are **not** progress-reporting: no `Content-Length` and no fake progress.

`GET /exports/preview` → `{ count, formats, csv_columns, sample }` (`limit` 1–20, default 5).

## 12. Frontend contract notes

- Table: `GET /` with `page`/`per_page`/`sort` + filter-panel state; build the panel from `GET /filters`; dashboard from `GET /stats`.
- Search-as-you-type: each keystroke is a stateless GET, so aborting the previous request is always safe.
- Forms: show `errors.<field>` from `422`; map `409 version_conflict` to "reload"; map `409 insufficient_stock` using `available`.
- After mutations invalidate: the list, `filters`, `stats` and the product's own query; bulk results include updated products.
- Nested editor: `attributes` is replaced wholesale on `PATCH`/`PUT`; send the full object.
- Never send `workspace_id`/`id`; the workspace is in the URL.

## 13. Running and testing

```bash
cd examples/backends/laravel-backend
export PATH="/opt/homebrew/opt/php@8.4/bin:$PATH"
php artisan config:clear
php artisan migrate --env=testing && php artisan db:seed --env=testing   # once
php artisan test --env=testing                                           # all 100 tests
php artisan test --env=testing tests/Feature/Products                    # Product API only (85)
php artisan serve --host=127.0.0.1 --port=8000 --no-reload               # development
curl -s 'http://127.0.0.1:8000/api/workspaces/ws-1/products/stats'
```

Product tests run in rolled-back transactions on `apixa_laravel_test`, re-seeding the baseline inside the transaction.
`ProductConcurrencyTest` is the only class that commits (it needs other processes to see its rows): it uses ids prefixed
`conc-` and removes them in `setUp`/`tearDown`. `tests/Support/http_worker.php` is its worker process.

## 14. Known limitations

- No authentication/authorization; workspace scoping is not tenant security. CORS is not configured.
- `sku` and `slug` are globally unique (existing schema), so a SKU is "taken" even if used in another workspace.
- Stock adjustments are not idempotent under retry (§7). Absolute writes without `If-Match` are last-write-wins.
- Concurrency tests drive the HTTP kernel in separate PHP processes with separate database connections; they do not go
  through a TCP listener or `php artisan serve` workers.
- Imports are synchronous and bounded (5 MB / 5000 rows). Larger loads need a queue (`QUEUE_CONNECTION=database` +
  `php artisan queue:work`), which is not implemented.
- Exports use offset chunking inside one snapshot; a very large export holds one transaction open for its duration.
- Client disconnect is detected between rows (`connection_aborted()`); this was not exercised by an automated test.
- No response caching or conditional `GET` (`If-None-Match`) handling; `ETag` is validator-only for writes.
- Empty-`{}` detection relies on the raw JSON body; form-encoded requests cannot express `{}` vs `[]`.
- Timestamps carry second precision (Eloquent writes); ordering by `created_at` relies on the `id` tiebreaker.
