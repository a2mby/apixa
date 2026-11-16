# ADR-007 — Apixa v3 Unified API Contract, Response Semantics, Reliability, Security, and Developer Experience

**Status:** ACCEPTED — architecture and behavioral contract; implementation and release verification are separate work  
**Decision date:** 2026-11-15  
**Target:** Apixa v3.0.0, before the next stable API freeze  
**Scope:** `defineApi`, `defineApis`, resources, operations, schemas, transforms, pagination, per-call options, mock/live parity, built-in semantics, retries, middleware, security, TypeScript inference, documentation  
**Related:** ADR-006 — Runtime Schema Validation; existing pagination design and its finalized amendments; Apixa Secrets (deferred backlog)  
**Supersedes:** Earlier proposals contradicted by the final decisions recorded here. This ADR takes precedence for the topics it explicitly resolves.  
**Implementation status:** A **design specification**, not a claim that the current source code already implements every decision.

> **Decision philosophy:** Make the common workflow automatic and simple. Keep unusual behavior explicit and configurable. Do not add flags that duplicate an existing capability; do not weaken response contracts, safety, or security for convenience. Preserve framework independence. Default behavior must be understandable without reading the internal request pipeline.

---

## Contents

1. [How to use this ADR](#0-how-to-use-this-adr)
2. [Complete decision register — Decisions 1–32](#1-complete-decision-register)
3. [Public API foundation and inheritance](#2-public-api-foundation-and-inheritance)
4. [Standard Schema, inference, and validation](#3-standard-schema-inference-and-validation)
5. [Pagination](#4-pagination--preserve-the-finalized-three-scope-design)
6. [Built-in operations: `getMany`, `count`, signatures](#5-built-in-operation-contracts-and-invocation-signatures)
7. [Per-call options cleanup](#6-per-call-api-boundary--decisions-20-21-and-22)
8. [Reliability: retries, timeout, backoff](#7-reliability--decisions-13-and-14)
9. [Middleware and attempt lifecycles](#8-middleware-and-attempts--decisions-23-26-and-29)
10. [Redirect and destination security](#9-redirect-and-destination-security--decisions-06-and-21)
11. [Error taxonomy](#10-unified-error-taxonomy)
12. [Full API examples](#11-full-reference-api-examples)
13. [Conformance test matrix](#12-required-conformance-matrix-for-implementation-agents)
14. [Implementation plan and exclusions](#13-implementation-plan-and-boundaries)
15. [Migration notes](#14-migration-notes-and-examples-of-intentional-breaking-changes)
16. [Superseded choices and traceability](#15-traceability-and-superseded-intermediate-choices)
17. [Final architectural verdict](#16-final-architectural-verdict)
18. [Appendices: quick reference and provenance](#appendix-a--compact-developer-cheat-sheet)

---

## 0. How to use this ADR

This document is a durable, implementation-oriented record of **Decisions 1–32** from the November 15, 2026 Apixa architecture review, including the later revisions. It also records the directly relevant pre-existing ADR-006 and pagination decisions so an implementation agent can work without reconstructing the discussion.

- **MUST / MUST NOT:** normative requirements for the eventual v3 API or its implementation.
- **SHOULD:** preferred implementation behavior; deviation requires a documented technical reason.
- **MAY:** an optional capability, not a mandatory user configuration.
- **Decision finalized:** the design has been selected; it does **not** mean the change has landed in code.
- **Illustrative code:** target public API, unless expressly labeled _existing implementation_, _pseudocode_, or _non-normative sketch_.
- **No release authorization:** this ADR does not authorize publishing, tagging, changing npm dist-tags, or asserting completion of manual/end-to-end tests.

### 0.1 Critical distinction: final design versus current implementation

The uploaded `defineApi` audit described the implementation as already mature, but later inspection of source exposed divergences. For example, at the time of inspection, `count()` accepted finite numeric results in its built-in `fromHttp` handler rather than all of the flexible shapes agreed in Decision 16. Likewise, current `RequestOptions` still exposed properties scheduled for removal. Treat source inspection as a **baseline**, and this ADR as the **approved target**.

No completeness or production-readiness percentage can be inferred from an architecture review alone. Runtime, mock, browser, edge, type, and consumer verification remain separate release gates.

### 0.2 Goals

1. One predictable, stable contract per declared operation.
2. Excellent inference without requiring developers to manually duplicate schemas in types.
3. Clear separation of operation configuration from per-call execution inputs.
4. Consistent final output guarantees, even with middleware, retry, mocking, and response transforms.
5. Safe, explicit security restrictions across Node, browsers, and worker/edge runtimes.
6. Minimal normal usage, with advanced controls available **optionally**.
7. Strong mock/live semantic parity where such parity is technically possible.
8. Deterministic built-ins, especially `getMany`, `count`, pagination, and empty responses.
9. A clear implementation plan with regression criteria, without silently redefining unrelated Apixa subsystems.

### 0.3 Non-goals

- Rewriting the entire transport/transfer/file system.
- Replacing Standard Schema V1 with a mandatory Zod dependency.
- Creating configurable circuit breakers or token buckets in this phase.
- Implementing a complete secret manager in this ADR.
- Silently changing the meaning of all HTTP errors or all return types.
- Guaranteeing arbitrary backend behavior, server-side deduplication, or browser redirect visibility.
- Publishing v3 or modifying manual-test applications as part of this decision record.

---

## 1. Complete decision register

**Latest verdict wins** where an earlier answer was explicitly revised. Decision 11 was already resolved in ADR-006 and is included to preserve numbering; Decision 22 was finalized as a consolidated per-call cleanup rather than a standalone response-size-only rule.

| #      | Topic                                | Final verdict                        | Normative outcome                                                                                                                                                       |
| ------ | ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01** | Inherited transforms                 | Resource/operation customization     | Root defaults; more-specific per-direction custom transforms override inherited directions; no new `false` syntax required by this decision.                            |
| **02** | Path parameter inference             | Automatic                            | Infer required parameters from the **effective full operation path** on all operations, including `getMany`/`exists`.                                                   |
| **03** | Mock pagination normalization        | Centralized                          | One normalization mechanism for page/offset/cursor and custom mappings; live/mock semantics agree.                                                                      |
| **04** | Function operation config            | `ctx.request` only                   | Keep `{ kind, run }` minimal; configure individual requests inside `run`. No `config` wrapper.                                                                          |
| **05** | Legacy docs                          | Update                               | Remove obsolete `{ entity: User }` examples; document flattened resource-to-entity syntax.                                                                              |
| **06** | Redirects by runtime                 | Runtime-aware                        | Enforce allowlists only when destinations are inspectable; reject uninspectable redirects; never promise false browser guarantees.                                      |
| **07** | Response processing                  | Normalize then validate              | Unwrap, key transforms, custom parse, built-in normalization, final middleware, then schema validation and final result checks.                                         |
| **08** | Schema errors                        | Unified                              | `VALIDATION_ERROR` with `phase: 'body'                                                                                                                                  | 'query' | 'response'`and structured issues; reserve`INVALID_OP` for invalid operation definitions. |
| **09** | Non-JSON schemas                     | Supported                            | Validate JSON, text, Blob, ArrayBuffer, or the stream **object**; do not consume streams to validate chunks.                                                            |
| **10** | Pagination wire names                | Preserve explicit names              | Configured pagination parameter names are not changed by generic query key transforms.                                                                                  |
| **11** | Type inference vs runtime validation | Already resolved                     | Keep optional Standard Schema validation; TypeScript declarations alone do not validate remote data.                                                                    |
| **12** | Built-in write signatures            | Positional bodies                    | `create(body, options?)`, `update(id, body, options?)`, `patch(id, body, options?)`.                                                                                    |
| **13** | Retry safety                         | Safe by default                      | Idempotent-method eligibility, explicit opt-in for POST/PATCH, transient error filtering, stable idempotency keys.                                                      |
| **14** | Timeouts/backoff                     | Simple + advanced                    | Numeric shorthand; optional total/per-attempt budgets, exponential/linear backoff, jitter and `Retry-After`; no token bucket/circuit breaker now.                       |
| **15** | `getMany([])`                        | Valid no-op                          | Return `[]` without HTTP; `full: true` honestly marks a locally skipped call and invents no HTTP status.                                                                |
| **16** | `count()` response shapes            | Flexible, bounded                    | Normalize approved count shapes **after unwrap**; deterministic precedence; reject invalid/unsupported shapes with `ResponseShapeError`; schema still validates result. |
| **17** | Missing `getMany` IDs                | Strict                               | Reject and identify **exact missing IDs**; do not return partial success.                                                                                               |
| **18** | Duplicate request IDs                | Deduplicate                          | Send unique IDs, preserve first occurrence order.                                                                                                                       |
| **19** | `getMany` ordering / sort            | Requested order; optional local sort | Default requested-ID order; optional `sortBy`; numeric comparisons only with explicit `type: 'number'`.                                                                 |
| **20** | Per-call response type               | Remove                               | `responseType` is fixed by operation configuration, not overridable on a declared operation call.                                                                       |
| **21** | Per-call redirect origins            | Remove                               | Redirect policy belongs to operation configuration; add separate **Apixa Secrets** backlog.                                                                             |
| **22** | Per-call options review              | Consolidated cleanup                 | Keep true execution inputs; restrict per-call response-size ceilings; remove contract/security redefinition knobs.                                                      |
| **23** | Middleware & response schema         | Final validation                     | Run schema validation after final `onResponse`; middleware must not bypass the schema.                                                                                  |
| **24** | Unexpected `getMany` records         | Reject                               | Identify unexpected returned IDs and throw `ResponseShapeError`.                                                                                                        |
| **25** | ID representation normalization      | Safe                                 | Match canonical numeric string IDs to equivalent safe numeric IDs, but not leading-zero aliases such as `'001'` to `1`.                                                 |
| **26** | Middleware retry lifecycle           | Two levels                           | Logical request hooks once; `onAttempt` and `onAttemptResponse` per transport attempt; bounded retry/refresh; final result unaffected.                                  |
| **27** | Duplicate backend IDs                | Reject                               | Identify duplicate returned IDs and throw `ResponseShapeError`.                                                                                                         |
| **28** | Missing numeric sort field           | Reject                               | Explicit numeric sort requires a valid numeric value for every entity.                                                                                                  |
| **29** | Middleware mutations                 | Revalidate                           | Permit compatible mutations but re-enforce effective request schema, operation contract, origin/security, and idempotency rules before transport.                       |
| **30** | Empty HTTP responses                 | Explicit `emptyResponse`             | Unexpected 204/205 fails nonempty contracts; an `emptyResponse` schema marker models intentional void results.                                                          |
| **31** | Malformed declared JSON              | `ParseError`                         | Never silently turn invalid JSON/HTML into a different response shape.                                                                                                  |
| **32** | Custom operation output shapes       | Schema/contract driven               | Accept primitives, objects, arrays, binary, streams or void according to operation/schema; do not force entity-object shape on custom operations.                       |

---

## 2. Public API foundation and inheritance

### 2.1 `defineApi` — two supported declaration styles

**Explicit flattened entity map:**

```ts
interface Product {
  id: number;
  name: string;
  price: number;
}

type AppApi = {
  products: Product;
};

const api = defineApi<AppApi>()({
  baseURL: "/api",
  resources: {
    products: { path: "/products" },
  },
});
```

`AppApi` maps each resource key directly to its entity type. Old wrappers such as `{ products: { entity: Product } }` are obsolete and MUST not appear in current examples. `defineApi<AppApi>()` is type metadata, **not runtime validation** by itself.

**Inferred direct form:**

```ts
const api = defineApi({
  baseURL: "/api",
  resources: {
    products: {
      mock: [
        { id: 1, name: "Notebook", price: 12 },
        { id: 2, name: "Pen", price: 2 },
      ],
    },
  },
});
```

Entity typing MAY be inferred from typed mocks, datasets, mock producers, and declared schemas; inference MUST NOT be presented as evidence that a live server will return that type.

**Multi-client registry:** `defineApis({ core: api1, billing: api2 })` remains the straightforward way to group independent clients. No framework adapter is required by core.

### 2.2 Layer precedence

For settings that support inheritance, the logical order is:

```text
Root defaults → Resource overrides → Operation overrides → Allowed per-call execution overrides
```

A deeper layer may only override properties appropriate to its scope; not every property is allowed at every level. Merge semantics are property-specific and must be documented rather than guessed:

| Setting                        | Semantics                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headers                        | Case-insensitive additive merge; deeper `null`/`undefined` deletion is preserved; dynamic providers resolve per logical call unless a documented attempt hook refreshes them.             |
| Timeout                        | Most-specific configured timeout wins; numeric shorthand is a total deadline; advanced timeout object is optional.                                                                        |
| Retry                          | Most-specific policy wins; `false` disables inherited retries; safe-method rules still apply.                                                                                             |
| Middleware                     | Ordered composition root → resource → operation; attempt hooks are separate from logical-request hooks.                                                                                   |
| Transforms                     | Resolve request/response directions independently; resource/operation transformer for a direction overrides the inherited transformer for that direction; unspecified direction inherits. |
| Response options               | Explicit unwrap/parse/validation rules inherit subject to their documented override/disable behavior.                                                                                     |
| `responseType`                 | Declared **on an operation**; never a per-call override on the generated method.                                                                                                          |
| Redirect destination allowlist | Defined in trusted operation policy; not replaceable from generated-method call options.                                                                                                  |
| Pagination                     | `paginationConfig` defines reusable resource config; operation `pagination` opts in/out/replaces; call `pagination` supplies page/cursor/offset input only.                               |

### 2.3 Decision 01: resource/operation custom transformers

```ts
const api = defineApi({
  baseURL: "/api",
  transforms: {
    request: { keys: "snake_case" },
    response: { keys: "camelCase" },
  },
  resources: {
    users: {}, // inherits both
    legacy: {
      transforms: {
        request: { keys: "camelCase" },
        response: { keys: "snake_case" },
      },
    },
  },
});
```

No new `transforms: false` or per-direction `false` syntax was required by the **final** Decision 01. The chosen approach is to configure a resource-/operation-specific custom transformer in the desired direction; if an identity/no-op transform is needed, it MAY use the existing supported custom-key function. Do not silently implement an additional public disable flag in the name of this decision.

**Invariant:** Type-level transformation inference and runtime transformations MUST agree for supported static transform types. Identity functions and arbitrary user functions may not be statically introspectable; do not promise TypeScript can infer their runtime behavior exactly.

### 2.4 Decision 02: effective full-path parameters

Path placeholders are collected from the actual resource + operation route, including overrides of built-ins:

```ts
resources: {
  users: {
    path: '/workspaces/:workspaceId/users',
    operations: {
      getMany: { path: '/by-organization/:orgId' },
    },
  },
}

await api.users.getMany(['1', '2'], {
  params: { workspaceId: 'w1', orgId: 'org7' },
});
```

- Required placeholders MUST be reflected in TypeScript signatures.
- Runtime MUST reject missing or invalid path placeholders before dispatch.
- Typing MUST use the effective full path, not resource path only.
- This applies to `exists`, `getMany`, built-ins, custom declarative operations, and applicable slices.
- Earlier audits suggested `getMany` might lose `params` at runtime, but pipeline fallback to `options.params` may already cover it; implementers MUST verify before changing runtime wiring.

### 2.5 Decision 04: function operations stay minimal

```ts
operations: {
  sync: {
    kind: 'write',
    run: async (ctx) => {
      const user = await ctx.request({
        method: 'GET',
        path: '/:id',
        params: { id: 'u1' },
        timeout: 5_000,
        retry: 2,
      });
      return ctx.request({
        method: 'POST',
        path: '/:id/sync',
        params: { id: 'u1' },
        body: user,
        timeout: 10_000,
        retry: false,
      });
    },
  },
}
```

The function declaration MUST NOT gain an extra `config` bag solely to pass default request settings into every `ctx.request()`. Each internal `ctx.request()` can use applicable request controls and inherit root/resource defaults. A function operation's logical workflow is not synonymous with an individual HTTP attempt.

**Important scope distinction:** a `responseType` set in `ctx.request({ ... })` defines a **new ad hoc subrequest** and is not the forbidden overriding of a previously declared operation's response type. Transfer protocol steps that construct their own HTTP requests likewise retain a way to select their own decoding contract.

### 2.6 Decision 05: documentation consistency

- Update guides, README, context, API examples and type-consumer fixtures to flattened `AppApi` entities.
- Replace obsolete supported-looking examples rather than perpetually documenting rejected syntax.
- `defineApis` examples must distinguish prebuilt clients from raw configuration entries when showing supported forms.
- Every breaking signature change in this ADR must be reflected in reference documentation and type examples.

---

## 3. Standard Schema, inference, and validation

### 3.1 ADR-006 remains the foundation

Per-operation schema contract:

```ts
operations: {
  create: {
    schema: {
      body: z.object({ name: z.string().min(1) }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  search: {
    method: 'GET',
    path: '/search',
    schema: {
      query: z.object({ page: z.number().int().positive().optional() }),
      response: z.array(z.object({ id: z.number(), name: z.string() })),
    },
  },
}
```

Normative prior ADR-006 decisions preserved here:

1. The schema object uses **explicit** `body`, `response`, `query` keys. Do not infer roles based on operation kind or a positional schema value.
2. Use **Standard Schema V1**, not a mandatory Zod runtime dependency. Zod, Valibot and compatible schemas may implement the contract.
3. Use the schema's **parsed/transformed result**, not merely a validation pass/fail boolean.
4. Body and response schema validation MAY be asynchronous; query validation MUST be synchronous to keep query/caching/key helpers deterministic.
5. Schema input/output types drive TypeScript inference, including write body inputs versus serialized/validated outputs.
6. Flatten resource entity metadata (`{ products: Product }`); do not reintroduce old `ResourceState` wrappers (`entity/list/query/operations`) as the standard new API.
7. Validate query input before composing pagination/default query parameters and before serializing for HTTP, with deterministic collision rules.
8. Schema validation must preserve pagination metadata and not break mock/live behavior.
9. Use schemas for runtime checks when desired; schemas are optional, and type declarations alone do not validate remote data.

**Optional validation ergonomics (prior extension):** A separate `apixa/validation` subpath MAY provide optional Zod-oriented helpers. Plain nested object shorthand under that optional helper may become a `z.object` recursively; explicit schema objects remain necessary for arrays, primitives, unions, nullable values, binary, streams, or advanced constraints. This helper must not turn Zod into a required dependency of core and must not change the public meaning of `schema: { body, response, query }`.

**ADR-006 reconciliation note:** A prior ADR-006 summary said `schema.response` and `response.parse` should be mutually exclusive. The later Decisions 07/23 explicitly define a pipeline containing custom parsing **before** final schema validation. The target v3 pipeline in this ADR therefore treats parse-then-schema as a valid composition. This is a deliberate **supersession of that earlier incompatibility rule**; implementers must update validation/config guards and documentation accordingly, or flag a genuine constraint that makes the combination unsafe. It is _not_ permission to skip schema validation.

### 3.2 Decisions 07 and 23: authoritative response lifecycle

The response pipeline MUST process the final logical response in this order, with each conditional stage omitted when not applicable:

```text
HTTP/transport result OR mock logical result
    ↓
Decode according to the operation's fixed responseType
    ↓
Explicit response.unwrap (if configured)
    ↓
Response key transforms (where applicable)
    ↓
Custom response.parse (if configured)
    ↓
Built-in operation normalization (e.g. count, pagination/list shaping)
    ↓
Final logical onResponse middleware (once)
    ↓
Standard Schema response validation (ONCE, on the final application-facing payload)
    ↓
Final built-in invariants (collection shape, ID membership, count, pagination envelope)
    ↓
getMany requested-order / optional local sorting
    ↓
Typed result or full response envelope
```

**Final schema validation is after `onResponse` middleware.** Middleware must not replace validated data with an invalid object and then escape validation. The schema's parsed/coerced output becomes the returned value. Built-in invariants MUST still be enforced after any transformation, even when a schema returns a technically valid object of the wrong built-in semantic shape.

A final `onResponse` may inspect normalized, decoded data; it should not be invoked on every intermediate retry response. Retry-attempt response inspection uses `onAttemptResponse` instead.

**Pagination caveat:** pagination parsing must retain both data and navigation metadata. The list items can be key-transformed, but metadata must not be lost by a generic `response.unwrap: 'data'` rule. Normalize the declared pagination envelope first or use an equivalent coordinated stage that preserves the final contract; do not silently unwrap away `meta`, `links`, next cursors, or totals.

### 3.3 Decision 08: consistent validation error contract

```ts
type SchemaPhase = 'body' | 'query' | 'response';

// Conceptual public error data (actual class integrates with Apixa errors):
{
  code: 'VALIDATION_ERROR',
  phase: 'body',
  issues: [
    { path: ['name'], message: 'Expected a non-empty string' },
  ],
  cause: originalValidatorError,
}
```

- Body/query invalidity is detected before transport.
- Response schema invalidity is detected on the final logical output.
- Preserve Standard Schema issue detail without assuming Zod-specific fields or objects.
- A single `ValidationError`-style contract may expose a dedicated class, but **the canonical code is `VALIDATION_ERROR`** with a phase.
- `INVALID_OP` is reserved for operation definitions/configuration, not bad caller inputs.
- A malformed declared wire format is `ParseError`; an invalid built-in response structure is `ResponseShapeError`; a schema rejection is `VALIDATION_ERROR`. These are distinct.
- Record original cause safely without leaking secrets in error messages or logs.

### 3.4 Decision 09: schema compatibility with non-JSON data

| `responseType` | Schema input                                                        | Must not do                                                         |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `json`         | Parsed JSON data                                                    | Treat malformed JSON as a successful text response.                 |
| `text`         | String                                                              | Apply object-key conversion to text.                                |
| `blob`         | `Blob` object                                                       | Force JSON parsing or read bytes unnecessarily.                     |
| `arrayBuffer`  | `ArrayBuffer` object                                                | Assume object-field transforms apply.                               |
| `stream`       | `ReadableStream` object (or documented empty-stream representation) | Consume, tee, buffer, or exhaust stream chunks just to validate it. |

The optional schema validates the actual decoded value. The returned type reflects schema output where provided; otherwise the operation response type and established inference rules apply. No schema requirement for every operation.

### 3.5 Decision 11: already resolved

This decision is recorded, but not reopened. The design already combines TypeScript type inference with optional runtime Standard Schema validation. Do not turn an explicit TypeScript entity map into a fake runtime validator, and do not require response schemas globally.

### 3.6 Decision 30: explicit empty response marker

```ts
import { emptyResponse } from 'apixa';

operations: {
  update: {
    method: 'PUT',
    path: '/:id',
    schema: { response: emptyResponse },
  },
}

await api.users.update('u1', { name: 'Ada' }); // Promise<void>
```

`emptyResponse` is a special, intentional declaration of **no response body**, not an arbitrary fake value. A built-in `delete()` may keep its `void` result as already established. If a nonempty-result operation receives `204` or `205`, it MUST reject rather than silently return `null` typed as `User`. The empty marker MUST infer `void`, apply to genuine empty bodies, and integrate with schema/response typing. Empty-body acceptance is not a blanket license to accept all non-2xx results.

### 3.7 Decision 31: malformed wire content

When an operation declares JSON, malformed JSON, an incompatible response, or HTML served in place of JSON MUST cause `ParseError` (or the existing precisely equivalent parse error contract), not silent string fallback. If a backend legitimately returns text, configure `responseType: 'text'` on the operation.

### 3.8 Decision 32: custom outputs are unrestricted by built-in entity assumptions

A declarative custom operation may have a primitive, array, object, binary, stream, or empty result according to its contract. It MUST NOT be subjected to `getById`'s entity-shape rule or `getAll`'s array rule merely because it is under the same resource. Explicit schemas remain authoritative. Function operations return their declared/computed types and validate each `ctx.request()` according to the applicable subrequest contract.

---

## 4. Pagination — preserve the finalized three-scope design

The November 15 pagination decisions are part of the v3 contract. Do not recreate an inheritance system in which resource-level `pagination` and `paginationConfig` compete for meaning.

### 4.1 Resource, operation, and call scopes

**Resource scope: reusable configuration; auto-activates `getAll` only.**

```ts
resources: {
  products: {
    paginationConfig: 'laravel',
  },
}
```

**Operation scope: explicitly enable, disable, or replace.**

```ts
resources: {
  products: {
    paginationConfig: 'laravel',
    operations: {
      getAll: { pagination: false },
      search: { method: 'GET', path: '/search', pagination: true },
      listByCursor: {
        method: 'GET',
        path: '/cursor-list',
        pagination: { strategy: 'cursor', /* additional mapping */ },
      },
    },
  },
}
```

**Call scope: only the requested page/cursor/offset values.**

```ts
const page = await api.products.search({
  pagination: { page: 2, pageSize: 20 },
});
```

`pagination: true` resolves to the resource's reusable pagination configuration when present and otherwise to the documented page default. `false` disables that operation's pagination. A named preset or configuration object **replaces** operation pagination behavior rather than deeply merging incompatible strategies. Resource `paginationConfig` MUST NOT silently enable pagination for `getMany` or arbitrary custom operations; they opt in explicitly.

**Legacy cleanup:** Remove resource-level `pagination` as an alias for `paginationConfig` in v3. If both were previously accepted, v3 must offer only one canonical resource property. Do not continue treating conflicts as a normal configuration scenario.

### 4.2 Supported pagination methods and backend presets

- **Page:** page/page-size semantics and total pages when provided/derivable.
- **Offset:** offset/limit semantics and truthful previous/next availability.
- **Cursor:** cursor/before/page-size semantics without pretending a total count exists when the server does not provide one.
- **Backend presets:** `laravel`, `laravel-paginator`, `strapi`, `payload`, `nestjs`.
- **Custom mapping:** explicit incoming response field paths and outgoing query parameter names.
- **Extension hooks:** `buildRequest` for unusual wire placement and `parseList` for nonstandard envelopes, without hiding required validation.
- **Navigation:** `nextPageInput(...)` and `previousPageInput(...)` compute valid navigation inputs, returning `null` when a boundary or absence of information makes continuation impossible.

Page/cursor envelopes MUST validate required structural invariants, boundaries, and metadata semantics for both live and mock mode. Never invent totals, navigation cursors, previous/next flags, or HTTP metadata.

### 4.3 Decisions 03 and 10: normalization and configured wire names

The same authoritative pagination normalization layer MUST understand:

```text
page, pageSize, offset, limit, cursor, before,
custom backend parameter names,
custom builder output,
configured request key transforms,
mock pagination interpretation.
```

**Explicit mapping wins:**

```ts
paginationConfig: {
  strategy: 'page',
  params: { pageSize: 'perPage' },
}
```

The backend sees `perPage`, not `per_page`, even if ordinary application query keys are transformed to `snake_case`. This is intentional: explicit pagination wire names are a protocol mapping, not application object keys.

The previous mock-only bug that missed transformed `Offset` and `Before` MUST be fixed at the shared normalization boundary, not with an increasingly fragile, scattered list of special cases. Live/mock equivalence must include every supported strategy, including offset and backward cursor navigation.

### 4.4 Query schemas and pagination composition

- Synchronous query schema validation runs on caller-supplied query before transport.
- Use the parsed/transformed schema output for subsequent serialization and stable query/cache helpers.
- Pagination input is separately validated and merged into the eventual wire request with deterministic precedence.
- Explicit pagination names MUST not be independently re-keyed by ordinary key transforms.
- Query-paginated key collisions MUST be rejected or resolved by an existing documented rule, not silently overwritten in one mode but not the other.
- Pagination built through headers or POST bodies must observe the operation's method/body declaration and response contract.

### 4.5 Pagination and list slicing are different features

`slice` is a client-facing list operation constraint; pagination is a backend navigation protocol. Keep their semantics separate and preserve existing conflict prevention. Neither may silently alter the other's inferred return shape. Mock/live shape validation must run after response middleware and schema transformations when necessary to preserve the final contract.

---

## 5. Built-in operation contracts and invocation signatures

### 5.1 Operation inventory

Preserve the built-in operation set rather than proliferating new public methods:

| Built-in     | Default method/path      | Intended result                          | Key constraints                                                                         |
| ------------ | ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `getAll`     | `GET /resource`          | `T[]` or configured `PaginatedResult<T>` | Collections and pagination shape validated.                                             |
| `getById`    | `GET /resource/:id`      | `T`                                      | Required ID; valid nonempty entity unless explicitly declared otherwise.                |
| `create`     | `POST /resource`         | `T` or explicitly declared alternative   | Positional body, schema-driven.                                                         |
| `update`     | `PUT /resource/:id`      | `T` or explicit `void`                   | Positional ID and body.                                                                 |
| `delete`     | `DELETE /resource/:id`   | `void`                                   | Preserve intentionally empty delete semantics.                                          |
| `patch`      | `PATCH /resource/:id`    | `T` or explicit alternative              | Positional ID and body.                                                                 |
| `count`      | `GET /resource/count`    | `number`                                 | Standardized count extraction and strict final numeric checks.                          |
| `createMany` | `POST /resource/bulk`    | `T[]` or declared alternative            | Positional body array; validate array input.                                            |
| `deleteMany` | `DELETE /resource/bulk`  | `void`                                   | Preserve existing bulk-IDs convention and dedicated body handling.                      |
| `getMany`    | `GET /resource`          | `T[]`                                    | Deduplicate, compare identity, strict membership, requested order, optional local sort. |
| `exists`     | `GET /resource/:id`      | `boolean`                                | 404 becomes false where defined; non-404 errors remain errors.                          |
| `findFirst`  | `GET /resource`          | `T                                       | null`                                                                                   | Existing first-record semantics; validate collection shape. |
| `getBy`      | `GET /resource` by field | `T                                       | null`                                                                                   | Field/value lookup; 404/empty semantics as documented.      |

Built-ins are **conventions**, not promises that every backend implements their endpoints. The operation map remains the mechanism for overriding paths, methods where appropriate, response mapping, mock behavior and schemas.

### 5.2 Decision 12: positional write bodies

**Target v3 generated-method syntax:**

```ts
await api.users.create({ name: "Ada" });
await api.users.update("u1", { name: "Ada Lovelace" });
await api.users.patch("u1", { role: "admin" });
```

With allowed call options:

```ts
await api.users.update(
  "u1",
  { name: "Ada" },
  {
    signal: controller.signal,
    timeout: 7_000,
    headers: { "X-Request-ID": requestId },
  },
);
```

For identity-based `update`/`patch`, the old `(id, { body, ...options })` form is removed. Do not retain ambiguous compatibility overloads, particularly because an actual entity may itself have a property called `body`. Custom declarative operation signatures should remain coherent with their `:params` and `hasBody` declarations; avoid inferring an arbitrary positional ID parameter for every custom path. `getMany`, `getBy`, and other special built-ins retain their own explicit argument semantics.

### 5.3 `getMany` — combined Decisions 15, 17, 18, 19, 24, 25, 27, 28

`getMany()` is a **strict keyed batch lookup**, not a loosely filtered `getAll()`. The complete semantics are defined together here to avoid implementation drift.

#### 5.3.1 Input preparation

1. Accept an array of requested IDs in supported ID types (typically `string | number` as declared by the operation).
2. Reject invalid individual IDs using the existing parameter validation contract.
3. **Allow an empty array** and immediately resolve it to `[]` with no HTTP call.
4. Remove duplicate requested IDs **before dispatch** while preserving the first occurrence order.
5. For a nonempty request, build the operation's configured wire request and execute it normally.

```ts
await api.products.getMany(["3", "1", "3", "2"]);
// Effective requested ID sequence: ['3', '1', '2']
```

#### 5.3.2 Empty-input fast path (Decision 15)

```ts
await api.products.getMany([]); // [] — no HTTP call
```

This is a normal application state, not a validation error. Do not create a synthetic HTTP status, execute an unnecessary network round trip, or force every consumer to check `ids.length` first.

For `full: true`, the result MUST **explicitly distinguish a local skip** from an actual HTTP/mock response, and MUST NOT fabricate `200`, `204`, headers, or a raw `Response` that never existed. The exact discriminant/property names may be finalized in implementation, but they must be statically safe and unmistakable:

```ts
// Illustrative discriminated union — property names are not yet an independent ADR:
type FullBatchResult<T> =
  | (ApiResponse<T[]> & { skipped: false })
  | {
      data: T[];
      skipped: true;
      reason: "empty-ids";
      status: null; // explicitly NOT an HTTP status
      headers: null; // no HTTP headers were received
      raw?: undefined;
    };
```

If implementation uses a different discriminant, it must preserve the same truthful behavior and TypeScript narrowing. The quick return may bypass request middleware and transfer observers; document this explicitly.

#### 5.3.3 Response identity extraction and matching

After final response normalization, middleware, and schema validation:

1. Require a collection (`T[]`) rather than silently accepting arbitrary envelopes.
2. Read identity from each returned record using the configured resource `idKey` (default `id`).
3. If the identity is absent/invalid, throw `ResponseShapeError`, not a speculative missing-ID error.
4. Normalize identity **for comparison only** using safe, canonical rules.
5. Reject duplicate backend IDs.
6. Reject any backend entity not among the unique requested IDs.
7. Reject any requested ID for which no entity was returned, with an error that explicitly lists missing IDs.
8. Return the complete set in requested-ID order unless an optional local `sortBy` is supplied.

The comparison must occur in a **single normalized identity domain** so deduplication, unexpected-ID detection and missing-ID detection agree. It should be O(n + m) using a map/set approach, not nested scans across large batches.

#### 5.3.4 Safe ID normalization (Decision 25)

- `1` and the canonical string `'1'` MAY compare equal.
- `'001'` MUST remain different from numeric `1` (it might be a code).
- Do not trim arbitrary ID strings or coerce `'1e0'`, `'+1'`, `'1.0'`, empty strings or unsafe integers into the same ID.
- Preserve the original ID value and type in returned objects.
- Reject collisions where distinct input identities normalize to the same canonical key **after** the agreed deduplication step, or intentionally deduplicate them under the same documented canonical comparison model; never let input and response matching disagree.
- If `idKey` is transformed by a declared key transform/schema, read identity from the final application-visible property name or an explicitly established equivalent mapping.

**Recommended implementation:** canonical numeric IDs are finite safe integers and their canonical decimal string representations. Preserve noncanonical strings as exact strings. Use a tagged internal key type so a noncanonical string cannot accidentally collide with a number.

#### 5.3.5 Strict missing/extra/duplicate errors (Decisions 17, 24, 27)

Examples:

```ts
await api.products.getMany(["1", "2", "999"]);
// Backend returns IDs '1', '2':
// ResponseShapeError { missingIds: ['999'] }

await api.products.getMany(["1", "2"]);
// Backend returns IDs '1', '2', '3':
// ResponseShapeError { extraIds: ['3'] }

await api.products.getMany(["1", "2"]);
// Backend returns ID '1' twice:
// ResponseShapeError { duplicateIds: ['1'] }
```

These examples show **intended structured diagnostic fields**. If the current error class has different field conventions, the implementation must provide equally explicit, structured information without falsely implying the backend supplied those exact error payloads.

Only one of the checks above need be reported per error, but if the implementation can safely collect all discrepancies, a single structured `ResponseShapeError` MAY report `missingIds`, `extraIds`, and `duplicateIds` together. Do not expose a partial successful array after membership validation fails.

#### 5.3.6 Default ordering and optional local sort (Decision 19)

Default:

```ts
await api.products.getMany(["3", "1", "2"]);
// Return entities in that same order, regardless of backend array order.
```

Simple explicit sort:

```ts
await api.products.getMany(ids, { sortBy: "name" });
```

Advanced explicit numeric sort:

```ts
await api.products.getMany(ids, {
  sortBy: { field: "price", order: "desc", type: "number" },
});
```

Rules:

- `sortBy` is a **`getMany`-specific optional local output option**, not a generic HTTP query parameter or a wholesale change to every generated method's `RequestOptions`.
- Sorting happens only after all records pass strict membership and response validation.
- Sorting MUST be stable; when equal, retain original requested-ID order.
- The simple string form uses ordinary defined string-field comparison semantics. Do not silently convert numeric-looking IDs/codes into numbers.
- Numeric comparison is enabled **only** through `{ type: 'number' }`. It may convert canonical numeric strings into finite numeric comparison values **without changing stored entity values**.
- Missing, `null`, nonnumeric, nonfinite, unsafe or otherwise invalid explicit numeric sort values MUST raise `ResponseShapeError` (Decision 28). Avoid `NaN` comparator behavior, silent zero-filling, or omission of entities.
- A field should be restricted to inferable keys where TypeScript can express the path safely; if nested field paths are supported, specify and test exactly how they are typed/read. Do not make arbitrary coercive `sortBy` keys silently succeed.
- Sorting never masks missing/extra/duplicate entities.

**API surface note:** the decision authorizes `sortBy` for `getMany` calls. Do not generalize it into a transport-wide `RequestOptions.sortBy` setting unless a separate clear use case and public contract are approved.

### 5.4 `count()` — Decision 16, including the expanded shapes

`count()` is a narrow convenience that returns one **nonnegative safe integer**; it is not an arbitrary recursive numeric-property search.

**Accepted direct shapes after explicit response unwrapping, response key transforms and optional parse:**

```ts
125;
("125");
{
  count: 125;
}
{
  total: 125;
}
{
  data: 125;
}
{
  records: 125;
}
{
  quantity: 125;
}
{
  numberOfUsers: 125;
}
{
  statistics: {
    count: 125;
  }
}
// These named fields may also contain a valid canonical numeric string:
{
  count: "125";
}
```

**Deterministic key precedence:**

```text
Direct valid primitive
  else own property: count
  else own property: total
  else own property: data
  else own property: records
  else own property: quantity
  else own property: numberOfUsers
  else exact named nested path: statistics.count
  else ResponseShapeError
```

Read **own properties**, not inherited/prototype fields. If the highest-priority selected field exists but is invalid, FAIL rather than silently falling through to a different field whose meaning might be unrelated. Never search arbitrary nested objects, arrays, or property names like `activeUsers` unless expressly configured by `unwrap`/`parse`.

**Numeric rules:**

- Accept a finite nonnegative safe integer as-is.
- Accept a numeric string only when it is an unambiguous decimal integer representation (optional surrounding whitespace MAY be trimmed as part of normalization; no exponent, decimal fraction, hexadecimal, signs other than those expressly documented).
- Reject `NaN`, `Infinity`, negative numbers, fractions, empty strings, null, booleans, malformed strings and integers beyond `Number.MAX_SAFE_INTEGER`.
- Do not mutate the raw response for debugging or `full` metadata.
- If no supported shape matches, throw **`ResponseShapeError`**.
- An explicit response schema validates the **normalized numeric result** and may further constrain it; schema failures are `VALIDATION_ERROR` (response phase). Do not let generic count coercion bypass an explicit schema.

**Unwrap is authoritative and happens first:**

```ts
// Backend:
{ success: true, data: { total: '125' } }

// Config:
response: { unwrap: 'data' }

// count() output:
125
```

An explicit `unwrap: 'data'` whose path is absent MUST fail as an unwrap/response-shape problem; the library must not silently ignore the user's configured extraction rule and search elsewhere. The exact nested `statistics.count` shortcut is allowed without a separate unwrap because that shape was explicitly approved.

**Illustrative normalization pseudocode:**

```ts
function normalizeCount(payload: unknown): number {
  let candidate = payload;
  if (isPlainRecord(payload)) {
    if (hasOwn(payload, "count")) candidate = payload.count;
    else if (hasOwn(payload, "total")) candidate = payload.total;
    else if (hasOwn(payload, "data")) candidate = payload.data;
    else if (hasOwn(payload, "records")) candidate = payload.records;
    else if (hasOwn(payload, "quantity")) candidate = payload.quantity;
    else if (hasOwn(payload, "numberOfUsers")) candidate = payload.numberOfUsers;
    else if (isPlainRecord(payload.statistics) && hasOwn(payload.statistics, "count"))
      candidate = payload.statistics.count;
    else throw new ResponseShapeError("Unsupported count response shape");
  }
  const n = parseApprovedCountNumber(candidate);
  if (n === null) throw new ResponseShapeError("Invalid count response value");
  return n;
}
```

This is not code copied from the currently inspected implementation; it is target behavior to implement and test. `parseApprovedCountNumber` is intentionally narrow, not `Number(value)` on every JavaScript value.

### 5.5 Internal built-in metadata is not part of the user API

The internal `BUILTIN_CONVENTIONS` table has fields such as `access`, `extended`, and `many` in the code examined during the review.

- `access` supports read preset classification.
- `extended` supports core CRUD versus extended preset selection.
- `many` appears potentially redundant; it must be checked for live consumers before removal.

**None of these are new operation-scope user configuration properties.** The user specifically rejected presenting them as if developers should configure them. If `many` is dead internal metadata, remove it as cleanup. Do not convert a dead internal flag into public API.

---

## 6. Per-call API boundary — Decisions 20, 21, and 22

### 6.1 Normative boundary

A declared operation controls its **meaning**: method/path/body expectation, response decoding, response schema, allowed destinations, content-type policy, and other contract/security settings. A call controls **instance values and execution**: specific path/query/body arguments, cancellation, request headers, observability, selected reliability limits, and dynamic authorized transfer inputs.

Example of desired simple usage:

```ts
api.users.getById("u1", { signal: controller.signal });
api.products.getMany(ids, { sortBy: "name" });
api.documents.download({ query: { locale: "en" }, full: true });
```

Do not require advanced options for simple usage.

### 6.2 Final per-call property review

This table is the finalized consolidated Decision 22, superseding the earlier idea of asking about every property separately.

| Per-call property | Final status              | Notes / restrictions                                                                                                                                                        |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`          | **KEEP**                  | Required route placeholders; fully inferred and runtime checked.                                                                                                            |
| `query`           | **KEEP**                  | Request-specific filters/search data; schema validated; pagination collision rules apply.                                                                                   |
| `headers`         | **KEEP**                  | Dynamic per-call headers; inherited merge. Must pass final security recheck; presigned flow has stricter limitations.                                                       |
| `signal`          | **KEEP**                  | Cooperative cancellation; must dominate retries and attempted refreshes.                                                                                                    |
| `timeout`         | **KEEP**                  | Simple numeric total budget or optional advanced timeout specification.                                                                                                     |
| `retry`           | **KEEP**                  | Instance-specific policy, subject to safety/total budget.                                                                                                                   |
| `onTransfer`      | **KEEP**                  | Observer for dynamic progress/attempt events.                                                                                                                               |
| `transfer`        | **KEEP**                  | Resume checkpoint, transfer control, session callback and checkpoint persistence. Only allowed for advanced transfer operations.                                            |
| `meta`            | **KEEP**                  | Application/middleware metadata; never treated as a trusted authorization source.                                                                                           |
| `full`            | **KEEP**                  | Selects full response envelope, not a new body decoding contract.                                                                                                           |
| `idempotencyKey`  | **KEEP**                  | Explicit stable key for an operation whose idempotency policy authorizes it.                                                                                                |
| `presigned`       | **KEEP, POLICY-GATED**    | Dynamic URL/headers needed by a presigned transfer; operation controls allowed destinations/headers and transport capabilities.                                             |
| `maxResponseSize` | **KEEP, CAN ONLY NARROW** | Effective cap cannot be raised above an operation's configured ceiling. If no ceiling is configured, established transport defaults/absolute safety caps remain applicable. |
| `responseType`    | **REMOVE**                | Fixed by operation definition, not changed on call.                                                                                                                         |
| `redirectOrigins` | **REMOVE**                | Trusted origin list is operation policy, not caller preference.                                                                                                             |

`sortBy` remains a special option for `getMany`, not a universal transport switch. Pagination request input remains operation-specific. `full` can require a special skipped-result union in the `getMany([])` case.

### 6.3 Fixed operation-level `responseType` (Decision 20)

```ts
operations: {
  getProfile: {
    method: 'GET',
    path: '/profile',
    responseType: 'json', // default, optional to spell out
    schema: { response: profileSchema },
  },
  downloadReport: {
    method: 'GET',
    path: '/report',
    responseType: 'blob',
  },
}
```

The generated method **must not** allow:

```ts
// Rejected v3 API:
api.users.getProfile({ responseType: "text" });
```

Reasons: stable typed output, predictable schema application, no contradiction between decoding and operation definition, simpler test matrix. Changing a method's decoding is a new operation design choice, not a per-call execution choice. This removal applies to generated declared operation calls; it does **not** prohibit specifying decoding when constructing a new `ctx.request()` inside a function operation or a transfer step.

### 6.4 Protected `redirectOrigins` (Decision 21)

```ts
operations: {
  download: {
    method: 'GET',
    path: '/download',
    redirectOrigins: ['https://cdn.example.com'],
  },
}
```

A caller MUST NOT widen or replace this allowlist through `RequestOptions`. A middleware mutation may not weaken it (Decision 29). Allowlisted origins are **security configuration**, not secrets by themselves; their publication does not reduce the need for enforcement.

### 6.5 Per-call response size can only tighten (Decision 22)

```ts
// Operation limit:
maxResponseSize: 5_000_000;

// Allowed call, tighter limit:
api.documents.get({ maxResponseSize: 1_000_000 });

// Disallowed call, exceeding configured ceiling:
api.documents.get({ maxResponseSize: 50_000_000 });
```

Effective cap is the tighter of the operation ceiling and any permitted call cap. A greater per-call value should be rejected with a clear configuration error (preferred over silently changing caller intent); it must never make the configured ceiling ineffective. If a genuinely different large response is needed, define the corresponding operation with its own appropriate response-size contract.

### 6.6 Presigned transfers are an intentionally guarded exception

Presigned URLs and headers are obtained dynamically (for example, from a trusted backend), so some request-specific values cannot be frozen in the operation definition. However, the operation's **presigned policy** defines which destinations and headers are authorized. The custom transport must explicitly support the necessary safe presigned behavior. Do not allow ordinary `params`, `query`, or headers to be combined in a way that leaks credentials or bypasses origin restrictions. No general-purpose untrusted destination override is introduced by keeping `presigned`.

### 6.7 Apixa Secrets — dedicated deferred backlog

**Backlog title:** `Apixa Secrets`  
**Status:** Deferred architecture discussion, no implementation under this ADR.

Potential future areas:

- Server-side secret providers and environment-variable resolution.
- Credential scoping per client/resource/operation.
- API key/token redaction in errors, logs, retries and transfer telemetry.
- Secure header providers and secret-safe serialization.
- Separation of public configuration from secret-bearing runtime values.
- Integrations with external secret managers for trusted server environments.
- Enforcement that server-only secrets never enter browser bundles or client-side configuration.

A redirect origin itself is not a secret. Secure design requires allowlist enforcement and credential stripping; it does not rely on hiding the destination name.

---

## 7. Reliability — Decisions 13 and 14

### 7.1 Design target: simple defaults, powerful optional policy

Normal use must remain short:

```ts
const api = defineApi({
  baseURL: "/api",
  timeout: 5_000,
  retry: 2,
  resources: { users: {} },
});
```

A `timeout` number is a **total logical-call deadline**, including attempts and backoff waits. A `retry` number is the maximum number of **additional** transport attempts after the first attempt (e.g., `retry: 2` means up to 3 transport attempts total, subject to deadline, policy, abort and replayability).

Advanced use is optional:

```ts
const api = defineApi({
  baseURL: "/api",
  timeout: {
    total: 30_000,
    perAttempt: 8_000,
  },
  retry: {
    count: 3,
    backoff: "exponential",
    delay: 300,
    maxDelay: 5_000,
    jitter: "full",
    respectRetryAfter: true,
  },
  resources: { users: {} },
});
```

This is an **approved target shape**. Existing implementation may use different internal names (for example `retries`, `baseDelayMs`, `maxDelayMs`, and boolean `jitter`); an implementation agent must reconcile them deliberately without exposing two redundant public forms indefinitely. Both the simple and advanced APIs must have consistent TypeScript inference, validation, and documentation.

### 7.2 Decision 13: retry eligibility and safety

**Eligible by method when configured:** `GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE`, subject to the operation's actual semantics and safe retry policy. `POST` and `PATCH` MUST NOT be automatically retried unless explicitly opted into an appropriate retry policy.

Even formally idempotent methods are not a guarantee of no side effects. A `PUT` that emits notifications or a `DELETE` that triggers external workflows may not be safe under every backend implementation. Operation authors remain responsible for opting into retries consistent with their backend semantics. Apixa MUST NOT claim more than its transport can guarantee.

Retry only when all applicable conditions hold:

1. Retry was configured (no retry by default unless the existing documented global policy deliberately provides it).
2. The method/operation is eligible according to the effective policy.
3. The failure matches the configured transient network/status policy, including configured status codes.
4. The request body is replayable and no irrevocable stream ownership transfer prevents retry.
5. The logical-call total deadline and maximum retry count have not been exceeded.
6. The user's cancellation signal has not been triggered.
7. An attempt-specific response hook has not declared a terminal non-retriable outcome.
8. Retry does not violate idempotency, redirect, origin, signing or presigned-request security.

**Never retry** schema validation failures, malformed input/configuration, explicit cancellation, and malformed-response errors merely because they are exceptions. Retry of a `401` is a separate **bounded authorized refresh flow**, not a general promise to retry every unauthorized request.

### 7.3 Idempotency keys

An operation may declare idempotency handling; a caller may provide an explicit `idempotencyKey` only when authorized by the operation. If a key is generated automatically, it MUST remain stable across automatic retries and a bounded middleware replay of the same logical action.

**Do not infer backend deduplication:** Sending `Idempotency-Key` is useful only if the server actually recognizes and enforces that key. A retry after the server processed a write but before the client received the response can still duplicate side effects unless the backend's idempotency semantics protect it.

**Sensitive-information safety:** Do not include idempotency keys, bearer tokens or presigned credentials in unrestricted log messages, public diagnostics, or cross-origin redirects.

### 7.4 Decision 14: total and per-attempt timeouts

Type sketch:

```ts
type TimeoutOption =
  | number
  | {
      total?: number;
      perAttempt?: number;
    };
```

Rules:

- Positive finite values in milliseconds, with documented handling of zero only if supported intentionally.
- Numeric value means a total logical-call budget.
- `total` includes middleware, transport attempts, retry delays and any bounded refresh/replay work that is part of the call, subject to documented lifecycle policy.
- `perAttempt` resets for each transport attempt, but cannot extend the remaining total deadline.
- Either advanced property may be specified without the other; reject an empty or invalid advanced object if it communicates no meaningful policy.
- Per-attempt expiry may be retriable if the effective policy allows and the total deadline remains.
- Total expiry is terminal: no retries, replay or refresh should restart the clock indefinitely.
- User cancellation takes precedence over internal timeout classification where the signal was the actual cause. Do not report a user abort as timeout or vice versa.
- A stream's lifetime may outlive the returned promise; preserve existing stream ownership and timeout/cancellation semantics intentionally rather than accidentally ending the deadline when headers arrive.

**Compatibility note:** Before changing existing numeric timeout semantics, verify whether the current implementation already treats it as a total deadline. This ADR chooses total-deadline semantics as the v3 contract, not an undocumented change of meaning.

### 7.5 Retry delay, exponential/linear backoff, jitter, and `Retry-After`

Illustrative exponential capped sequence with `delay: 300` and `maxDelay: 5_000` (without jitter):

```text
Failure after attempt 1 → wait about 300 ms
Failure after attempt 2 → wait about 600 ms
Failure after attempt 3 → wait about 1200 ms
... cap at configured maximum
```

- Support at least **exponential** and **linear** backoff in the advanced API.
- Jitter is optional, but a safe jitter default SHOULD prevent synchronized retry storms when advanced backoff is used. The chosen jitter algorithm and its bounds must be documented and deterministic in unit tests with an injectable RNG/clock.
- Respect a valid server `Retry-After` under a clear priority rule; do not allow a server hint to exceed the remaining total deadline. Reject/refrain from retry when the delay is incompatible with the budget.
- Cap individual retry delays and bound the total retry count.
- Empty/malformed `Retry-After` does not create an infinite or NaN delay.
- Retry timing MUST be observable via attempt hooks or `onRetry`, but must not add a new fake logical response for each attempt.

**Deferred:** Retry token buckets, broad retry budgets shared across clients, circuit breakers and service health breakers are **not** part of this v3 decision. They are stateful traffic-control systems requiring separate lifecycle, scoping and concurrency design. The fact they are useful is not sufficient to add them to Apixa now.

### 7.6 Retry limits and transfer safety

Preserve existing advanced transfer protocol constraints: only replay request bodies/transfer parts when the transport and protocol declare them replayable. Do not naïvely buffer unbounded streams to support retry, and do not retry a presigned write without validating its per-step authorization and idempotency/reconciliation semantics. `onTransfer` must accurately identify each attempt and its progress/abort/error events; never claim server acknowledgment from client-side bytes consumed by the transport.

---

## 8. Middleware and attempts — Decisions 23, 26, and 29

### 8.1 Final middleware model

```ts
middleware: {
  onRequest: [prepareRequest],
  onAttempt: [attachToken, signRequest],
  onAttemptResponse: [inspectResponse],
  onResponse: [transformFinalResponse],
  onError: [handleTerminalError],
}
```

| Hook                | Frequency                                          | Role                                                                                     |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `onRequest`         | **Once per logical request**                       | General request preparation, validation-aware transformation, logical tracing.           |
| `onAttempt`         | **Before every transport attempt**                 | Renew attempt-sensitive auth, signing, nonce/date headers where approved.                |
| `onAttemptResponse` | **After every received transport HTTP response**   | Inspect actual received status/headers, coordinate bounded authorized refresh and retry. |
| `onResponse`        | **Once on the final successful logical response**  | Application-level response mapping/inspection; final schema runs after it.               |
| `onError`           | **Once when the logical request ultimately fails** | Terminal failure handling and bounded authorized replay.                                 |

`onAttemptResponse` does **not** run for a network exception where no HTTP response was received; the attempt-level error may be reflected in retry hooks/transfer observers. `onResponse` is **not** the place to inspect each `401` during retries.

### 8.2 Recommended logical execution model

```text
validate caller body/query and resolve effective operation policy
    ↓
run onRequest once
    ↓
verify modified request contracts/security
    ↓
for each allowed attempt:
    run onAttempt
    recheck effective request security, signing and replayability
    perform transport attempt
    if an HTTP response exists: run onAttemptResponse
    classify success vs authorized retry vs terminal failure
    if retry: respect bounded backoff, Retry-After, abort, remaining total budget
    ↓
if terminal failure: onError once → reject (or bounded explicit replay)
if final success:
    decode / unwrap / transforms / parse / built-in normalization
    onResponse once
    final schema validation once
    final built-in semantic checks / ordering
    return data or full envelope
```

Implementers must prevent duplicate logical hook execution during transport retries. A deliberate middleware `replay()` is a new bounded logical pipeline invocation governed by the existing replay limit, **not** a loophole to restart retries forever.

### 8.3 Authorized `401` refresh flow

A response hook may inspect a received `401` and request token refresh through an authorized credential provider, but:

- The refresh must be bounded (for example, at most one authorized refresh/replay per logical call or another clearly stated finite limit).
- Non-replayable writes MUST NOT be retried merely because a token was refreshed.
- If a write can safely retry, its idempotency key MUST remain stable.
- Invalid/expired credentials must not trigger unlimited refresh or retry loops.
- Refresh errors become terminal appropriately and must not reveal bearer tokens in thrown errors.
- A refresh must not expand origin allowlists or bypass header-stripping rules.

### 8.4 Decision 29: middleware mutation with enforced invariants

Middleware MAY modify compatible request fields if those fields are permitted by the API, but Apixa MUST validate the **effective outgoing request** after modifications and before each transport dispatch.

Examples requiring rechecks:

- URL/path change → same-origin/security-policy and allowed route validation.
- Method change → method-kind consistency, body-presence rules and idempotency/retry eligibility.
- Headers change → forbidden credential propagation, presigned policy, idempotency key stability, content-length/body serialization constraints.
- Body change → schema validation of effective logical input and serialization compatibility; not merely validating an earlier stale body.
- Query change → schema/query/pagination collision rules and canonical wire mapping.
- Redirect destination change → operation-level allowlist and runtime inspection guarantees.

If modification changes a declared operation so drastically that its response/body contract no longer applies, **reject the mutation** rather than pretending the caller invoked a different well-typed method. This preserves Decision 20's fixed contract without making all middleware fields immutable.

### 8.5 Decision 23: final schema guarantee

Suppose middleware modifies a valid user object into `{ id: 'invalid', name: null }`. If the declared response schema expects `id: number` and `name: string`, the final result MUST be rejected with `VALIDATION_ERROR`, phase `response`, rather than returned as if it were a `User`. Schema validation is the last mutating validation stage before final built-in invariants. This guarantee applies to both live and mock response pipelines.

### 8.6 Hook observability and replay semantics

- Expose logical request versus transport attempt identity clearly in hook contexts.
- Attempt numbering SHOULD be zero-based or otherwise consistently documented; transfer and retry observers must agree.
- `onResponse` must see the **final logical** response, not intermediate 429/5xx/401 responses.
- `onError` must not run for every transient failed attempt that was recovered by retry.
- No hook is permitted to silently bypass final schema, built-in response invariants or trusted origin enforcement.
- Server/transport callbacks may legitimately fail; such failures must have deterministic error classification and cleanup.

---

## 9. Redirect and destination security — Decisions 06 and 21

### 9.1 Problem statement

An HTTP redirect may lead to another origin. The client must not blindly forward `Authorization`, `Cookie`, `X-Api-Key`, or other sensitive credentials to an untrusted destination.

Node-style manual redirect handling can often inspect a 3xx status and `Location` header. Standard browser `fetch` in manual redirect mode may expose an **opaque redirect** rather than the actual redirect destination. A browser library therefore cannot truthfully claim to inspect/authorize destinations it cannot see.

### 9.2 Decision 06: runtime-aware behavior

**Node / other inspectable runtimes:**

1. Perform manual redirect inspection where the runtime and transport expose status and destination reliably.
2. Enforce same-origin or configured operation allowlist.
3. Strip sensitive headers on authorized cross-origin redirect hops, including user-defined credential-bearing headers under the actual policy.
4. Enforce method/body/replay rules and bounded redirect hop counts.
5. Re-apply destination checks on **every hop**, not just the first redirect.
6. Preserve cancellation and total timeout limits throughout the chain.

**Browsers / opaque uninspectable redirects:**

1. Do not claim to know the hidden destination.
2. Reject redirects that cannot be safely inspected/enforced; do not silently fall back to native following while claiming the same allowlist guarantee.
3. Emit a clear `REDIRECT_ERROR`/security error appropriate to the existing error hierarchy.
4. Document that certain legitimate browser redirects may require server-side proxying or a different backend contract to work under strict client guarantees.

**Workers/Edge/custom transports:** Decide by actual transport capability, not only by `typeof window` or hardcoded runtime labels. When the destination cannot be inspected, use the same safe failure model; do not fabricate parity across environments.

### 9.3 Decision 21: policy ownership

The operation defines trusted redirect destinations. A generated operation call cannot replace them with `redirectOrigins: [...]`. Middleware cannot broaden them either. A custom transport is responsible for enforcing an equivalent policy or must declare and validate a capability restriction before use. Presigned transfers have their own policy-gated exception and MUST NOT accidentally inherit general authorization headers into a delegated destination.

### 9.4 Security tests required

- Same-origin redirect with credentials kept only when valid under policy.
- Authorized cross-origin redirect with sensitive headers stripped.
- Cross-origin destination absent from allowlist rejected.
- Multi-hop redirect where first hop is approved but second is not rejected.
- Opaque browser redirect rejected without accessing a fake `Location` header.
- Redirect loop/hop cap; timeout during hop chain; cancellation.
- Middleware URL/header changes cannot evade allowlist or secret stripping.
- Presigned delegated destination policies remain isolated from standard API authorization headers.

---

## 10. Unified error taxonomy

An implementation agent must keep errors precise. Not every failure is a schema error.

| Failure                                   | Required category                        | Example                                       |
| ----------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Invalid body under schema                 | `VALIDATION_ERROR`, phase `body`         | `{ name: 2 }` when expecting a string.        |
| Invalid query under schema                | `VALIDATION_ERROR`, phase `query`        | `page: 'abc'` under numeric query schema.     |
| Invalid final response under schema       | `VALIDATION_ERROR`, phase `response`     | Response middleware supplies wrong data type. |
| Malformed JSON/declared decoding          | `ParseError`                             | HTML received where JSON is required.         |
| Invalid built-in numeric/collection shape | `ResponseShapeError`                     | `count()` receives `{ nonsense: 12 }`.        |
| Missing/extra/duplicate identities        | `ResponseShapeError`                     | `getMany()` has missing IDs.                  |
| Invalid `getMany` explicit numeric sort   | `ResponseShapeError`                     | `price: 'unknown'` with `type: 'number'`.     |
| Invalid operation definition              | `INVALID_OP` or established config error | Invalid method/body/config combination.       |
| Unsafe redirect                           | Security/redirect error                  | Browser opaque cross-origin redirect.         |
| Timeout                                   | Timeout classification/code              | Total deadline exhausted.                     |
| User abort                                | Abort classification/code                | Caller cancels signal.                        |
| HTTP failure                              | `HttpError` or established HTTP error    | Exhausted retry after 503.                    |
| Unsupported mock operation                | Established mock unsupported error       | Custom operation lacks mock handling.         |

Prefer structured details for diagnostics, including operation/resource, phase, requested IDs, discrepancies, retry count and status where appropriate. **Redact secrets** and avoid embedding raw credential-bearing bodies or headers into public messages.

### 10.1 Error handling example

```ts
try {
  await api.products.getMany(["1", "missing"]);
} catch (error) {
  if (error instanceof ResponseShapeError) {
    // Inspect structured missingIds/extraIds/duplicateIds when present.
    // Do not treat a structurally invalid backend response as a partial success.
  }
}
```

### 10.2 Parsing versus validation

A server returning malformed JSON has not produced a valid JSON value for schema validation. `ParseError` is appropriate. A successfully decoded JSON value that fails the declared response schema is a response-phase `VALIDATION_ERROR`. A successfully decoded and schema-valid value that violates a specialized `getMany` identity invariant is `ResponseShapeError`. This separation must remain visible to callers and tests.

---

## 11. Full reference API examples

These examples show **intended v3 semantics**. Some details are deliberately illustrative because the actual repository implementation has not been updated in this ADR authoring step.

### 11.1 Minimal app

```ts
import { defineApi } from "apixa";

interface User {
  id: string;
  name: string;
}

type AppApi = { users: User };

export const api = defineApi<AppApi>()({
  baseURL: "/api",
  resources: {
    users: {
      path: "/users",
    },
  },
});

const users = await api.users.getAll();
const user = await api.users.getById("u1");
await api.users.update("u1", { name: "Ada" });
```

### 11.2 Configured transforms, pagination, schema and reliability

```ts
import { defineApi, emptyResponse } from "apixa";
import { z } from "zod"; // Optional dependency in the consuming app.

const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.coerce.number(),
});

export const api = defineApi({
  baseURL: "/api",
  timeout: 5_000,
  retry: 2,
  transforms: {
    request: { keys: "snake_case" },
    response: { keys: "camelCase" },
  },
  response: { unwrap: "data" },
  resources: {
    products: {
      path: "/workspaces/:workspaceId/products",
      paginationConfig: "laravel",
      operations: {
        getAll: { pagination: true },
        create: {
          schema: {
            body: ProductSchema.omit({ id: true }),
            response: ProductSchema,
          },
        },
        update: {
          schema: { response: emptyResponse },
        },
        count: {
          // Built-in count normalization happens after unwrap.
          schema: { response: z.number().int().nonnegative() },
        },
        getMany: { path: "/many" },
        downloadReport: {
          method: "GET",
          path: "/report",
          responseType: "blob",
        },
      },
    },
  },
});

const page = await api.products.getAll({
  params: { workspaceId: "w1" },
  pagination: { page: 1, pageSize: 20 },
});

const count = await api.products.count({ params: { workspaceId: "w1" } });
const products = await api.products.getMany([3, 1, 2], {
  params: { workspaceId: "w1" },
  sortBy: { field: "price", order: "asc", type: "number" },
});
```

**Example limitations:** This is a sketch of the final configuration surface. The resource path and operation path overrides must be composed according to Apixa's documented path rules. `response.unwrap: 'data'` applied at root may be inappropriate for some endpoints; those operations must explicitly disable/replace it under the established `response.unwrap` override rules, and pagination parsing must preserve envelope metadata. An empty response marker validates the actual empty payload, regardless of root unwrap where there is no body. The example therefore illustrates components, not a claim that every line is presently a passing runtime test.

### 11.3 Function operation with per-attempt auth and fixed subrequest response types

```ts
const api = defineApi({
  baseURL: "/api",
  middleware: {
    onRequest: [traceLogicalCall],
    onAttempt: [attachFreshToken, signEachAttempt],
    onAttemptResponse: [inspect401AndAuthorizeBoundedRefresh],
    onResponse: [auditFinalResponse],
    onError: [auditTerminalError],
  },
  resources: {
    reports: {
      operations: {
        generate: {
          kind: "write",
          run: async (ctx, input: { id: string }) => {
            const result = await ctx.request({
              method: "POST",
              path: "/generate",
              body: input,
              timeout: { total: 20_000, perAttempt: 5_000 },
            });
            return ctx.request({
              method: "GET",
              path: "/generated/:id/file",
              params: { id: input.id },
              responseType: "blob", // Declares this newly constructed subrequest.
            });
          },
        },
      },
    },
  },
});
```

No `config` bag was added to the function operation. An inner `ctx.request` can specify its own decoding precisely because it is constructing a subrequest, not modifying an existing declared operation's type.

### 11.4 Non-JSON schema

```ts
operations: {
  getText: {
    method: 'GET',
    path: '/robots.txt',
    responseType: 'text',
    schema: { response: z.string() },
  },
  getAttachment: {
    method: 'GET',
    path: '/attachment',
    responseType: 'blob',
    schema: { response: z.instanceof(Blob) },
  },
}
```

No JSON key transform is applied to text or Blob data. A stream schema sees only the stream object and cannot silently consume its chunks.

---

## 12. Required conformance matrix for implementation agents

The architecture is finalized, but implementation can only be called complete when targeted tests demonstrate the following behavior. Do not skip tests for an area just because the current `pnpm verify` result once passed before these changes.

### 12.1 TypeScript/type-consumer tests

- Explicit `defineApi<{ users: User }>()` correctly infers entity reads/writes.
- Legacy `{ users: { entity: User } }` is rejected as appropriate.
- Direct inferred mode still infers from typed mocks and schemas.
- Built-in `update(id, body, options?)`/`patch(id, body, options?)` accept correct typed payloads; old `{ body }` overloads are absent.
- Path params are required for resource and effective operation placeholders, including overridden `getMany`/`exists`.
- Declared generated-operation calls have **no per-call `responseType` or `redirectOrigins`**.
- `ctx.request` and transfer steps retain the ability to define a newly constructed subrequest response type.
- `full: true` types are correct, including `getMany([])` locally skipped branch.
- `emptyResponse` produces `void` for explicitly empty contracts.
- `getMany.sortBy` only appears on the intended call surface, and typed numeric mode is supported.
- Standard Schema input/output inference honors parsed transformations.
- Synchronous query-only schema contract is enforced in types and runtime.

### 12.2 Pipeline and schema tests

- Unwrap → key transforms → custom parse → built-in normalization → final middleware → schema validation → final semantic checks.
- Response middleware cannot bypass response schema with invalid replacement data.
- Schema validation happens exactly once on final payload; no double coercion.
- Mock and live produce compatible finalized data for equivalent inputs.
- Invalid body/query fail before any network transport call.
- Non-JSON string/blob/buffer schemas work; streams are not read or buffered for validation.
- Malformed JSON raises `ParseError`, not generic validation failure or string fallback.
- Empty body on nonempty entity operation is rejected; `emptyResponse` and built-in `delete` are accepted.
- Custom operation primitives, arrays, objects and binary outputs do not receive incorrect built-in checks.
- Distinguish schema errors from built-in `ResponseShapeError` in both API shape and error details.

### 12.3 `count()` tests

Test each approved direct shape and representative numeric-string variants. Test nested `statistics.count`, explicit unwrap before detection, transforms to the expected alias, ambiguity priority, selected invalid first key, inherited-property rejection, and unknown structure error.

Required negative cases: negative, fraction, `NaN`, `Infinity`, `null`, blank string, malformed numeric string, boolean, unsafe integer, arbitrary nested field, missing explicit unwrap path, and unexpected arrays. Confirm `ResponseShapeError` for unsupported/invalid built-in response and response-phase `VALIDATION_ERROR` for explicit schema rejection of an otherwise normalized result.

### 12.4 `getMany()` tests

- Empty `[]` returns immediately and makes zero transport calls.
- `full: true` empty case is explicitly skipped and carries no fabricated HTTP status.
- Duplicate input IDs normalize/deduplicate consistently and preserve first occurrence.
- Requested order is reconstructed even when server order differs.
- Canonical numeric/string IDs compare as agreed; `'001'` does not silently equal `1`.
- Missing requested IDs produce structured missing list and fail.
- Unexpected returned IDs produce structured extra list and fail.
- Duplicate backend IDs produce structured duplicate list and fail.
- Missing/invalid `idKey` fails as shape error, not a guess.
- Numeric sort with `price: '100'`, `price: 20`, `price: '5'` orders 5, 20, 100 but preserves original values.
- Numeric sort fails on missing, null, invalid, nonfinite or unsafe sort values.
- Equal sort keys use stable requested-ID order.
- Ordinary string sort does not unexpectedly cast ID strings/numeric-looking SKU values.
- Sorting occurs after all identity and schema checks.
- Mock and live modes enforce the same logical contract.

### 12.5 Pagination tests

- Resource `paginationConfig` enables `getAll` only.
- Operation `pagination: true` inherits/reuses correctly; `false` disables; object/preset replaces.
- Resource-level legacy `pagination` alias is absent in v3 typing/config (or explicitly rejected).
- Page/offset/cursor strategies work with direct and custom param mappings.
- `Offset`/`Before` transformed-key issues are fixed through central normalization.
- Explicit backend `perPage` stays `perPage` despite generic `snake_case` transforms.
- Query schemas and pagination collision handling agree across live/mock.
- Envelope metadata survives parsing/unwrap; navigation helpers never invent missing facts.
- Invalid paginator totals/pages/cursors produce consistent structural errors.

### 12.6 Retry, timeout, middleware tests

- `retry: 2` means up to three attempts, subject to method eligibility and budget.
- POST/PATCH do not silently retry absent explicit safe opt-in.
- `PUT`/`DELETE` eligibility follows documented policy; idempotency constraints are tested.
- Numeric timeout is a total deadline; advanced `total` and `perAttempt` are independently bounded.
- Backoff linear and exponential delays, caps, jitter, and `Retry-After` work under controlled clocks.
- Total deadline terminates retries, including waiting periods.
- Abort signal terminates immediately and error classification is correct.
- `onRequest` once; `onAttempt` each attempt; `onAttemptResponse` each received HTTP response; `onResponse` final successful result once; `onError` terminal failure once.
- Signed/credential headers are rechecked after attempt middleware.
- Token refresh on 401 cannot cause infinite retry loops and cannot bypass unsafe-write rules.
- Replay does not reset total budgets or duplicate non-replayable writes.
- Idempotency key is stable across eligible retries and bounded replay.
- Middleware-modified URLs, methods, headers, bodies and queries are revalidated before transport.

### 12.7 Security and limits tests

- Runtime-aware redirect behavior: inspectable Node redirects enforced, browser opaque redirects rejected.
- Cross-origin sensitive headers stripped on authorized hops; unauthorized destination rejected.
- Multi-hop redirect chain checked at every destination; loops bounded.
- `redirectOrigins` absent from generated per-call options and not bypassable via middleware.
- `maxResponseSize` call cannot increase operation maximum; tighter cap enforced during streaming.
- Presigned destinations restricted by operation policy and transport capability.
- Credentials never forwarded to untrusted origins, including a redirect from a trusted first hop.

### 12.8 Framework and adapter regression

Core remains independent from React, Next.js, and TanStack Query. Operation metadata must still expose stable read/write semantics for adapters, even when attempt hooks and schemas are introduced. Existing React/SSR/edge/worker/Node/bundled-consumer tests should be re-run in the eventual implementation/release process. This ADR records the requirement but does not perform that process.

---

## 13. Implementation plan and boundaries

### 13.1 Recommended workstream order

1. **Public types and config validation:** remove prohibited per-call properties; add advanced timeout/retry forms; update signature inference; add `emptyResponse`; surface correct schema errors.
2. **Core response pipeline:** implement final middleware ordering and schema validation; verify parser/normalizer composition, non-JSON behavior, and final built-in checks.
3. **Built-in operations:** add count normalization; strict `getMany` ID comparison, dedupe, missing/extra/duplicate validation, order, sort and empty full-result semantics.
4. **Pagination:** one normalization ownership boundary, explicit wire param names, resource alias cleanup and mock/live consistency.
5. **Middleware/reliability:** add attempt hooks and bounded retry/timeouts; preserve stable idempotency keys.
6. **Security:** runtime-aware redirects, policy enforcement after mutable middleware, per-call response-size narrowing and presigned isolation.
7. **Docs and type-consumer fixtures:** update all examples and migration notes, remove legacy syntax and inaccurate claims.
8. **Targeted test/conformance review:** verify each decision's required observable behavior.

Implementation should be incremental, preserving unrelated file handling, transfer protocols, framework integrations and existing public behavior unless an explicit decision authorizes the change.

### 13.2 Explicitly deferred work

- **Apixa Secrets** backlog design and implementation.
- Token buckets and circuit breakers.
- Final publication/version tagging/npm dist-tag updates.
- Final end-to-end release testing and manual-test application imports/changes unless later specifically authorized.
- Large unrelated architectural rewrites.

The earlier agent prompt request specifically asked to defer final testing, publishing and importing changes into manual-tests to the owner. This ADR preserves that boundary: ordinary implementation work may add focused unit/type tests, but completion of final release gates is a separate user-directed phase.

### 13.3 No false completion claims

This ADR should be checked into the appropriate `docs/adr/` or repository ADR location when the owner authorizes it. Its existence does not mean the `main` branch currently satisfies it. Changes are accepted only after comparing the actual branch against each rule and producing a traceable implementation/report. Do not edit code merely to satisfy an outdated audit assertion; inspect current definitions and determine actual behavior first.

---

## 14. Migration notes and examples of intentional breaking changes

| Older call/config                                     | Target v3                                             | Why                                         |
| ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `type ApiState = { users: { entity: User } }`         | `{ users: User }`                                     | Flattened metadata, less ceremony.          |
| `update(id, { body, ...options })`                    | `update(id, body, options?)`                          | Uniform positional bodies.                  |
| `patch(id, { body, ...options })`                     | `patch(id, body, options?)`                           | Same signature rule.                        |
| `getProfile({ responseType: 'text' })`                | Define separate text operation or fix its declaration | Operation has one stable response contract. |
| `download({ redirectOrigins: [...] })`                | Configure trusted origins on operation                | Per-call security policy cannot be widened. |
| Resource `pagination: 'laravel'`                      | `paginationConfig: 'laravel'`                         | Remove ambiguous resource alias.            |
| Function operation `{ kind, config, run }` (proposal) | `{ kind, run }`, with options in `ctx.request()`      | Avoid duplicate config system.              |
| `getMany([])` throwing                                | `getMany([]) → []`                                    | Normal empty-selection behavior.            |
| `getMany` accepting missing/extra records             | Strict `ResponseShapeError`                           | Complete identity contract.                 |
| Response schema validated before mutable `onResponse` | Validate **after** final `onResponse`                 | Middleware cannot violate output schema.    |

Breaking changes must be reflected in compiler/type tests, docs, and migration notes. Do not preserve ambiguous overloads merely to make a breaking v3 change look backward-compatible.

---

## 15. Traceability and superseded intermediate choices

These reversals are recorded to prevent later implementation prompts from accidentally using superseded answers:

1. **Decision 01:** An earlier recommendation was to add `transforms: false` and per-direction `false`. The user's final choice was to allow resource-level custom transformers, and the record explicitly said no new `false` syntax was needed. Keep the final narrower rule.
2. **Decision 04:** An intermediate proposal introduced `config` beside `kind` and `run`; the user preferred putting request settings directly inside each `ctx.request()`. Do not implement the discarded wrapper.
3. **Decision 11:** This was a redundant question. ADR-006's optional runtime validation and schema inference were already settled; do not create a second validation framework.
4. **Decision 14:** Simple numeric timeout remains the default; the advanced object and retry/backoff features are optional. Token buckets and circuit breakers were discussed but deliberately deferred.
5. **Decision 15:** A brief interim verdict suggested throwing on `getMany([])`; this was expressly **reversed** to valid empty-input short-circuit with truthful `full: true` metadata.
6. **Decision 16:** Initially only number/string/`count`/`total`/`data` shapes were approved; then the user extended support to `records`, `quantity`, `numberOfUsers`, and `statistics.count`. The expanded deterministic detector is final.
7. **Decision 19:** A suggested automatic numeric detection for `sortBy: 'price'` was rejected in favor of explicit numeric mode. Keep string-mode semantics separate.
8. **Decision 20:** Initially compared per-call response decoding/schema compatibility. User chose the stronger rule: **remove per-call `responseType`** instead of adding compatibility checks for an override that should not exist.
9. **Decision 21:** User fixed redirect origins to operation configuration and separately created the **Apixa Secrets** backlog note. Do not treat origins as credentials.
10. **Decision 22:** A standalone response-size-limit question turned into a requested comprehensive per-call audit. The finalized consolidated property table governs; do not ask about every individual option again.
11. **Decision 23:** Final validation after response middleware supersedes any pipeline interpretation that validates only before mutable middleware.
12. **Decision 26:** Originally approved request middleware once per logical call, but then explicitly expanded to `onAttempt` and `onAttemptResponse` so both request and response attempt lifecycles are separate from logical hooks. The expanded lifecycle is final.
13. **Decision 30:** Strict empty responses were approved with a developer-friendly `emptyResponse` special marker. Do not degrade the marker to `null` or an arbitrary synthetic success object.
14. **Earlier ADR-006 parse/schema exclusivity:** Later Decisions 07 and 23 establish final schema validation after parsing and middleware. This ADR records parse-then-schema composition as the v3 target; any existing guard rejecting the combination must be revisited.

---

## 16. Final architectural verdict

**Accepted:** Preserve Apixa's framework-independent, declarative, schema-aware core and operation model. Improve internal consistency rather than redesigning the SDK or multiplying configuration surfaces.

**Core principles to preserve:**

- Common workflows are automatic; unusual cases are configurable.
- Operation contracts are stable and typed.
- Per-call options are execution inputs, not a second API-definition layer.
- Explicit user configuration takes precedence over implicit heuristics.
- Validation is meaningful on the **actual final returned value**.
- Built-ins have real semantic guarantees, not only transport convenience.
- Retried attempts and logical calls are distinct observable lifecycles.
- Security guarantees must reflect actual browser/Node/edge capabilities.
- Empty states and normal user behavior must not generate needless errors.
- Neither docs nor audit summaries substitute for implementation evidence.

**Final release status:** Architecture accepted; implementation changes and final verification are pending until separately performed. No publication authorized by this ADR.

---

## Appendix A — Compact developer cheat sheet

```ts
// 1. Flattened entity map.
type AppApi = { users: User; products: Product };

// 2. Simple default use.
const api = defineApi<AppApi>()({
  baseURL: '/api',
  timeout: 5000,
  retry: 2,
  resources: {
    users: { path: '/users' },
    products: {
      path: '/products',
      paginationConfig: 'laravel',
      operations: {
        count: {
          schema: { response: z.number().int().nonnegative() },
        },
        export: { method: 'GET', path: '/export', responseType: 'blob' },
      },
    },
  },
});

await api.users.update('u1', { name: 'Ada' });
await api.products.getMany([]); // [] (local skip, no HTTP)
await api.products.getMany(['3', '1', '2']); // requested-ID order
await api.products.getMany(['3', '1', '2'], {
  sortBy: { field: 'price', type: 'number', order: 'desc' },
});
await api.products.count(); // always a validated normalized count number

// 3. Advanced settings only when needed.
const advancedTimeout = { total: 30_000, perAttempt: 8_000 };
const advancedRetry = {
  count: 3,
  backoff: 'exponential',
  delay: 300,
  maxDelay: 5_000,
  jitter: 'full',
  respectRetryAfter: true,
};

// 4. Strict response declaration.
operations: {
  download: { method: 'GET', path: '/file', responseType: 'blob' },
  changeStatus: { method: 'POST', schema: { response: emptyResponse } },
}

// 5. Distinct hook scopes.
middleware: {
  onRequest: [oncePerCall],
  onAttempt: [beforeEachAttempt],
  onAttemptResponse: [afterEachReceivedResponse],
  onResponse: [onceForFinalSuccess],
  onError: [onceForTerminalFailure],
}
```

## Appendix B — Source and review provenance

This ADR consolidates the user's finalized November 15, 2026 discussion, the uploaded `defineApi` audit (`Pasted text(20261115-155021).txt`), earlier ADR-006/pagination decisions, and spot-checks of the `a2mby/apixa` source on GitHub including:

- `packages/core/src/operation/conventions.ts` — built-in operation metadata.
- `packages/core/src/operation/expand.ts` — built-in preset selection.
- `packages/core/src/api/resource-client.ts` — built-in return shaping, including the then-current numeric-only count handler.
- `packages/core/src/request/pipeline.ts` — response pipeline and per-call override usage.
- `packages/core/src/types/transport.ts` — the then-current `RequestOptions` definition.
- `packages/core/src/types/definition.ts` — operation and root/resource types.
- `packages/core/src/types/retry.ts` — the then-current retry configuration.
- `packages/core/src/types/advanced-transfer.ts` — transfer and presigned request inputs.

The audit's earlier “95%+ production-ready” claim was **not adopted as a release verdict**. The ADR is authoritative for agreed behavior, not proof of passing tests or of implementation completeness.

**End of ADR-007.**
