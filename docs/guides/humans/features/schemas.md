# Schemas and `ApiState` (ADR-006)

Implemented in the v3.0.0 release candidate; see [ADR-006](../../../decisions/006-operation-schema-and-simplified-api-state.md).
Final verification and release are still the owner's.

## `ApiState` is a map of entities

```ts
// before (removed)
interface ApiState {
  products: {
    entity: Product;
    operations: { setStock: { body: StockBody; response: Product } };
  };
}

// after
interface ApiState {
  products: Product;
}
```

The entity is compile-time metadata for built-in operations only. Runtime resources need no entry;
an entry for a resource that does not exist at runtime is still a type error. Old `{ entity, list,
query, operations }` wrappers are rejected with a migration message. `query` serialization options
(`queryArrayFormat`, `query: { nulls, ... }`, `querySerializer`) are unaffected; only the _type_ of a
list query moved to `schema.query`.

## `schema` on an operation

```ts
import { defineApi } from "apixa";
import { z } from "zod"; // or Valibot, ArkType, any Standard Schema V1 validator

const api = defineApi<ApiState>()({
  baseURL: "/api",
  resources: {
    products: {
      path: "/products",
      operations: {
        preset: "all",
        create: { schema: { body: CreateProduct, response: ProductSchema } },
        getAll: { schema: { query: ProductFilters } },
        setStock: {
          method: "PATCH",
          path: "/:id/stock",
          schema: { body: StockSchema, response: ProductSchema },
        },
      },
    },
  },
});
```

- Explicit object only: `{ body?, query?, response?, error?, entity? }`. A bare `schema: X` is rejected.
  `entity: false` is the only `entity` value. `error: false` turns off an inherited resource error schema.
- Types: body and query = schema **input**; response = schema **output**. Without a schema, custom
  payloads are `unknown`. An operation `schema.response` replaces that operation's result type.
- Runtime: `body` and `query` run before anything is sent or mocked, once per call. The parsed value is
  used from then on. `body` and `response` may be async; `query` must be synchronous (an async query
  validator is a `ConfigError`). A missing body or query is validated as `undefined`.
- `response` runs **after** `unwrap`, key transforms, pagination normalization, `response.parse`,
  `response.validate`, and `middleware.onResponse`, and **before** final built-in structural and
  pagination contract enforcement. It validates what the call returns; for a paginated `getAll` that
  is the whole page object. The resource entity schema is not also applied.
- `response.parse` (including `settings.response.parse`) and `schema.response` compose. Parse runs
  before `onResponse`. The schema then validates the post-middleware value, and its output is the
  result. A resource entity schema's output stays the builtin result type when that schema actually
  runs. `schema: { entity: false }` skips it, so the result type is the parsed value instead.

## Resource `schema`

```ts
products: {
  path: "/products",
  schema: { response: ProductSchema, error: LaravelErrorSchema },
}
```

`schema.response` is the entity validator and the inferred entity type. It applies to `getById`,
`create`, `update`, and `patch`; to `getBy` and `findFirst` (or `null`); and to each item of
`getAll`, `getMany`, and `createMany` (`data` items when paginated). It does not apply to `count`,
`exists`, `delete`, `deleteMany`, or custom operations. `schema: { entity: false }` on a builtin
skips it for that operation. Resource `body` and `query` are rejected; put those on the operation.

`schema.error` validates a non-success JSON body. The call still fails. A match becomes
`HttpError.data` (the parsed value). A mismatch is `SchemaValidationError` with `phase: "error"`,
the HTTP status, and the original body. `schema: { error: false }` disables an inherited error schema.
Protocol steps of an advanced transfer do not inherit the resource entity schema, error schema, or a
custom response order. The outer operation still does.

- Use `emptyResponse` (`import { emptyResponse } from "apixa"`) as `schema: { response: emptyResponse }`
  on operations that return no payload (`204`, `205`, empty body, or `null`/`undefined`) to type the
  operation as `Promise<void>` and reject non-empty bodies with `SchemaValidationError`.
- `{ kind, run }` operations cannot declare a schema. Body schemas need an operation that sends a body.
- Failures are `SchemaValidationError` (extends `ValidationError`, `code: "VALIDATION_ERROR"`):
  `phase` (`"body" | "query" | "response" | "error"`), `resource`, `operation`, `issues`. Not retried.
  `"error"` is a non-success HTTP body, not a successful result.
- Pagination controls (`page`, `pageSize`, ...) bypass `schema.query`; do not declare them in it.

## `apixa/validation` (Zod)

```ts
import { defineApi, z } from "apixa/validation";

create: {
  schema: {
    body: { name: z.string(), price: z.coerce.number(), dims: { w: z.number(), h: z.number() } },
    response: ProductSchema,
  },
},
```

A plain object of Zod schemas becomes `z.object(...)`, nested objects included. Use explicit Zod for
arrays, primitives, unions, nullable, files (`z.instanceof(File)`), blobs and streams. Install `zod`
(`^4`) yourself; it is an optional peer dependency used only by this entry.

## Mock handlers

A custom operation's `mock` handler runs after validation, so it receives the parsed body and query.
Its `body`, `query` and result are typed loosely (`unknown`); the response schema still validates the
returned value.
