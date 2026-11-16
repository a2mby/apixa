# 006 — Per-operation `schema` and a simplified `ApiState`

Status: **approved 2026-11-15** (15 owner decisions below, plus the 2026-11-15 `apixa/validation`
addendum). **Landed with the schema, pagination, and call-contract change.** `pnpm typecheck` and
`pnpm test` passed at ship time (1,935 Vitest tests, 21 AI tests). Full `pnpm verify`, manual-testing
integration, publish dry run, Node 22/24 CI, and stable publication remain the owner's.

## Context

Custom operation types (`body`, `response`, `query`) used to come only from the `defineApi<T>()`
type argument (`ResourceState.operations`), not from the runtime definition. Every custom operation
had to be mirrored in the type or its body was `unknown`, and a name declared in state but missing at
runtime was a type error. That was hard to remember and easy to desynchronize. Request bodies were
not validated at runtime (only file rules).

## Decisions

| #   | Decision                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ |
| 1   | `schema` uses the explicit object `{ body?, response?, query? }` only                                  |
| 2   | Standard Schema V1 only; no required runtime validation-library dependency                             |
| 3   | Validate values and use the parsed/transformed output                                                  |
| 4   | Async body and response validation; query validation must be synchronous                               |
| 5   | Flatten `ApiState` to `{ products: Product }`                                                          |
| 6   | Remove `ResourceState.list`; infer from `getAll.schema.response` or `response.parse`                   |
| 7   | Custom operation contracts come from runtime schemas; unschematized payloads remain `unknown`          |
| 8   | Support both built-in and custom operations                                                            |
| 9   | Support body, response and query schemas; path parameters stay separate                                |
| 10  | Validate caller query before pagination/default composition; preserve cache-key consistency            |
| 11  | Explicit response unwrap and normalization happen before response schema validation                    |
| 12  | Reject `schema.response` combined with an effective `response.parse`                                   |
| 13  | `SchemaValidationError` extends `ValidationError`, with phase and issues                               |
| 14  | Remove legacy `operations`, `query` and `list` from `ResourceState`; no silent precedence              |
| 15  | Complete the new architecture in v3.0.0 before stable, including this ADR, migration and focused tests |

Rejected: a method-dependent shorthand (`schema: X`), a parse-only adapter, a custom-only partial
implementation, a temporary legacy compatibility layer, a `schemaResolver`, resource-level schema
inheritance, Zod-only configuration in core.

## What was built

- `schema` on declarative operations (built-in and custom). Validated at `defineApi()`: shape, unknown
  keys, empty object, Standard Schema detection (via `~standard`, never `.parse()`), body schema on a
  bodyless operation, and the _effective_ `response.parse` conflict (root → resource → operation, with
  `parse: false` disabling an inherited parser). `{ kind, run }` operations reject `schema`.
- One validation module (`packages/core/src/schema/`). Everything else calls it.
- **Order, request:** caller query → `schema.query` (sync) → query defaults / pagination composition →
  collision checks → key transforms → serialization. Body: `schema.body` → request middleware →
  key transforms → file rules → serialization → transport or mock. Both run once per logical call,
  inside `runOperation` (so timeout, abort and error middleware apply), before any dispatch or mock
  mutation. A replay from error middleware reuses the parsed values. Missing body or query is
  validated as `undefined`; the schema decides.
- **Order, response:** transport/mock → decode → `response.unwrap` → key transforms → pagination
  normalization → builtin shaping (`fromHttp`, `slice`) → `response.validate` → **`schema.response`** →
  final built-in shape checks / pagination contract → response middleware. It validates the same value
  that is returned as `data`: for a paginated operation that is the whole normalized page, not the
  items. It runs for every response type (a stream is validated as the stream object and never read).
  An empty success (204/205) is validated as `undefined`; an allowed 404 (`getBy`, `findFirst`,
  `exists`) skips it.
- **Query and pagination:** SDK pagination controls (`page`, `pageSize`, `cursor`, `before`,
  `offset`) are not application filters. They bypass the query schema and are merged back, so a strict
  `z.object` cannot silently strip them. Builtins that add their own query values (`getBy`, `getMany`,
  `exists`) merge them after validation, so a schema only sees caller input.
- **Cache keys:** `prepareOperationQuery(resource, operation, query)` is the synchronous prepared
  query. `apixa/react` uses it when building query keys, and the prepared object is recognized so the
  call does not validate it again.
- **Errors:** `SchemaValidationError extends ValidationError` with `phase`, `location`, `resource`,
  `operation`, `issues`. The message lists paths and counts only. A throwing validator keeps the
  original exception in `cause`. An asynchronous query validator is a `ConfigError`, not a mismatch.
  Never retried, never cached as success; error middleware sees it.
- **Types:** `ApiState` is a map of resource name to entity. `ResourceState`, `OperationState`,
  `ListOf` metadata, `QueryOf` and the `entity` / `list` / `query` / `operations` wrapper are gone;
  a recognizable old wrapper (every key in that set, with `entity` or `operations`) is rejected with a
  migration message, while a domain type that merely has an `entity` property is accepted. Body and
  query types are the schema **input**, the response type is the schema **output**, applied after
  pagination wrapping. Order for custom responses: `schema.response` → `response.parse` return →
  entity / mock inference → `unknown`.
- **Advanced transfers** honor `schema.body` and `schema.response`; transfer steps never inherit the
  outer schema.

## Addendum — `apixa/validation` (Zod DX)

An optional subpath of the existing `apixa` package, not a new npm package. Implementation lives in the
private workspace `@apixa/validation` (core must not import Zod) and is compiled into `apixa`. Zod is an
optional peer dependency (`^4`); only `dist/validation.js` imports it (checked by
`pnpm check:architecture`).

- `import { defineApi, z } from "apixa/validation"`. Same options, inference and runtime as the core
  `defineApi`. A plain object of Zod schemas in `schema.body`, `schema.query` or `schema.response` is
  read as `z.object(...)`, nested objects included. Anything with `~standard` passes through unchanged,
  so arrays, primitives, unions, nullable, files, blobs, streams and advanced objects use explicit
  schemas (`z.array`, `z.instanceof(File)`, `z.instanceof(ReadableStream)`, ...), validated by their
  real data type without buffering a stream.
- Arrays or primitives written as shape values are a `ConfigError` naming the path. The caller's config
  is copied, never mutated. All timing rules above are unchanged.

## Known limitations

- Mock handlers of custom operations receive untyped `body` (`unknown`), `query`
  (`Record<string, unknown>`) and result (`unknown`); the schemas still validate their inputs and
  output at runtime. Typing them from schemas was tried and dropped: it made TypeScript run out of memory on large
  configurations.
- `SchemaValidationError.issues` carries the validator's own messages; some libraries echo input values
  in them. The error message does not.
- Under `apixa/validation`, shape values must be Zod schemas; a foreign Standard Schema is accepted as
  a whole `body` / `query` / `response`, not as a field of a shape.

## Breaking changes

`ResourceState`, `OperationState`, `ResourceTypeOnlyKey`, `OperationTypeOnlyKey` and `QueryOf` types
are removed; `ApiState` entries are entities. See the
[migration guide](../guides/humans/schemas.md).
