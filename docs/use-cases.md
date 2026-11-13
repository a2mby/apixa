# Use cases

A living manual-testing catalog for the whole Apixa library, from **v0.1.0 through v1.8.1**.

Baseline: repository work through PR #108 (merge `f2883dc`, content tip `672b35a`), inspected November 12, 2026. The development milestone number is not the npm package version. The published baseline is `1.0.0-rc.0`; later repository features require a build of the appropriate checkout.

**Every checkbox starts untested.** Earlier automated checks and previous manual runs do not mark this catalog passed. Record fresh evidence for the commit and environment you actually test.

This is a working QA notebook, not a second API specification. [Public API](public-api.md), [architecture](architecture.md), package READMEs, and the relevant milestone contract settle exact behavior. If a case disagrees with those sources, investigate and record the discrepancy before changing the expectation.

Local follow-up (November 12, 2026): the author requested seeded PostgreSQL relational/JSONB data and MongoDB documents. See [Playground datasets](../examples/backends/laravel-backend/database/fixtures/README.md). This adds data/models, not application HTTP endpoints, and does not rewrite the frozen v1.8.1 environment milestone.

## How to use this document

1. Choose the commit, runtime, client mode, and scenario group. Record them in the run log.
2. Prepare only the prerequisites for that group. A missing endpoint or protocol means **blocked**, not failed and not passed.
3. Execute the **Do** instruction and compare both the returned result and observable side effects with **Expect**.
4. Mark a checkbox only after recording evidence. For failures, keep the box empty and add an issue or local finding. Use the ledger for blocked, not applicable, and deferred cases.
5. Re-run affected groups after a change, including the relevant cross-feature journeys. Keep results attached to a commit; do not treat old checked boxes as evidence for a newer build.

Case IDs are permanent references. Add new IDs at the end of a group; do not renumber existing cases. A case describes one distinct risk or user workflow. Use the variation matrix for equivalent inputs instead of duplicating the case for every value.

### Execution modes

| Tag | Where to execute                                                        | What it can establish                                                                         |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `M` | Core mocked resource or standalone `defineMockApi`                      | Local data behavior, mock isolation, file ownership; no HTTP evidence                         |
| `T` | Small caller-owned, instrumented `Transport` or controlled test harness | Exact request shape, deterministic errors, timing and race ordering; no browser/network claim |
| `H` | Genuine HTTP backend with the required author-owned endpoints           | Wire encoding, response bodies, database persistence, server acknowledgments                  |
| `B` | Browser with Network panel and Console open                             | Real CORS, browser File/Blob behavior, cancellation, download UI                              |
| `R` | React/TanStack consumer; maintained Next example where applicable       | Rendered states, keys, cache, mutation lifecycle and hydration                                |
| `E` | Strict TypeScript editor or small `tsc --noEmit` consumer               | Inference, autocomplete and rejected invalid programs; no runtime proof                       |
| `P` | Clean consumer installed from a locally packed tarball                  | Actual public exports, declarations and dependency boundaries                                 |
| `N` | Supported Node.js runtime                                               | Native ESM, Node files/streams and filesystem dataset utilities                               |
| `L` | Standalone Laravel playground                                           | Environment readiness only, until the author adds application behavior                        |
| `X` | Historical worktree/tarball, with that version's own documentation      | Retired API/migration behavior; never a current API recommendation                            |

A case tagged `T/H` can be explored deterministically with a transport and then repeated over HTTP when an endpoint exists. Record the mode actually used. A transport success does not complete its HTTP counterpart. A browser scenario needs a real browser, not just `curl`.

### Useful routes through the catalog

- **First manual confidence pass:** PKG-001, CFG-001, OPS-001 through OPS-005, ERR-001, MOCK-001, FILE-001, DOWN-001, QUERY-001, MUT-001, SSR-001 and LAR-001 through LAR-004, where prerequisites exist.
- **Before changing Core:** configuration, operations, URLs, bodies, transforms, middleware, errors, reliability, idempotency, types, and package boundaries.
- **Before changing file handling:** uploads through advanced transfers, mock storage, framework files, hardening and the relevant journeys.
- **Before changing React integration:** queries, cache, infinite queries, mutations, optimistic updates, SSR, framework files and consumer packaging.
- **Before a release:** use the full milestone map and runtime matrix, then run the repository's existing verification gates. Manual checks complement those gates.

## Test bench and evidence

### Current starting points

- [Core usage](../packages/core/README.md), [Mocking usage](../packages/mocking/README.md), [React usage](../packages/react/README.md).
- [Maintained Next consumer](../examples/frontends/query-ssr-next/README.md), including its `/files` scenario. Inspect its README for the actual startup command and installed dependencies.
- [Laravel environment](../examples/backends/laravel-backend/README.md): currently stock `/`, built-in `/up`, and an **empty** registered API route file. It has no CRUD, upload, download, authentication, or transfer protocol endpoints.
- [Production file handling](guides/humans/production-file-handling.md) for ownership, safety, performance and recovery boundaries.
- [Version status](../versions/README.md) distinguishes shipped, merged, signed-off and pending work. This notebook does not change those statuses.

Build the selected checkout before testing packed code. Use public `apixa` imports in external consumers, not private `@apixa/*` workspace names. Do not assume the npm registry's release candidate contains all repository milestones.

```bash
# Repository baseline; run from the Apixa root.
pnpm build
pnpm verify

# Optional packaging inspection, without publishing.
npm pack --dry-run --ignore-scripts --json
```

Use a separate scratch consumer or existing maintained example to try cases. This document does not create a test app or add backend routes. Type-negative cases belong in a disposable consumer, not in production source.

### A first runnable check without backend endpoints

After installing the selected local build in a scratch consumer, save this as an ESM `.mjs` file and run it with a supported Node version. It exercises mock reads, a write and reset without making a network request:

```js
import { defineApi, resetMock } from "apixa/core";

const api = defineApi({
  baseURL: "https://manual.invalid",
  resources: {
    users: {
      path: "/users",
      mock: [
        { id: "1", name: "Ada" },
        { id: "2", name: "Grace" },
      ],
    },
  },
});

console.log("Before:", await api.users.getAll());
await api.users.patch("1", { body: { name: "Ada updated" } });
console.log("Updated:", await api.users.getById("1"));
resetMock(api);
console.log("Reset:", await api.users.getById("1"));
```

Expected: two original rows, then `Ada updated`, then `Ada` again. This is a starting point for `M` cases, not evidence for an HTTP or browser case. Expand the scratch resource deliberately for the selected case rather than assuming it covers all modes.

For a packed consumer, create the tarball from the checkout using `npm pack --ignore-scripts --pack-destination <existing-scratch-directory>`, then install that exact returned tarball path in the separate consumer. This creates a local artifact; it does not publish. Add React/TanStack peers only for the corresponding framework consumer. Follow the maintained example README when using that app instead.

### Data kit

Prepare a small disposable resource with at least three known rows: distinct string IDs, names differing in case, one absent optional field, and a flat filter field. Add a second resource/client for isolation checks. For numeric-ID cases, use a separate typed resource so the type expectation is unambiguous.

For files, use recognizable byte contents and record expected byte lengths: empty text, one-byte text, UTF-8 text, a small binary file, two files with identical names but different bytes, a filename with spaces/Unicode, and a large synthetic Blob created locally. Add values exactly at, below and above each configured limit. Use synthetic credentials and signed-URL samples for secrecy tests.

A real backend must supply its own disposable records and endpoint contract. Before a destructive test, confirm the selected **development/test/E2E database identity** and that the data belongs to the run. Keep production out of the test bench. Use `resetMock` only for client-owned mock state; it does not reset PostgreSQL.

### Observe more than the return value

Capture the request method, URL, query, relevant headers, body representation, attempt count and response status. For writes, check the final rows and file references. For races, record the order in which requests were sent and resolved. For cancellation, check that obsolete work actually stops and does not commit later. For security cases, prove the forbidden destination received **zero** requests using controlled server logs or a transport recorder.

Record bytes or hashes where file equality matters. Do not log authorization headers, real tokens, file contents, or signed query strings. Browser Network screenshots must be redacted before sharing.

### Variation matrix: repeat only where it changes the risk

| Dimension | Useful variations                                                                            | Apply to                                          |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Identity  | String/numeric ID; `0`; spaces; Unicode; reserved URL characters                             | Lookups, paths, mock indexing, keys               |
| Presence  | Omitted; explicit `undefined`; `null`; empty string; empty array; `false`; `0`               | Serialization, filters, defaults and validation   |
| Size      | Empty; one item; limit minus one; exact limit; limit plus one; many small items              | Bodies, file counts, pagination, streaming        |
| Outcome   | Success; empty success; HTTP failure; invalid JSON; disconnect; timeout; abort               | Errors, retries, observers and cleanup            |
| Timing    | Before dispatch; during body read; between attempts; during persistence; after server commit | Lifecycle and recovery                            |
| Ownership | One owner; shared ref; fixture pin; manual put; two clients                                  | Mock files, reset and cleanup                     |
| Consumer  | Core direct; Core mock; adapter mock; React; Next SSR; packed consumer                       | Inference and cross-layer consistency             |
| Runtime   | Node 22/24; React 18/19; actual Chromium; Vercel Edge; workerd                               | Supported behavior and honest unsupported results |

Do not multiply every case by every cell. Repeat when runtime, ownership, body shape, cache identity or retry safety can change the outcome. Record deliberate exclusions.

## Milestone coverage map

Historical columns identify the origin of a concern; current expectations follow the current API. This map includes **all existing version folders**, including the pre-v1 line.

| Milestone                               | Main manual concerns                                                               | Catalog groups                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [v0.1.0](../versions/v0.1.0/scope.md)   | Definitions, CRUD, paths, JSON, promises, transport and errors                     | CFG, OPS, URL, BODY, ERR, TYPE, HIST                          |
| [v0.2.0](../versions/v0.2.0/scope.md)   | Default-first operations and partial overrides                                     | CFG, SELECT, OPS, HIST                                        |
| [v0.3.0](../versions/v0.3.0/scope.md)   | Historical type markers                                                            | HIST; current TYPE regression                                 |
| [v0.4.0](../versions/v0.4.0/scope.md)   | Resource entity state and derived inputs; marker removal                           | TYPE, HIST                                                    |
| [v0.5.0](../versions/v0.5.0/scope.md)   | Local datasets and independent mocking                                             | DATA, MOCK, ADAPT, HIST                                       |
| [v0.6.0](../versions/v0.6.0/scope.md)   | Retry, cancellation, timeout and middleware                                        | REL, MID, ERR                                                 |
| [v0.7.0](../versions/v0.7.0/scope.md)   | Thin Core, raw bodies, query serialization, envelopes, replay and extension seams  | BODY, URL, MID, REL, TYPE, PKG, HIST                          |
| [v0.8.0](../versions/v0.8.0/scope.md)   | Resource queries and TanStack integration                                          | QUERY, CACHE, SSR, HIST                                       |
| [v0.9.0](../versions/v0.9.0/scope.md)   | Flat resource mock configuration                                                   | MOCK, ADAPT, HIST                                             |
| [v0.10.0](../versions/v0.10.0/scope.md) | Sixteen builtins and operation customization                                       | OPS, SELECT, FN, ADAPT, HIST                                  |
| [v0.11.0](../versions/v0.11.0/scope.md) | Parse failure, retry decision, mock copies, pagination and mutations               | ERR, REL, MOCK, QUERY, MUT, HIST                              |
| [v1.0.0](../versions/v1.0.0/scope.md)   | Query/cache/mutation DX, explicit kinds, idempotency, single-package boundaries    | PKG, SELECT, FN, IDEM, QUERY, CACHE, INF, MUT, OPT, SSR, HIST |
| [v1.1.0](../versions/v1.1.0/scope.md)   | File fields, automatic multipart, extended serialization and initial virtual files | FILE, MULTI, BODY, STORE, TYPE                                |
| [v1.2.0](../versions/v1.2.0/scope.md)   | Downloads, binary responses and filename metadata                                  | DOWN, ERR, FRAME                                              |
| [v1.3.0](../versions/v1.3.0/scope.md)   | Progress, stream lifetime and reliability                                          | PROG, STREAM, REL, FRAME                                      |
| [v1.4.0](../versions/v1.4.0/scope.md)   | File rules, request/response limits and middleware safety                          | RULE, LIMIT, MID, ERR                                         |
| [v1.5.0](../versions/v1.5.0/scope.md)   | Organized storage, fixtures, ownership and managed transactions                    | STORE, FIX, ATOM, ADAPT                                       |
| [v1.6.0](../versions/v1.6.0/scope.md)   | Framework file identity, lifecycle, SSR and consumers                              | FRAME, QUERY, SSR, TYPE, PKG                                  |
| [v1.7.0](../versions/v1.7.0/scope.md)   | Chunk/session transfer, checkpoints, resume and presigned security                 | ADV, CTRL, RESUME, SIGN, FRAME                                |
| [v1.8.0](../versions/v1.8.0/scope.md)   | Redirects, races, shared-reference validation, memory and hardening                | SEC, ATOM, RESUME, HARD, JOURNEY                              |
| [v1.8.1](../versions/v1.8.1/scope.md)   | Independent Laravel/PostgreSQL infrastructure                                      | LAR; HTTP cases remain gated on author-owned endpoints        |

## Catalog navigation

Pick a group by its stable prefix. Every case below has its own action and observable expectation.

| Group               | Coverage                                                | Cases |
| ------------------- | ------------------------------------------------------- | ----: |
| [PKG](#pkg)         | Package and consumer boundaries                         |     9 |
| [CFG](#cfg)         | API construction and configuration                      |    11 |
| [SELECT](#select)   | Operation selection and classification                  |     9 |
| [OPS](#ops)         | All builtin operations                                  |    17 |
| [FN](#fn)           | Function operations and custom requests                 |     8 |
| [URL](#url)         | URLs, path parameters and query strings                 |     9 |
| [BODY](#body)       | Bodies, headers and response envelopes                  |    12 |
| [KEY](#key)         | Key transforms and structural data safety               |     8 |
| [MID](#mid)         | Middleware and replay                                   |    10 |
| [ERR](#err)         | Error classification and diagnostics                    |    10 |
| [REL](#rel)         | Retries, cancellation and request lifetime              |    12 |
| [IDEM](#idem)       | Idempotency and logical writes                          |     8 |
| [MOCK](#mock)       | Core mocked resources                                   |    10 |
| [DATA](#data)       | Dataset catalog and native Node loaders                 |     8 |
| [ADAPT](#adapt)     | Standalone defineMockApi adapter                        |     8 |
| [FILE](#file)       | Native file inputs and operation coverage               |     9 |
| [MULTI](#multi)     | Multipart serialization and backend compatibility       |    10 |
| [DOWN](#down)       | Downloads, response types and metadata                  |    10 |
| [PROG](#prog)       | Transfer progress and event meaning                     |    10 |
| [STREAM](#stream)   | Streaming, cancellation after resolve and backpressure  |     8 |
| [RULE](#rule)       | File validation rules                                   |    14 |
| [LIMIT](#limit)     | Body and response resource limits                       |     8 |
| [STORE](#store)     | Virtual file storage and ownership                      |    12 |
| [FIX](#fix)         | File fixtures and lazy initialization                   |     8 |
| [ATOM](#atom)       | Managed mock transaction failures and races             |    10 |
| [QUERY](#query)     | Reactive reads and query identities                     |    12 |
| [CACHE](#cache)     | Cache helpers, controllers and imperative reads         |    10 |
| [INF](#inf)         | Infinite and paginated queries                          |     9 |
| [MUT](#mut)         | Resource mutations and per-call state                   |    10 |
| [OPT](#opt)         | Optimistic state, rollback and concurrency              |     9 |
| [SSR](#ssr)         | SSR, hydration, providers and native TanStack consumers |     9 |
| [FRAME](#frame)     | Files across queries, mutations and SSR                 |    10 |
| [ADV](#adv)         | Advanced chunk/session transfer orchestration           |    12 |
| [CTRL](#ctrl)       | Transfer controls, progress and local lifetime          |    10 |
| [RESUME](#resume)   | Checkpoints, recovery, retries and integrity            |    15 |
| [SIGN](#sign)       | Presigned destinations and S3-compatible recipes        |    10 |
| [SEC](#sec)         | Ordinary origin and redirect security                   |     8 |
| [HARD](#hard)       | Lifecycle, performance and regression probes            |     9 |
| [TYPE](#type)       | Editor and declaration contracts                        |    10 |
| [HIST](#hist)       | Pre-v1 history and migration checks                     |    11 |
| [LAR](#lar)         | Laravel/PostgreSQL environment manual readiness         |    20 |
| [JOURNEY](#journey) | Cross-feature user journeys                             |    10 |

<a id="pkg"></a>

## Package and consumer boundaries — PKG

Sources: [public entry points](public-api.md), [facade tests](../tests/facade/), [consumer verification](../scripts/).

- [ ] **PKG-001 — Install the actual artifact** · `P/N`
  - Do: Build and pack the checkout, install the tarball in a clean ESM consumer, and call one inline-mocked resource using `apixa`.
  - Expect: The consumer runs without workspace aliases or private package installation; the tested commit/artifact is recorded.

- [ ] **PKG-002 — Core without framework peers** · `P/N`
  - Do: Install only `apixa`, import `apixa` and `apixa/core`, and execute a mock read.
  - Expect: No React/TanStack installation or module evaluation is needed for Core/Mocking usage.

- [ ] **PKG-003 — Public import ownership** · `P/E`
  - Do: Import the documented symbols from each public entry, then try an internal source path and a removed `apixa/tanstack-query` path.
  - Expect: Documented imports resolve with declarations; private/removed paths are not promoted into the public contract.

- [ ] **PKG-004 — Specialized exports stay specialized** · `P/E`
  - Do: Try a Core-only helper through its documented specialized entry and compare the curated root export list.
  - Expect: The specialized entry works; the root surface matches the contract rather than accidentally exposing every internal helper.

- [ ] **PKG-005 — React peers and one cache** · `P/R`
  - Do: Install supported React and TanStack peers; construct a QueryClient through the advanced entry and use it with the main React entry.
  - Expect: Hooks, controllers and hydration see the same client/cache; missing peers produce an actionable failure only when framework integration is used.

- [ ] **PKG-006 — SSR entry boundary** · `P/R`
  - Do: Import `apixa/react/advanced` in a server module, and mount hooks from `apixa/react` in a client component.
  - Expect: The advanced entry is server-safe; the main entry retains its client boundary and no duplicate QueryClient implementation appears.

- [ ] **PKG-007 — Dataset import loading** · `P/N/B`
  - Do: Compare a root `loadDataset` call, one dataset subpath and the datasets barrel in the consumer's module/network/bundle output.
  - Expect: Loading matches the documented lazy/subpath/barrel tradeoffs; importing Core does not eagerly load all datasets.

- [ ] **PKG-008 — Tarball exclusions** · `P/N`
  - Do: Inspect `npm pack --dry-run --ignore-scripts --json` and package contents.
  - Expect: No Laravel source, vendor, private environment, playground uploads or private workspace dependency is distributed.

- [ ] **PKG-009 — Runtime and module support** · `P/N`
  - Do: Run the packed smoke consumer under Node 22 and 24; repeat relevant checks in the documented edge consumers.
  - Expect: Supported ESM entry points work; failures are recorded per runtime instead of assuming Node proves browser/Edge support.

<a id="cfg"></a>

## API construction and configuration — CFG

Sources: [Core conventions](conventions.md), [configuration tests](../tests/core/config-merge.test.ts), [defineApis tests](../tests/core/define-apis.test.ts).

- [ ] **CFG-001 — Smallest useful client** · `M/E`
  - Do: Define one path-only resource with an inline mock array; inspect methods and await a read.
  - Expect: Construction sends nothing; default methods are available and the call returns a native Promise with the expected rows.

- [ ] **CFG-002 — Explicit entity metadata** · `E/M`
  - Do: Define the same resource using `defineApi<AppApi>()(config)` with resource-only entity/query/list metadata.
  - Expect: Resource types determine arguments and results; root transport/configuration keys do not become resource clients.

- [ ] **CFG-003 — Supported definition shapes** · `M/E`
  - Do: Try the documented direct inferred form and curried form, including the documented resource configuration layout.
  - Expect: Both supported forms preserve inference and behavior; do not mix an obsolete example's shape into a new assertion.

- [ ] **CFG-004 — Missing or invalid resource path** · `T/E`
  - Do: Construct resources with absent, empty/invalid or non-string paths according to configuration validation cases.
  - Expect: Malformed resources fail clearly before transport; an unrelated configuration key is not silently treated as a working resource.

- [ ] **CFG-005 — Merge precedence** · `T`
  - Do: Set conflicting scalar options at API, resource, operation and call levels; inspect the final request.
  - Expect: The nearest supported override wins, while independent settings survive; record the result separately for headers, retry and timeout.

- [ ] **CFG-006 — Lazy dynamic headers** · `T`
  - Do: Use an async header provider backed by a changing synthetic token; perform two calls.
  - Expect: Each request resolves the current provider value; construction does not freeze a stale token or send a request.

- [ ] **CFG-007 — Independent clients** · `M/T`
  - Do: Create two clients, including with `defineApis`, with different base URLs, headers and stores; mutate one.
  - Expect: Origins, credentials, operations and mock state remain independent; errors identify a failing aggregated client.

- [ ] **CFG-008 — Immutable aggregation and metadata** · `T/E`
  - Do: Inspect a `defineApis` result and `getOperationMetadata(resource)` without invoking methods.
  - Expect: The aggregation/metadata follows the documented frozen, non-enumerable shape; metadata inspection performs no I/O.

- [ ] **CFG-009 — Relative URL environment** · `N/B`
  - Do: Use a browser-relative base URL in a browser, then attempt a live request in Node without a browser origin.
  - Expect: The browser resolves against its origin; Node gives a clear error rather than guessing an origin. A mocked call still needs no network.

- [ ] **CFG-010 — No hidden Core cache** · `T/H`
  - Do: Call the same direct Core read twice with no framework cache or mocking and count dispatches.
  - Expect: Core executes each ordinary request; query deduplication/staleness belongs to the chosen TanStack consumer rather than a silent global cache.

- [ ] **CFG-011 — Construction does not mutate config** · `M/T`
  - Do: Freeze or compare root/resource/operation config objects before and after client construction and use.
  - Expect: Selection expansion, header resolution and validation do not alter caller configuration or contaminate another client built from it.

<a id="select"></a>

## Operation selection and classification — SELECT

Sources: [selection](conventions.md#selection), [operation selection tests](../tests/core/operation-selection.test.ts), [classification tests](../tests/core/operation-classification.test.ts).

- [ ] **SELECT-001 — Thirteen defaults** · `M/E`
  - Do: Create a path-only resource and inspect all seven read and six write names listed in the conventions table.
  - Expect: All thirteen current builtins exist (`getBySlug`, `upsert`, and `search` were removed in v3); generated names do not prove the backend implements their routes.

- [ ] **SELECT-002 — Disable then re-enable** · `M/E`
  - Do: Set `operations: ["getAll", "create"]`.
  - Expect: Only selected builtins appear in runtime/types; explicit entries have the final say.

- [ ] **SELECT-003 — Preset and explicit list** · `M/E`
  - Do: Select `"read"` on one resource and a list of write operations on another.
  - Expect: Each resource exposes only its selected methods; selection is not backend authorization.

- [ ] **SELECT-004 — Preset and overrides** · `M/E`
  - Do: Combine a preset with enabled and disabled named operations, then reorder object properties.
  - Expect: Named entries override the selected preset regardless of property order.

- [ ] **SELECT-005 — Root selection versus resource** · `M/E`
  - Do: Set root selection defaults on `defineMockApi` and override them on one resource while leaving another unchanged.
  - Expect: Each resource gets its resolved selection; one override does not mutate the root or its sibling.

- [ ] **SELECT-006 — Partial override keeps siblings** · `T/E`
  - Do: Override only `getAll.path` or one builtin's headers and inspect another builtin.
  - Expect: Unmentioned builtins remain enabled with their own conventions and inherited configuration.

- [ ] **SELECT-007 — Custom operation kind** · `T/E`
  - Do: Add declarative and function custom reads/writes, omitting `kind` on a declarative operation.
  - Expect: HTTP methods determine declarative classification; function operations require explicit kind.

- [ ] **SELECT-008 — Kind and method disagreement** · `T/E`
  - Do: Declare a custom read using POST, a custom write using GET, and an explicit kind on a builtin.
  - Expect: Inconsistent explicit kinds fail validation; builtin HTTP method overrides determine their classification.

- [ ] **SELECT-009 — Dynamic booleans and autocomplete** · `E`
  - Do: Compare literal selections with conditional presets and request editor completions.
  - Expect: Literal selections give exact methods; conditionally present methods are optional; known names are suggested alongside valid custom keys.

<a id="ops"></a>

## All builtin operations — OPS

Sources: [current builtin table](conventions.md#operation-customization), [builtin tests](../tests/core/operations-builtins.test.ts), [independence tests](../tests/core/operation-independence.test.ts). Run wire checks only against corresponding author-owned routes.

- [ ] **OPS-001 — List records** · `M/T/H`
  - Do: Call `getAll()` on a known three-row resource and inspect method, URL and payload.
  - Expect: GET targets the collection and returns the configured list representation; no implicit write or hidden pagination occurs.

- [ ] **OPS-002 — Read a record** · `M/T/H`
  - Do: Call `getById` with a known ID and a missing ID.
  - Expect: The known record resolves through its own detail path; missing-record behavior is classified according to mock/HTTP mode.

- [ ] **OPS-003 — Create a record** · `M/T/H`
  - Do: Call `create` with an entity-derived input; fetch the created record again.
  - Expect: POST targets the collection; the response and persistent/mock state reflect one accepted creation.

- [ ] **OPS-004 — Update a record** · `M/T/H`
  - Do: Call `update(id, { body })` and inspect PUT request plus subsequent read.
  - Expect: PUT targets that ID with the intended body; only the intended record changes under the backend's update contract.

- [ ] **OPS-005 — Delete a record** · `M/T/H`
  - Do: Call `delete(id)`, inspect DELETE, then read the record and its sibling.
  - Expect: Only the selected record is removed; empty response handling works and the sibling survives.

- [ ] **OPS-006 — Removed builtin: read by slug (custom replacement)** · `M/T/H`
  - Do: Verify `getBySlug` is no longer a default builtin in v3, and replace it when needed with a custom `GET /slug/:slug` operation called via `{ params: { slug } }`.
  - Expect: `getBySlug` is absent by default; the custom route encodes `:slug` and returns the matching row.

- [ ] **OPS-007 — Partial update** · `M/T/H`
  - Do: Call `patch(id, { body: partial })` changing one field.
  - Expect: PATCH uses the detail path; a mock retains unspecified fields, and a real server is assessed against its declared patch contract.

- [ ] **OPS-008 — Removed builtin: upsert (custom replacement)** · `M/T/H`
  - Do: Verify `upsert` is no longer a default builtin in v3, and use an explicit custom PUT operation when server upsert semantics exist.
  - Expect: `upsert` is absent by default; custom write uses the configured PUT contract without inventing implicit creation-on-PUT.

- [ ] **OPS-009 — Count matches** · `M/T/H`
  - Do: Count all rows and a known filtered subset.
  - Expect: GET uses the count operation's own definition; the reported count matches the selected universe rather than a sliced list page.

- [ ] **OPS-010 — Removed builtin: search (use getAll query or custom)** · `M/T/H`
  - Do: Verify `search` is no longer a default builtin in v3, and query filtered/searched records via `getAll({ query })` or an explicit custom operation.
  - Expect: `search` is absent by default; filtering uses explicit query parameters or a custom operation contract.

- [ ] **OPS-011 — Create many** · `M/T/H`
  - Do: Call `createMany` with two distinct inputs, then inspect state.
  - Expect: POST targets `/bulk` by default; both inputs are encoded correctly. Do not infer server batch atomicity without a backend guarantee.

- [ ] **OPS-012 — Delete many** · `M/T/H`
  - Do: Call `deleteMany` with selected IDs and inspect the outgoing body.
  - Expect: DELETE targets `/bulk` with its ID array body; only intended records are deleted under the mode's documented behavior.

- [ ] **OPS-013 — Get many independently** · `M/T/H`
  - Do: Disable/override `getAll`, then call `getMany` with selected IDs and inspect repeated ID query values.
  - Expect: The operation uses its own resolved request and supports bare/paginated list handling; it does not secretly delegate to `getAll`.

- [ ] **OPS-014 — Exists without masking errors** · `M/T/H`
  - Do: Return success, 404, then 500 for `exists(id)`; separately override `getById`.
  - Expect: Success maps to true and 404 to false; other failures remain failures. Its request is independent of the `getById` override.

- [ ] **OPS-015 — Find first** · `M/T/H`
  - Do: Disable/override `getAll`, then make `findFirst` receive an empty list, a nonempty list and the supported page envelope.
  - Expect: It returns null or the first record using its own request/definition; disabling another read does not break it.

- [ ] **OPS-016 — Dynamic getBy** · `M/T/H`
  - Do: Try a flat field/value lookup, a documented path template, and resource-level path parameters.
  - Expect: Arguments map to the intended path/query; custom prefixes/templates work and origin protection still applies.

- [ ] **OPS-017 — Specialized body mapping limits** · `T/E`
  - Do: Change a specialized read's method using a compatible kind, and try unsupported `hasBody: true` on `getMany`/`findFirst`/`exists`.
  - Expect: Documented ID/query mappings survive allowed overrides; no body is invented where no mapping exists and unsupported configuration is rejected.

<a id="fn"></a>

## Function operations and custom requests — FN

Sources: [custom operations](../packages/core/README.md#custom-operations), [customization tests](../tests/core/operations-customization.test.ts), [operation security tests](../tests/core/operation-security.test.ts).

- [ ] **FN-001 — Declarative business action** · `T/H/E`
  - Do: Configure a custom `archive` write with an explicit method/path and call it with its generated arguments.
  - Expect: The custom name coexists with builtins and follows its own wire contract; no convention overwrites it.

- [ ] **FN-002 — Function owns its arguments** · `T/E`
  - Do: Define `{ kind, run }` with a nonstandard argument tuple and a distinctive result.
  - Expect: Call inference and runtime preserve that tuple and native Promise result; Core does not insert guessed arguments.

- [ ] **FN-003 — Builtin function override** · `T/E`
  - Do: Replace a builtin with a supported function override and inspect metadata and calls.
  - Expect: The custom implementation wins; its builtin kind is inherited and its argument ownership is reflected in metadata.

- [ ] **FN-004 — Composed ctx.request pipeline** · `T`
  - Do: Make a function operation call `ctx.request` with its own path/body and inherited headers, timeout and metadata.
  - Expect: The ordinary request pipeline runs; serialization, middleware and error behavior are preserved rather than bypassed.

- [ ] **FN-005 — Per-request kind validation** · `T/E`
  - Do: Inside an ordinary read function attempt a write request, and inside a write function attempt a read request.
  - Expect: Mismatched ordinary requests fail before dispatch. Mixed-kind protocol steps are reserved for the advanced transfer context.

- [ ] **FN-006 — Multiple requests and failure** · `T`
  - Do: Have an operation perform two valid requests; make the second fail.
  - Expect: The operation rejects predictably; the first server-side effect is not claimed to roll back across HTTP calls.

- [ ] **FN-007 — Custom mock behavior is explicit** · `M`
  - Do: Give a declarative custom operation a mock handler, then remove that handler and call it again.
  - Expect: The supplied handler runs only for a mocked resource; missing custom behavior fails instead of guessing from its URL.

- [ ] **FN-008 — False and unsupported true** · `E/M`
  - Do: Remove a builtin with `false`, use `true` for another builtin, and try `true` alone for an unknown custom name.
  - Expect: Removal/enabling behave as documented; a custom implementation cannot be created from a boolean alone.

<a id="url"></a>

## URLs, path parameters and query strings — URL

Sources: [HTTP security tests](../tests/core/http-security.test.ts), [HTTP tests](../tests/core/http.test.ts), [Core conventions](conventions.md).

- [ ] **URL-001 — Base and path joining** · `T/H`
  - Do: Vary trailing/leading slashes on base URL, resource path and operation path.
  - Expect: The final URL is deterministic and keeps the intended base path; slashes are not duplicated or dropped incorrectly.

- [ ] **URL-002 — Path parameter encoding** · `T/H`
  - Do: Use values with spaces, slash, question mark, hash, percent and Unicode.
  - Expect: Values are encoded as parameter data and cannot inject another path, query or fragment.

- [ ] **URL-003 — Nested resource parameters** · `T/E`
  - Do: Use an organization-scoped resource and call list/detail/specialized methods with their documented positional or named parameters.
  - Expect: Resource and operation parameters are both required in the correct signature and appear in the intended URL.

- [ ] **URL-004 — Query scalar preservation** · `T/H`
  - Do: Send `0`, `false`, empty string, null/undefined and Unicode query values; inspect the documented serializer output.
  - Expect: Falsy meaningful values survive; omitted/null behavior matches the serializer contract and no literal accidental `undefined` appears.

- [ ] **URL-005 — Array formats** · `T/H`
  - Do: Send the same array using `repeat`, `comma` and `brackets` query formats.
  - Expect: The wire matches the selected format and the backend parser sees the intended sequence; empty-array behavior is recorded.

- [ ] **URL-006 — Custom serializer** · `T`
  - Do: Provide `querySerializer`, then use array/scalar values and an existing query string.
  - Expect: The serializer is invoked as documented, its encoding is retained, and query joining does not corrupt the URL.

- [ ] **URL-007 — Safe absolute operation URL** · `T/H`
  - Do: Use an absolute operation URL on the configured API origin, then one on a different port/scheme/host.
  - Expect: Same-origin usage works; the other origin is blocked before receiving credentials or a request.

- [ ] **URL-008 — Middleware rewritten destination** · `T`
  - Do: Rewrite a request URL once within the API origin and once outside it.
  - Expect: The final URL is validated after middleware; only the same-origin rewrite is sent.

- [ ] **URL-009 — Parameter and configuration failures** · `T/E`
  - Do: Omit required path arguments or supply invalid base URLs using the corresponding negative configuration examples.
  - Expect: The call/configuration fails clearly before an unintended request; TypeScript rejects invalid arity where it can know it.

<a id="body"></a>

## Bodies, headers and response envelopes — BODY

Sources: [headers tests](../tests/core/headers.test.ts), [transport tests](../tests/core/transport-fetch.test.ts), [response modes](../packages/core/README.md#file-downloads-and-binary-responses).

- [ ] **BODY-001 — Ordinary JSON remains ordinary** · `T/H`
  - Do: Create a binary-free entity with nested values and inspect request bytes/headers.
  - Expect: JSON encoding and existing behavior are preserved; file support does not silently force every write to multipart.

- [ ] **BODY-002 — Case-insensitive header merge** · `T/H`
  - Do: Supply conflicting header casing at each supported level, plus two unrelated headers.
  - Expect: Each logical header has the correct final value and independent headers survive; no duplicate case-variant credential header leaks.

- [ ] **BODY-003 — Accepted header forms** · `T/E`
  - Do: Try the documented header object, Headers instance, tuple form and async provider where supported.
  - Expect: Equivalent forms produce equivalent final headers and invalid values are caught consistently.

- [ ] **BODY-004 — Raw body representations** · `T/H`
  - Do: Send string, URLSearchParams, Blob, ArrayBuffer and caller-built FormData through appropriate custom writes.
  - Expect: Each reaches Fetch in its supported native representation; binary/special bodies are not JSON-stringified into empty objects.

- [ ] **BODY-005 — Method body defaults** · `T/H`
  - Do: Compare POST/PUT/PATCH body inference with bodyless reads and an explicit supported `hasBody` override.
  - Expect: Body defaults follow the method/operation contract and a disabled body is not accidentally serialized.

- [ ] **BODY-006 — Optional unknown custom body** · `T/E`
  - Do: Call a custom POST whose body is unknown without supplying a body, then with one.
  - Expect: The supported optional-body signature works and does not invent a required entity payload.

- [ ] **BODY-007 — Full response envelope** · `T/H/E`
  - Do: Call a direct client operation normally and with `{ full: true }`.
  - Expect: The ordinary call unwraps data; the full call preserves typed data, status and Headers without losing error classification.

- [ ] **BODY-008 — Empty successful responses** · `T/H`
  - Do: Return 204 and 205 in JSON/text/Blob/ArrayBuffer/stream modes.
  - Expect: JSON and stream yield null; text/binary modes yield the documented empty representations, with no parse failure.

- [ ] **BODY-009 — Explicit parsing choice** · `T/H`
  - Do: Return the same bytes using JSON, text, Blob and ArrayBuffer modes, then set an invalid responseType.
  - Expect: The selected mode controls parsing/inference; invalid configuration fails rather than silently falling back.

- [ ] **BODY-010 — Live pagination is explicit** · `T/H/E`
  - Do: Compare getAll without pagination and with the documented page/cursor option using a matching backend response; inspect the result envelope.
  - Expect: Unconfigured responses retain their existing representation; enabled pagination preserves the supported envelope and never implies an unimplemented backend paging service.

- [ ] **BODY-011 — Live list slice boundary** · `T/H`
  - Do: Apply a resource slice to an array list response, then return a non-array payload and read a detail/count.
  - Expect: The list array is capped as documented while non-array responses and unrelated operations remain unaffected; a slice is not backend pagination.

- [ ] **BODY-012 — Custom transport seam** · `T/E`
  - Do: Inject a small conforming Transport, inspect received method/headers/body/signal and return a controlled response, then try the default Fetch transport separately.
  - Expect: Both follow the public transport contract; the seam needs no framework/mock package and errors retain the appropriate public classification.

<a id="key"></a>

## Key transforms and structural data safety — KEY

Sources: [transform tests](../tests/core/transforms.test.ts), [prototype safety](../tests/core/mock-prototype-safety.test.ts).

- [ ] **KEY-001 — Request and response conventions** · `T/H/E`
  - Do: Configure snake_case requests and camelCase responses; send nested body and query keys.
  - Expect: Backend keys and public result types use their configured conventions while values remain unchanged.

- [ ] **KEY-002 — Recursive arrays and objects** · `T`
  - Do: Transform nested objects, arrays of objects, null and primitives; compare the untouched original.
  - Expect: Only eligible keys change recursively; inputs are not mutated and primitive contents are not rewritten.

- [ ] **KEY-003 — Special object preservation** · `T`
  - Do: Include Date, Blob, File and a custom class instance in a transform exercise.
  - Expect: Special objects retain identity/bytes and are not treated as plain JSON records.

- [ ] **KEY-004 — Directional precedence** · `T/E`
  - Do: Override response transformation at resource/operation level while inheriting request transformation.
  - Expect: Each direction resolves independently; changing one does not erase the other or affect sibling operations.

- [ ] **KEY-005 — Collision detection** · `T`
  - Do: Transform objects containing both `user_id` and `userId` into camelCase, including a nested collision.
  - Expect: A TransformError identifies the conflict rather than silently losing a value; no ambiguous transformed request is sent.

- [ ] **KEY-006 — No transform by default** · `M/T`
  - Do: Call equivalent resources with no transforms configured.
  - Expect: Names and values remain unchanged; there is no default backend naming convention.

- [ ] **KEY-007 — Mock and explicit metadata parity** · `M/E`
  - Do: Compare a mock-inferred entity and an explicitly declared entity under the same public transform convention.
  - Expect: Read/result/input types match their documented public shape, with no forced consumer casts.

- [ ] **KEY-008 — Prototype-sensitive keys** · `M/T`
  - Do: Use own data properties such as `__proto__`, `constructor` and `prototype` in disposable record/body/query objects.
  - Expect: No prototype pollution or inherited-property matching occurs; supported data handling follows the explicit own-property rules.

<a id="mid"></a>

## Middleware and replay — MID

Sources: [middleware tests](../tests/core/middleware.test.ts), [polish/replay tests](../tests/core/v1-polish.test.ts), [file pipeline tests](../tests/core/file-validation-pipeline.test.ts).

Current middleware uses `middleware: MiddlewareHooks` (`{ onRequest?, onResponse?, onError? }` hook arrays) across root, resource, and operation levels, as defined in [public middleware types](../packages/core/src/types/middleware.ts). Around-style `(ctx, next)` and legacy `requestMiddleware` / `responseMiddleware` properties (as well as array-of-objects `middleware: [...]`) were removed in v3; negative tests reject those shapes.

- [ ] **MID-001 — Ordered stage hooks** · `T`
  - Do: Install `middleware: { onRequest, onResponse, onError }` hook lists at root, resource and operation levels; record their order and per-call metadata.
  - Expect: Each stage runs root → resource → operation in array order; request/response callbacks receive `ApiRequest` / `ApiResponse`, and returning void keeps the current value.

- [ ] **MID-002 — Header enrichment and response mapping** · `T`
  - Do: Add a request header and map a successful response without changing its envelope contract.
  - Expect: The transport sees the header and the caller sees the intended mapping with status/headers preserved.

- [ ] **MID-003 — Explicit error recovery** · `T`
  - Do: In middleware.onError, return undefined, return an explicit fallback value, and throw a replacement error in separate runs; observe any later handler.
  - Expect: Undefined keeps the failure, a non-undefined value recovers the call, and a thrown replacement reaches later handlers; ordinary recovery does not send an automatic second request.

- [ ] **MID-004 — Refresh with guarded replay** · `T/H`
  - Do: Use the existing error-middleware replay recipe; refresh a synthetic expired token and replay once.
  - Expect: Fresh headers are resolved, the logical write key is preserved where configured, and a replay cannot recursively replay forever.

- [ ] **MID-005 — Thrown middleware error** · `T`
  - Do: Throw before dispatch and after a response in separate runs.
  - Expect: Before dispatch sends nothing; after-response failure rejects the call without claiming already committed backend effects were undone.

- [ ] **MID-006 — Binary-safe observation** · `T/H`
  - Do: Log body type/size from middleware during an upload/download without reading a live stream.
  - Expect: File/Blob/FormData/stream values retain their bytes and lifecycle; observation does not consume or JSON-clone them.

- [ ] **MID-007 — Transform then validation** · `T/M`
  - Do: Use the documented request middleware stage to change a logical file body so it violates a configured rule.
  - Expect: Validation evaluates the effective logical body before sending/managed commit; no invalid upload slips through because the original was valid.

- [ ] **MID-008 — Metadata isolation** · `T`
  - Do: Send distinct per-call metadata through concurrent requests and error paths.
  - Expect: Each context retains the correct call's metadata; one call cannot overwrite another's diagnostics.

- [ ] **MID-009 — One stage pass per logical call** · `T`
  - Do: Enable transport retries, fail once and succeed, counting request/response/error stage executions; repeat with one explicit error-context replay.
  - Expect: Ordinary retries reuse the logical request rather than rerunning request hooks per attempt; explicit replay re-enters the whole call once with fresh headers and its documented fresh timeout budget.

- [ ] **MID-010 — Reject obsolete middleware shape** · `E/T`
  - Do: Try an old around-style middleware array or malformed callback/result in a disposable negative case.
  - Expect: Current configuration rejects unsupported shape/results clearly; do not copy stale `(ctx, next)` examples as current syntax.

<a id="err"></a>

## Error classification and diagnostics — ERR

Sources: [error contract](public-api.md), [file error matrix](../tests/core/file-error-matrix.test.ts), [validation errors](../tests/core/validation-errors.test.ts).

- [ ] **ERR-001 — HTTP failure with body** · `T/H`
  - Do: Return 422 JSON and 500 text from separate ordinary operations.
  - Expect: HttpError retains status and the parsed permitted error data; callers can identify it with the public guards.

- [ ] **ERR-002 — Malformed JSON success** · `T/H`
  - Do: Return invalid JSON with a successful status in JSON mode.
  - Expect: ParseError rejects the promise; malformed data does not become a silent success or an empty object.

- [ ] **ERR-003 — Network failure** · `T/H`
  - Do: Disconnect/refuse the selected development endpoint before a valid HTTP response.
  - Expect: The error is classified as NetworkError rather than fabricated HTTP status; retryability follows policy.

- [ ] **ERR-004 — Abort versus timeout** · `T/H`
  - Do: Abort one slow call with its signal and let another exceed timeout.
  - Expect: Caller cancellation is AbortError; deadline expiration is TimeoutError; neither reports successful data.

- [ ] **ERR-005 — Serialization versus validation** · `T/M`
  - Do: Force binary data into JSON mode, then separately violate a file rule.
  - Expect: SerializationError and ValidationError remain distinguishable; neither dispatches an invalid write.

- [ ] **ERR-006 — Configuration and security errors** · `T/E`
  - Do: Try invalid config and a blocked destination.
  - Expect: The error family/code describes the actual failure before dispatch; it is not hidden as an unrelated network failure.

- [ ] **ERR-007 — Error guard and fields** · `T/E`
  - Do: Inspect `code`, `attempt`, `retryable` and the applicable public guards across representative failures.
  - Expect: Public class identity/guards work through packed subpaths and fields reflect the actual failing attempt.

- [ ] **ERR-008 — Oversized HTTP error body** · `T/H`
  - Do: Return a failing HTTP status with an error body beyond the configured response cap.
  - Expect: The failure remains HttpError with its status; oversized data is dropped rather than buffered or reclassified as success.

- [ ] **ERR-009 — Secrets and violations** · `T/H`
  - Do: Use synthetic auth, signed-query and file-name markers, then inspect serialized/logged error metadata and violation paths.
  - Expect: Library-provided sanitized surfaces do not expose those secrets or file contents; rule paths/limits remain useful.

- [ ] **ERR-010 — Recovery after a failure** · `M/T/H`
  - Do: After each representative rejected call, perform a clean valid call with a fresh signal.
  - Expect: No stuck active state, consumed shared body, stale timer or poisoned mock draft prevents the next call.

<a id="rel"></a>

## Retries, cancellation and request lifetime — REL

Sources: [reliability tests](../tests/core/reliability.test.ts), [retry/timeout tests](../tests/core/retry-timeout.test.ts), [download reliability](../tests/core/download-reliability.test.ts).

- [ ] **REL-001 — Safe retry defaults** · `T/H`
  - Do: Enable retries and fail GET/HEAD once with a configured retryable status; repeat with a write lacking explicit retry permission.
  - Expect: Safe reads retry within policy; writes do not gain implicit replay permission merely because retries are enabled.

- [ ] **REL-002 — Retryable versus terminal status** · `T`
  - Do: Compare 408, 429 and a 5xx with 400/401/404 using the configured/default status policy.
  - Expect: Only eligible failures retry and the final attempt/result/error is correct.

- [ ] **REL-003 — Attempts and backoff** · `T`
  - Do: Record dispatch times and attempt indexes for a fixed failure sequence; use bounded test delays.
  - Expect: Retries obey configured count/backoff; `shouldRetry` is decided once per attempt and `onRetry` is not double-called.

- [ ] **REL-004 — Retry-After** · `T/H`
  - Do: Return both numeric and HTTP-date Retry-After values; compare enabled and disabled `respectRetryAfter`.
  - Expect: Delay handling follows policy, invalid values are handled safely, and the overall deadline still bounds waiting.

- [ ] **REL-005 — Nearest retry override** · `T`
  - Do: Enable root retries, then use resource/operation overrides and per-call `retry: false`.
  - Expect: The resolved override controls that call without mutating later calls or other resources.

- [ ] **REL-006 — Abort before dispatch** · `T/H`
  - Do: Pass an already-aborted signal.
  - Expect: No transport work or managed mock write begins; the promise rejects as cancellation.

- [ ] **REL-007 — Abort during backoff** · `T`
  - Do: Pause between eligible attempts, abort the signal and watch for later dispatches.
  - Expect: The pending wait ends and no further attempt starts.

- [ ] **REL-008 — Abort while reading response** · `T/H`
  - Do: Start a slow successful response body, then cancel before it finishes.
  - Expect: The body stops; no partial success escapes and no retry resurrects the cancelled call.

- [ ] **REL-009 — Overall timeout across work** · `T/H`
  - Do: Use slow middleware, transport/body read and retry backoff within one call.
  - Expect: The configured lifetime is enforced by the documented deadline; timers clean up after settlement.

- [ ] **REL-010 — Independent concurrent calls** · `T/H`
  - Do: Start two calls with separate signals; cancel only one while the other completes.
  - Expect: Cancellation and timeouts remain per call; the surviving call's data/state is unaffected.

- [ ] **REL-011 — Stream bodies are not replayed** · `T/H`
  - Do: Use a non-replayable ReadableStream request body and make the attempt fail.
  - Expect: Core does not retry by consuming the stream a second time or buffering it secretly.

- [ ] **REL-012 — Replayable multipart retry** · `T/H`
  - Do: Fail the first permitted upload attempt, then accept the next; compare decoded fields and file hashes.
  - Expect: Each attempt sends equivalent logical multipart data with a valid boundary and intact file bytes.

<a id="idem"></a>

## Idempotency and logical writes — IDEM

Sources: [idempotency usage](../packages/core/README.md#idempotency-keys), [retry tests](../tests/core/idempotency-retries.test.ts).

- [ ] **IDEM-001 — Opt-in write key** · `T/H`
  - Do: Enable idempotency on one declarative write and invoke it twice as separate logical calls.
  - Expect: Each call gets a fresh key; the same logical call retains its key across transport retries.

- [ ] **IDEM-002 — Caller-supplied key** · `T/H`
  - Do: Pass an explicit `idempotencyKey`, then repeat the logical operation deliberately using that key.
  - Expect: The supplied value wins and is sent consistently; backend deduplication is checked separately if implemented.

- [ ] **IDEM-003 — Existing header precedence** · `T`
  - Do: Set the configured key header explicitly while a generator is present.
  - Expect: The caller's existing header wins; middleware sees the actual selected key.

- [ ] **IDEM-004 — Custom header and generator** · `T/E`
  - Do: Configure a custom header/generator and call `createIdempotencyKey` through its documented specialized entry.
  - Expect: Generated values/header names match the operation's configuration and independent logical calls remain distinct.

- [ ] **IDEM-005 — Invalid placements** · `T/E`
  - Do: Set idempotency on a read or function operation, and pass a call key to a disabled operation.
  - Expect: The invalid combinations fail clearly rather than silently ignoring a promise of idempotency.

- [ ] **IDEM-006 — Framework retry identity** · `R/T/H`
  - Do: Make a mutation retry the whole Core call after a transient failure.
  - Expect: One mutation invocation reuses its logical key across TanStack retries and nested transport attempts; a new invocation uses another key.

- [ ] **IDEM-007 — Middleware replay identity** · `T/H`
  - Do: Trigger one error-middleware replay of an idempotent write.
  - Expect: The replay retains the logical key rather than appearing to the backend as a new independent write.

- [ ] **IDEM-008 — Server responsibility** · `H`
  - Do: Against an author-built deduplication endpoint, send two concurrent writes with the same key and inspect stored results.
  - Expect: The observed deduplication follows that endpoint's contract; a header alone is not recorded as proof of exactly-once backend execution.

<a id="mock"></a>

## Core mocked resources — MOCK

Sources: [Core mock usage](../packages/mocking/README.md#mocking-a-core-resource), [engine tests](../tests/core/mock-engine.test.ts), [custom handlers](../tests/core/mock-custom-operations.test.ts).

- [ ] **MOCK-001 — Inline records never fetch** · `M/T`
  - Do: Use `mock: rows` with a transport that records or rejects all calls; perform reads and writes.
  - Expect: Mock behavior works with zero network/transport dispatches, even when the configured base URL is unreachable.

- [ ] **MOCK-002 — Provider loaded once** · `M`
  - Do: Use a counted async data provider; start concurrent first reads, then read again.
  - Expect: One client initialization supplies a consistent store; repeated calls do not re-run the provider unnecessarily.

- [ ] **MOCK-003 — Named dataset registration** · `M/P`
  - Do: Call a named dataset without register, then repeat in a fresh consumer importing `apixa/mocking/register` once.
  - Expect: The first failure explains the missing loader; the registered consumer loads lazily without making Core depend on Mocking.

- [ ] **MOCK-004 — Load validation and retry recovery** · `M`
  - Do: Provide invalid rows, duplicate IDs or a failing provider; inspect state and then use a clean new client/provider.
  - Expect: Initialization fails clearly without exposing a half-loaded store; valid independent clients still work.

- [ ] **MOCK-005 — Snapshot and defensive reads** · `M`
  - Do: Mutate the original inline array after initialization and mutate nested data returned by a read.
  - Expect: Neither edit silently alters stored records; writes must go through the supported mutation path.

- [ ] **MOCK-006 — Flat filters and option typo** · `M/E`
  - Do: Filter through `query`, including an array of alternatives; try a top-level misspelled filter and nested path.
  - Expect: Supported flat matching works; TypeScript catches unknown option keys, and JS does not invent an undocumented filter language.

- [ ] **MOCK-007 — Page and cursor edges** · `M`
  - Do: Request valid pages/cursors, beyond-end pages, and negative/fractional/zero paging values where invalid.
  - Expect: Envelopes and empty pages are correct; invalid integers produce MOCK_INVALID_INPUT rather than undefined slicing behavior.

- [ ] **MOCK-008 — Slice versus seed** · `M`
  - Do: Compare `slice` with `seed.limit/offset`, then run count, lookup and a write outside the displayed slice.
  - Expect: Slice caps list results while the store remains whole; seed changes which records exist in the store.

- [ ] **MOCK-009 — Custom handler intent** · `M`
  - Do: Override a builtin's URL, disable a sibling, and invoke both a builtin and an explicit custom mock handler.
  - Expect: Builtins retain their own intent; custom behavior comes from its handler, never URL guessing or another builtin's presence.

- [ ] **MOCK-010 — Reset and client isolation** · `M`
  - Do: Mutate two clients seeded from the same source, reset one, then read both.
  - Expect: Only the selected client's state returns to its baseline; other clients and the source dataset stay unchanged.

<a id="data"></a>

## Dataset catalog and native Node loaders — DATA

Sources: [dataset access](../packages/mocking/README.md#dataset-access), [catalog tests](../tests/mocking/datasets-catalog.test.ts), [path security tests](../tests/mocking/dataset-loader-paths.test.ts).

- [ ] **DATA-001 — Discover and load catalog IDs** · `M/N/E`
  - Do: List dataset IDs, select one valid synthetic set and one external catalog set, then load by ID.
  - Expect: Valid IDs load typed readonly source records with consistent metadata; unknown IDs fail clearly without a network fallback.

- [ ] **DATA-002 — Six synthetic subpaths** · `P/N/E`
  - Do: Import users/products/companies/orders/posts/comments individually through their documented dataset subpaths.
  - Expect: Each import resolves the intended typed records from the packed artifact without relying on repository source aliases.

- [ ] **DATA-003 — Lazy versus eager loading** · `P/N/B`
  - Do: Observe loaded modules/chunks before and after `loadDataset`, and compare the barrel import.
  - Expect: The root loader is lazy; the known native-ESM/esbuild barrel evaluation limitation is recorded rather than mistaken for a leak.

- [ ] **DATA-004 — Source sharing and store copies** · `M/N`
  - Do: Load one dataset twice, create two stores, and mutate a returned/store record.
  - Expect: Module-cached source remains readonly/shared; writes and returned-copy edits do not contaminate other stores or catalog data.

- [ ] **DATA-005 — Seed window boundaries** · `M`
  - Do: Use limit/offset at the beginning, end and beyond the dataset; try invalid settings using documented validation rules.
  - Expect: The seed universe is predictable; excluded rows cannot be found or modified by operations on that store.

- [ ] **DATA-006 — Filesystem catalog layout** · `N`
  - Do: Point the Node loader at a disposable valid `meta.json`/`data.json` catalog, then an absent/incomplete layout.
  - Expect: Valid local data loads without HTTP; invalid catalog discovery/load follows the documented empty-list/error behavior.

- [ ] **DATA-007 — Path containment** · `N`
  - Do: Try traversal, encoded traversal/separators, absolute and escaped/symlink paths using the security test patterns in a disposable directory.
  - Expect: No read escapes the permitted catalog root; rejection happens before unrelated filesystem data is accessed.

- [ ] **DATA-008 — Browser-safe entry separation** · `P/B`
  - Do: Bundle ordinary Mocking/dataset imports, then inspect for Node built-ins; use the Node entry only in Node.
  - Expect: Browser-safe imports do not drag in filesystem utilities; Node-only behavior stays on its explicit subpath.

<a id="adapt"></a>

## Standalone defineMockApi adapter — ADAPT

Sources: [adapter usage](../packages/mocking/README.md#definemockapi), [adapter structure tests](../tests/mocking/mock-api-structure.test.ts), [file storage tests](../tests/mocking/mock-file-storage.test.ts).

- [ ] **ADAPT-001 — Independent standalone client** · `M/E`
  - Do: Construct `defineMockApi({ resources: ... })` from a known catalog dataset and use a read and write.
  - Expect: The adapter works without a live base URL or transport and preserves catalog-derived entity types.

- [ ] **ADAPT-002 — Adapter filter signature** · `M/E`
  - Do: Call adapter `getAll({ page, pageSize, field })`, then compare a Core mock using `getAll({ query: ... })`.
  - Expect: Each uses its own documented signature; do not assume the adapter and Core accept identical argument objects.

- [ ] **ADAPT-003 — Pagination compatibility** · `M`
  - Do: Use adapter pagination `true`, `page` and `cursor`; try Core pagination `true` separately.
  - Expect: Adapter compatibility alias works where documented; Core rejects its unsupported boolean form.

- [ ] **ADAPT-004 — Selection parity** · `M/E`
  - Do: Use root/resource operation settings, groups and individual overrides on the adapter.
  - Expect: Selection precedence matches the shared engine; returned method presence and types agree.

- [ ] **ADAPT-005 — Adapter callback context** · `M/E`
  - Do: Implement one callback using typed rows/defaults/fail and read-only files; try an HTTP-shaped operation.
  - Expect: Supported callback behavior works; HTTP route configurations are rejected instead of being treated as adapter logic.

- [ ] **ADAPT-006 — Original and reset baselines** · `M`
  - Do: Use `mockFiles` and `resetMock` on adapter client/resource handles after a write.
  - Expect: The same per-client file/store engine is used; reset is isolated and the established MockApiError surface survives.

- [ ] **ADAPT-007 — Read and write error parity** · `M`
  - Do: Repeat missing-ID, invalid paging and file-validation cases through Core mocks and adapter mocks.
  - Expect: Equivalent operations have equivalent data semantics with their documented error mapping; shared ValidationError remains identifiable.

- [ ] **ADAPT-008 — Legacy adapter compatibility** · `M/E`
  - Do: Try the older documented flat adapter form in a disposable consumer and compare the resources form.
  - Expect: Documented compatibility works without promoting removed Core mock configuration forms into current usage.

<a id="file"></a>

## Native file inputs and operation coverage — FILE

Sources: [uploads](../packages/core/README.md#file-uploads), [file request tests](../tests/core/file-requests.test.ts), [file field typing](../tests/core/file-fields-types.test.ts).

- [ ] **FILE-001 — One native file** · `B/T/H/E`
  - Do: Declare a string-reference entity field in `fileFields`, choose a File, and call `create` without setting multipart manually.
  - Expect: The input accepts File/Blob, wire encoding is multipart, bytes survive, and the read model remains a string reference.

- [ ] **FILE-002 — Multiple native files** · `B/T/H/E`
  - Do: Declare a string-array reference field and send two distinct File values.
  - Expect: The derived array input and repeated file parts preserve both files and their order; read types remain reference arrays.

- [ ] **FILE-003 — Simple and advanced declarations** · `T/E`
  - Do: Compare `fileFields: ["avatar"]` with an advanced declaration and reject a misspelled entity field.
  - Expect: Valid forms infer correctly; unsupported entity field names fail in the typed definition.

- [ ] **FILE-004 — Create, update and patch** · `T/H`
  - Do: Send the same file-bearing logical entity through each supported single-entity write (`create`, `update`, `patch`).
  - Expect: Each operation preserves its method/path semantics and automatically serializes binary data; no special upload-only API is required.

- [ ] **FILE-005 — Bulk and custom writes** · `T/H`
  - Do: Send file-bearing `createMany` items, a declarative custom write and a function `ctx.request` body.
  - Expect: The same serialization pipeline handles them; batch bodies use documented item indexing rather than discarding files.

- [ ] **FILE-006 — Mixed file and reference update** · `M/T/H`
  - Do: Use an existing reference alongside a new file in a supported write, then update only an ordinary field.
  - Expect: Supported reference/native inputs keep their meaning; a binary-free update retains JSON behavior and does not erase unrelated references.

- [ ] **FILE-007 — FileList conversion** · `B/E`
  - Do: Take `input.files`, convert using `Array.from`, and pass the resulting array; inspect an unconverted FileList in the editor.
  - Expect: Documented native File-array inputs work without introducing a special form dependency or claiming FileList is an ordinary array.

- [ ] **FILE-008 — Plain Blob metadata** · `T/H`
  - Do: Upload a Blob without File metadata and inspect the resulting part type/name and bytes.
  - Expect: The documented fallback filename is used, bytes/MIME survive, and no File constructor is required merely to send a Blob.

- [ ] **FILE-009 — No file field switch for reads** · `T/H/E`
  - Do: Read a file-bearing resource and call a bodyless operation after configuring fileFields.
  - Expect: Read reference types and bodyless semantics remain intact; no multipart body is invented for GET/DELETE without a body contract.

<a id="multi"></a>

## Multipart serialization and backend compatibility — MULTI

Sources: [serialization rules](../tests/core/multipart-serialization.test.ts), [uploads](../packages/core/README.md#file-uploads).

- [ ] **MULTI-001 — Boundary owned by runtime** · `T/H/B`
  - Do: Supply a stale JSON or manual multipart Content-Type, then upload a file or caller-built FormData.
  - Expect: The serializer removes the conflicting Content-Type; Fetch creates a valid boundary that the server can parse.

- [ ] **MULTI-002 — Scalar semantics** · `T/H`
  - Do: Force multipart for a binary-free object containing strings, numbers, booleans, undefined and null.
  - Expect: Scalars follow documented string encoding; undefined is omitted; null is an empty part by default and obeys the omit override.

- [ ] **MULTI-003 — Nested objects** · `T/H`
  - Do: Send nested address/profile objects with one nested file.
  - Expect: Bracket notation identifies fields correctly and the file is binary, not a JSON object placeholder.

- [ ] **MULTI-004 — Array representations** · `T/H`
  - Do: Try scalar arrays with default, indexed and repeated notation, then an array of objects.
  - Expect: Selected array notation is correct; object arrays use indexes so values from separate items do not merge ambiguously.

- [ ] **MULTI-005 — File array representation** · `T/H`
  - Do: Upload two different files under one declared array field.
  - Expect: The field name repeats as documented; names, MIME types, byte contents and order are preserved.

- [ ] **MULTI-006 — Aliases and transformed keys** · `T/H`
  - Do: Alias a top-level file field, enable snake_case request transforms, and inspect every part name.
  - Expect: Aliases are applied verbatim at their documented level, binary values survive, and logical validation still addresses the original field.

- [ ] **MULTI-007 — JSON fields inside multipart** · `T/H`
  - Do: Configure a plain object as a JSON-encoded part, then attempt binary content inside that JSON field.
  - Expect: The ordinary object becomes one JSON part; binary-in-JSON fails explicitly before an ambiguous request is sent.

- [ ] **MULTI-008 — Operation format override** · `T/H`
  - Do: Force multipart without files; force JSON with a binary-free body; force JSON with a File.
  - Expect: The first two obey the backend override; binary-under-JSON rejects with SerializationError and sends nothing.

- [ ] **MULTI-009 — Unencodable structures** · `T`
  - Do: Try cycles, excessive depth, unsupported values and a nested invalid value using disposable inputs.
  - Expect: Serialization terminates with a useful path, does not hang, and does not leak payload contents in its error.

- [ ] **MULTI-010 — Caller input remains reusable** · `T`
  - Do: Freeze/compare a logical input before and after serialization and a permitted retry.
  - Expect: Serialization does not mutate the object, replace caller file values or leave a stale boundary on a later attempt.

<a id="down"></a>

## Downloads, response types and metadata — DOWN

Sources: [download usage](../packages/core/README.md#file-downloads-and-binary-responses), [response types](../tests/core/response-types.test.ts), [filename parsing](../tests/core/content-disposition.test.ts).

- [ ] **DOWN-001 — Byte-exact Blob download** · `B/T/H`
  - Do: Call a declared Blob read for known binary bytes, then compare size/type/content.
  - Expect: A Blob with the exact bytes is returned; no JSON parsing or key transformation corrupts it.

- [ ] **DOWN-002 — ArrayBuffer and text** · `T/H/E`
  - Do: Download a byte sequence as ArrayBuffer and UTF-8 data as text; inspect result types.
  - Expect: Binary values remain bytes and text decodes correctly; TypeScript follows the selected responseType.

- [ ] **DOWN-003 — Per-call response override** · `T/H/E`
  - Do: Declare one response type and choose another per call; compare explicit response metadata where present.
  - Expect: Runtime parsing follows the call override; the documented type precedence, including explicit metadata, is respected.

- [ ] **DOWN-004 — Headers and envelope** · `T/H/B`
  - Do: Use a direct `{ full: true }` download and inspect Content-Type, Content-Length and Content-Disposition.
  - Expect: Status and actual exposed headers remain accessible; missing headers are treated as absent, never invented.

- [ ] **DOWN-005 — Filename parsing edge cases** · `T/B`
  - Do: Parse quoted names, semicolons, escaped quotes, filename*, malformed encodings, paths and control characters.
  - Expect: Valid extended names take precedence, malformed extended forms fall back safely, unsafe path/control portions are removed, and absent input does not throw.

- [ ] **DOWN-006 — Download HTTP failure** · `T/H`
  - Do: Return JSON and text error responses from a Blob/ArrayBuffer operation.
  - Expect: The call throws HttpError with permitted parsed error data instead of returning a successful error-file Blob.

- [ ] **DOWN-007 — Binary bypasses list shaping** · `T/H`
  - Do: Apply list slice/toArray/transform settings to a binary-returning operation.
  - Expect: Binary output is not treated as an entity list or recursively transformed; bytes and type survive.

- [ ] **DOWN-008 — Mock download of stored bytes** · `M`
  - Do: Return a stored file through an explicit read-only handler in Blob/text/ArrayBuffer modes and inspect full headers.
  - Expect: Stored bytes and documented synthetic metadata are correct; a missing ref reports MOCK_NOT_FOUND.

- [ ] **DOWN-009 — Unsupported mock stream** · `M`
  - Do: Request a mocked stream response.
  - Expect: The documented MOCK_UNSUPPORTED error appears; no fabricated network stream/progress guarantee is reported.

- [ ] **DOWN-010 — Browser save lifecycle** · `B/H`
  - Do: Download using a caller-owned object URL/anchor flow, open or save it, then revoke the URL when done.
  - Expect: The file opens correctly and the consumer releases its object URL; Apixa is not assumed to manage the browser download UI.

<a id="prog"></a>

## Transfer progress and event meaning — PROG

Sources: [progress contract](../packages/core/README.md#transfer-progress-streaming-and-cancellation), [support tests](../tests/core/transfer-support.test.ts), [progress tests](../tests/core/download-progress.test.ts).

- [ ] **PROG-001 — Known download total** · `T/H/B`
  - Do: Observe a successful response with trustworthy Content-Length and several body chunks.
  - Expect: Start/progress/complete are ordered per direction/attempt, loaded is monotonic, and total reflects real supported evidence.

- [ ] **PROG-002 — Unknown total** · `T/H/B`
  - Do: Observe a response without usable length, including a streamed body.
  - Expect: Progress reports loaded bytes without inventing total or a percentage; the UI can show an indeterminate state.

- [ ] **PROG-003 — Retry resets observation** · `T/H`
  - Do: Fail an eligible attempt after some progress and then succeed.
  - Expect: A new attempt starts at zero with the correct index; failed-attempt bytes are not counted as server-confirmed success.

- [ ] **PROG-004 — Abort and timeout terminals** · `T/H`
  - Do: Cancel one transfer and time out another during body flow.
  - Expect: Each attempt has the correct abort/error terminal event and no later complete event for that failed attempt.

- [ ] **PROG-005 — Unsupported upload observation** · `B/N`
  - Do: Use `detectTransferSupport` and try observed Blob/FormData upload in each supported runtime.
  - Expect: The actual runtime's documented capability is reported; unsupported is explicit and no fake byte progress is emitted.

- [ ] **PROG-006 — Wire equivalence when observed** · `T/H`
  - Do: Send the same Blob/FormData with and without onTransfer; compare decoded bytes and headers.
  - Expect: Observation preserves the wire body and boundary; it does not buffer the entire upload solely to report progress.

- [ ] **PROG-007 — Observer callback throws** · `T/H`
  - Do: Make the progress observer throw while a valid transfer continues.
  - Expect: Observer failures do not replace the transfer's real result or leak active work; the lifecycle remains deterministic.

- [ ] **PROG-008 — Mock observation limits** · `M`
  - Do: Observe a sized mock binary/text download and an ordinary JSON read/upload.
  - Expect: Sized results use real available size; unsupported JSON/upload observation is identified and fixture initialization emits no network progress.

- [ ] **PROG-009 — Meaning of completion** · `H`
  - Do: Compare bytes handed to the transport, bytes received and a delayed backend processing acknowledgment.
  - Expect: UI distinguishes body consumption from server processing; observed upload bytes are never recorded as proof of remote persistence.

- [ ] **PROG-010 — Default observer override** · `T/H`
  - Do: Configure operation onTransfer, then provide a distinct per-call observer and compare a call without it.
  - Expect: The per-call observer wins as documented; callbacks are not silently duplicated and a call without observation avoids unnecessary instrumentation.

<a id="stream"></a>

## Streaming, cancellation after resolve and backpressure — STREAM

Sources: [stream lifecycle](../tests/core/stream-lifecycle.test.ts), [stream limits](../tests/core/stream-limits.test.ts), [counting](../tests/core/transfer-counting.test.ts).

- [ ] **STREAM-001 — Consume a live response** · `T/H/N/B`
  - Do: Request responseType stream and consume chunks into a caller-owned sink.
  - Expect: The promise supplies a live ReadableStream or documented null; chunks arrive without whole-body buffering.

- [ ] **STREAM-002 — Abort after promise resolution** · `T/H`
  - Do: Resolve a stream response, begin reading, then abort the original call signal.
  - Expect: The reader errors/stops even though the operation promise already resolved; cancellation still owns the body lifetime.

- [ ] **STREAM-003 — Timeout after promise resolution** · `T/H`
  - Do: Resolve headers quickly but keep the body flowing past the call deadline.
  - Expect: The stream errors with the deadline's TimeoutError; early header success does not disable the timer prematurely.

- [ ] **STREAM-004 — Reader cancellation** · `T/H`
  - Do: Read one chunk and call reader/stream cancel.
  - Expect: Upstream work ends and resources clean up; no complete-body success is fabricated.

- [ ] **STREAM-005 — Slow sink** · `T/H/N`
  - Do: Consume chunks slowly while recording queued buffers and upstream pulls.
  - Expect: Backpressure is preserved and buffering does not grow with the entire response merely for observation.

- [ ] **STREAM-006 — Streaming request body** · `N/H/B`
  - Do: Send a ReadableStream body in an appropriate custom write and inspect runtime capabilities/HTTP requirements.
  - Expect: Supported runtimes stream it; unsupported browser protocol/runtime combinations fail honestly rather than pretending upload succeeded.

- [ ] **STREAM-007 — No implicit stream replay** · `T/H`
  - Do: Make a request stream fail and enable an otherwise eligible retry policy.
  - Expect: No second consumption or hidden full-buffer replay occurs; the caller must create a fresh source for a new logical call.

- [ ] **STREAM-008 — Reader failure and clean next call** · `T/H`
  - Do: Break a source/sink midstream, release its reader, then perform a normal request.
  - Expect: The original error is surfaced, resources settle, and the next operation remains usable.

<a id="rule"></a>

## File validation rules — RULE

Sources: [validation usage](../packages/core/README.md#file-validation-opt-in), [rule tests](../tests/core/file-rules-size.test.ts), [shared-reference regression](../tests/core/file-validation-shared-references.test.ts).

- [ ] **RULE-001 — No rules means opt-in remains off** · `M/T`
  - Do: Send varied names/types/sizes with fileFields but no file rules.
  - Expect: Existing upload behavior is preserved; declaring a file field does not invent MIME/size/security rules.

- [ ] **RULE-002 — Per-file size boundaries** · `M/T/H`
  - Do: For minSize/maxSize send below, equal and above values, including an empty file and explicit zero override.
  - Expect: Exact boundaries and zero are respected; invalid input fails before transport/managed mock commit.

- [ ] **RULE-003 — Field file counts** · `M/T`
  - Do: Exercise min/max with omitted field, empty array, one file and too many files.
  - Expect: Min applies only when the field is present; each occurrence is counted and the intended field path is reported.

- [ ] **RULE-004 — Whole-body file totals** · `M/T`
  - Do: Put files in multiple declared/undeclared/nested fields and exceed maxFiles or maxTotalSize.
  - Expect: Every supported file occurrence contributes, so nesting/undeclared fields cannot bypass aggregate limits.

- [ ] **RULE-005 — Repeated shared references** · `M/T`
  - Do: Reference the same object/File through two different paths, then introduce an actual cycle.
  - Expect: Each serialized occurrence counts; a cycle terminates safely instead of hanging or being mistaken for another independent branch.

- [ ] **RULE-006 — MIME allow and deny** · `M/T`
  - Do: Try exact MIME types, wildcards, casing, parameters, unknown MIME and an explicit reject matching an allow.
  - Expect: Matching follows documented normalization; reject wins and unknown-type policy is explicit.

- [ ] **RULE-007 — Extension rules** · `M/T`
  - Do: Try mixed case, multi-part suffixes, Unicode, dotfiles and missing extensions against accept/reject/noExtension rules.
  - Expect: Extension handling follows the documented suffix/no-extension policy; filename tricks do not create a false content-verification claim.

- [ ] **RULE-008 — Filename policy** · `M/T`
  - Do: Use strict filename rules with traversal-like, control-character and unusual names; compare a normal Unicode filename.
  - Expect: Unsafe names fail according to the configured policy; violation diagnostics avoid echoing the sensitive name/content.

- [ ] **RULE-009 — Override one rule without losing others** · `M/T/E`
  - Do: Set resource rules and override one field/limit key at operation level, including a defined zero.
  - Expect: Defined operation values win key-wise; unrelated resource rules remain effective and inference is preserved.

- [ ] **RULE-010 — Caller FormData aliases** · `T/H`
  - Do: Build FormData manually using a configured aliased field and violate its count/size rule.
  - Expect: Validation matches the documented part name/alias and still blocks before the request is sent.

- [ ] **RULE-011 — Aggregate violations and secrecy** · `M/T`
  - Do: Make several independent files violate different rules in one call.
  - Expect: ValidationError reports useful codes, paths and actual/limit values up to the documented diagnostic cap, without contents or file-name leaks.

- [ ] **RULE-012 — Metadata-only validation** · `T`
  - Do: Use a file-like test source whose byte reader is instrumented and evaluate metadata-only rules.
  - Expect: Rules inspect size/name/type without reading entire file bytes; client checks are never represented as server security/content sniffing.

- [ ] **RULE-013 — Bounded violation reporting** · `M/T`
  - Do: Create more than twenty independent file violations, then try to mutate the returned violation array/entries.
  - Expect: Diagnostics remain capped and immutable with the documented indication that more violations existed; no unbounded error object or file data is retained for reporting.

- [ ] **RULE-014 — Invalid rule definitions** · `E/T`
  - Do: Configure negative/nonfinite limits, malformed MIME/extension entries or an operation override for an undeclared file field using the negative config examples.
  - Expect: Invalid rule configuration fails early with a clear location instead of silently disabling limits or inventing a resource file field.

<a id="limit"></a>

## Body and response resource limits — LIMIT

Sources: [response limits](../tests/core/response-limits.test.ts), [stream limits](../tests/core/stream-limits.test.ts), [validation-transfer tests](../tests/core/validation-transfer.test.ts).

- [ ] **LIMIT-001 — Raw body size** · `T/H`
  - Do: Apply maxBodySize/appropriate total limit to Blob, buffer and string bodies at and over the cap.
  - Expect: Byte-based raw-body bounds are enforced without treating ordinary JSON fields as file metadata.

- [ ] **LIMIT-002 — Streaming body cutoff** · `T/H`
  - Do: Stream an unknown-length body past its configured cap.
  - Expect: The stream fails with ValidationError as bytes flow; it is not pre-buffered, and already-sent bytes are not claimed to be rolled back.

- [ ] **LIMIT-003 — Early response rejection** · `T/H`
  - Do: Return a trustworthy Content-Length larger than maxResponseSize.
  - Expect: The call rejects before unnecessary full-body allocation, with the documented size violation.

- [ ] **LIMIT-004 — Unknown-length response cap** · `T/H`
  - Do: Send chunked responses crossing the cap in JSON/text/Blob/ArrayBuffer/stream modes.
  - Expect: Actual bytes are counted during consumption; every supported mode enforces the limit with cancellation/backpressure intact.

- [ ] **LIMIT-005 — Response content type policy** · `T/H`
  - Do: Configure responseAccept, then return allowed, rejected and absent Content-Type values.
  - Expect: The declared-type policy is applied as documented; it is not claimed to inspect/sniff actual bytes.

- [ ] **LIMIT-006 — Limit precedence and function requests** · `T/E`
  - Do: Override maxResponseSize per call and on function ctx.request, then exceed each selected limit.
  - Expect: The effective limit is forwarded through every supported entry, including the historical ctx.request regression.

- [ ] **LIMIT-007 — Validation is terminal** · `T/M`
  - Do: Enable retries and trigger input/response validation failures.
  - Expect: ValidationError is not retried; progress/error observers report the actual reason once without a later success.

- [ ] **LIMIT-008 — Custom transport conformance** · `T`
  - Do: Use a custom transport that honors the documented body/response limits and compare a deliberately nonconforming harness.
  - Expect: Record the adapter's conformance; do not assume Core can prevent arbitrary hidden buffering inside third-party transports.

<a id="store"></a>

## Virtual file storage and ownership — STORE

Sources: [advanced mock storage](../packages/core/README.md#advanced-mock-file-storage), [storage tests](../tests/core/mock-storage.test.ts), [file lifecycle](../tests/core/mock-file-lifecycle.test.ts).

- [ ] **STORE-001 — Store and retrieve bytes** · `M/E`
  - Do: Upload a file through a mocked resource; list, meta and get it through `mockFiles`.
  - Expect: The entity contains an ordinary reference and the per-client virtual store contains matching bytes/metadata.

- [ ] **STORE-002 — UUID identity and duplicate names** · `M`
  - Do: Store two different files with the same original filename using default organization.
  - Expect: Refs/UUID identities remain distinct; duplicate names do not overwrite unrelated bytes.

- [ ] **STORE-003 — Logical disks and directories** · `M`
  - Do: Set storage disk/directory, write files and inspect normalized metadata.
  - Expect: Logical grouping/path metadata is consistent; a disk is not an actual remote/local filesystem adapter.

- [ ] **STORE-004 — Naming policies** · `M`
  - Do: Compare original, unique and a safe naming callback, then inspect originalName.
  - Expect: Naming affects the stored filename/path/ref suffix as documented, while UUID identity and preserved original-name metadata stay consistent.

- [ ] **STORE-005 — Path collision** · `M`
  - Do: Write two files to the same explicit disk/path under a colliding naming policy.
  - Expect: The second write rejects without overwriting the original or leaving an orphan record/file.

- [ ] **STORE-006 — Unsafe virtual path** · `M`
  - Do: Try relative traversal, absolute/drive/UNC paths, encoded separators, schemes and controls.
  - Expect: Paths are rejected rather than normalized into a place outside the logical disk; no backend filesystem access occurs.

- [ ] **STORE-007 — Path filtering semantics** · `M`
  - Do: List files under `a`, `a/b` and `ab`, using disk/path filters.
  - Expect: Filtering is segment-aware, case-sensitive and insertion-ordered as documented; it does not read file contents.

- [ ] **STORE-008 — Lookup identity is not path** · `M`
  - Do: Look up by ref/bare UUID and compare an attempted virtual-path lookup.
  - Expect: Only documented identity forms locate the file; a directory label is not silently a second identity system.

- [ ] **STORE-009 — Defensive binary reads** · `M`
  - Do: Retrieve a byte buffer, mutate it, then retrieve the same stored file again.
  - Expect: The store returns defensive byte copies; changing one read cannot mutate later downloads.

- [ ] **STORE-010 — Managed last owner cleanup** · `M`
  - Do: Give two records/resources one shared ref, replace/delete one owner, then remove the final managed owner.
  - Expect: Bytes survive while a managed owner or fixture pin needs them; cleanup occurs only when the last relevant ownership is released.

- [ ] **STORE-011 — Manual put ownership** · `M`
  - Do: Manually put a file, reference it from a record, then delete/reset managed records.
  - Expect: Manual ownership is retained until the documented explicit/manual lifecycle releases it; unrelated record cleanup does not collect it.

- [ ] **STORE-012 — Explicit destructive delete and clear** · `M`
  - Do: Delete/clear storage directly while a record still holds a ref, then read low-level and handler views.
  - Expect: Dangling refs follow the documented undefined versus MOCK_NOT_FOUND behavior; explicit storage deletion is not disguised as managed safe cleanup.

<a id="fix"></a>

## File fixtures and lazy initialization — FIX

Sources: [fixture usage](../packages/core/README.md#advanced-mock-file-storage), [fixture tests](../tests/core/mock-fixtures.test.ts).

- [ ] **FIX-001 — Explicit fixture marker** · `M/E`
  - Do: Seed a row using `mockFixtureRef` or the documented JSON marker plus a fixture registry.
  - Expect: Initialization resolves the marker into a normal string ref and stores the exact descriptor bytes/metadata.

- [ ] **FIX-002 — Ordinary strings remain strings** · `M`
  - Do: Seed a normal URL/path/string that resembles a useful file name without an explicit marker.
  - Expect: It is not silently loaded as a fixture or fetched over the network.

- [ ] **FIX-003 — Descriptor input forms** · `M/N/B`
  - Do: Build fixture descriptors from text, Uint8Array and Blob with explicit names, without requiring File.
  - Expect: Each input produces correct bytes/metadata across supported runtimes; default lastModified behavior is stable.

- [ ] **FIX-004 — Lazy selected fixtures** · `M`
  - Do: Use a seed window referencing only part of a registry with counted async fixture factories.
  - Expect: Only selected/referenced fixtures are loaded, in the documented order; unneeded descriptors allocate no stored file.

- [ ] **FIX-005 — Shared fixture and pin** · `M`
  - Do: Reference one fixture several times, then replace/delete one row and reset the resource.
  - Expect: The resource shares its fixture appropriately and the pin preserves its baseline for reset.

- [ ] **FIX-006 — Missing marker atomicity** · `M`
  - Do: Include one valid fixture and one unresolved marker; inspect rows/files after initialization rejects.
  - Expect: No partially initialized records or allocated orphan bytes become visible.

- [ ] **FIX-007 — Missing UUID policy** · `M`
  - Do: Compare an unresolved UUID-like reference with and without a configured fixture registry.
  - Expect: Strict configured initialization and legacy seed-string compatibility follow their documented distinct policies.

- [ ] **FIX-008 — Lazy reset rehydration** · `M`
  - Do: Reset after changing fixture-backed records; inspect storage synchronously and again after the next awaited resource read.
  - Expect: Baseline repair occurs lazily; refs may change because ID generation is not rewound, while fixture contents remain correct.

<a id="atom"></a>

## Managed mock transaction failures and races — ATOM

Sources: [atomicity](../tests/core/mock-storage-atomicity.test.ts), [fault matrix](../tests/core/mock-write-faults.test.ts), [handler lifecycle](../tests/core/mock-handlers.test.ts).

- [ ] **ATOM-001 — Handler throw after draft edits** · `M`
  - Do: Inside a custom handler allocate a file/change rows and then throw.
  - Expect: Records, files and ownership remain at the pre-call state; arbitrary external side effects are not claimed to roll back.

- [ ] **ATOM-002 — Failure after allocation** · `M`
  - Do: Cause response validation or an ID/path collision after a file was allocated.
  - Expect: The whole managed change is discarded; no orphan file or partially visible row survives.

- [ ] **ATOM-003 — Abort before commit** · `M`
  - Do: Delay a handler after draft edits, abort its caller, and allow the delayed callback to finish.
  - Expect: The call rejects promptly, nothing commits later, and late mutation-handle writes are rejected.

- [ ] **ATOM-004 — Timeout before commit** · `M`
  - Do: Let the same draft outlive its timeout.
  - Expect: Timeout discards managed changes and later handler completion cannot resurrect them.

- [ ] **ATOM-005 — Reset during pending write** · `M`
  - Do: Reset a client while its file-bearing write is waiting to commit.
  - Expect: Pending work is invalidated; next reads show the reset baseline rather than the old draft.

- [ ] **ATOM-006 — Failed replacement** · `M`
  - Do: Replace an existing file, then fail the write; retry successfully with a new call.
  - Expect: Failure preserves the old ref/bytes; success installs the new file and releases the old owner at the correct time.

- [ ] **ATOM-007 — Partial file-array replacement** · `M`
  - Do: Replace one file in a multi-file field while leaving the others referenced.
  - Expect: Only the replaced ownership changes; untouched bytes and order remain correct.

- [ ] **ATOM-008 — Concurrent success and failure** · `M`
  - Do: Interleave two drafts so one succeeds and one fails after allocating/changing data.
  - Expect: The successful operation survives intact and the failed operation publishes none of its own state.

- [ ] **ATOM-009 — Concurrent shared-ref replacement** · `M`
  - Do: Interleave replacements from records sharing a file and inspect the store between commits.
  - Expect: No record is left pointing to prematurely collected bytes; ref counting follows committed ownership.

- [ ] **ATOM-010 — Post-commit middleware error** · `M`
  - Do: Make response middleware throw after a managed commit, then inspect rows/files.
  - Expect: The error is surfaced but committed state remains; the boundary of rollback is explicit and a retry is a new decision.

<a id="query"></a>

## Reactive reads and query identities — QUERY

Sources: [React queries](../packages/react/README.md#a-list-query), [query tests](../tests/react/use-resource-query.test.tsx), [shared key tests](../tests/internal-shared/keys.test.ts).

- [ ] **QUERY-001 — List lifecycle** · `R/M/T`
  - Do: Mount `useResourceQuery` under a QueryClient provider and resolve a delayed getAll.
  - Expect: Pending/fetching/success/data reflect native TanStack behavior and the payload type; no write operation appears as a query.

- [ ] **QUERY-002 — Select any read** · `R/E`
  - Do: Observe each read category, including a custom explicit read, with its exact args.
  - Expect: The selected operation executes with its Core signature; unselected inherited reads do not fetch merely because they exist.

- [ ] **QUERY-003 — Operation-only resource** · `R/E`
  - Do: Disable getAll, mount the resource hook and call an explicit inherited read.
  - Expect: There is no automatic list query or invented list state; operation-only helpers require an unambiguous target.

- [ ] **QUERY-004 — Conditional query** · `R/T`
  - Do: Use `enabled` false then true, and a supported enabled callback.
  - Expect: Disabled queries stay idle as natively defined; enabling runs the correct request without a wrapper-specific scheduler.

- [ ] **QUERY-005 — Select versus cache** · `R`
  - Do: Use `select` to return one field or filtered rows, then inspect the raw cache/controller.
  - Expect: The observer sees selected data while the shared cache retains the original operation result.

- [ ] **QUERY-006 — Initial versus placeholder data** · `R/E`
  - Do: Compare concrete/function initialData with placeholderData while a delayed fetch runs.
  - Expect: Initial data seeds cache/types as documented; placeholder data remains observer-only and does not falsely make every data type defined.

- [ ] **QUERY-007 — Exact argument identity** · `R/T`
  - Do: Compare `getById("42")`, trailing empty options, trailing undefined and a real query variant.
  - Expect: Equivalent documented forms share a key; result-changing arguments create distinct identities.

- [ ] **QUERY-008 — Builder requires explicit identity** · `R/E`
  - Do: Use `args: ({ signal }) => ...` with and without safe keyParts.
  - Expect: Valid builders forward exact arguments; missing identity is rejected rather than hashing an opaque function.

- [ ] **QUERY-009 — Tenant and backend isolation** · `R`
  - Do: Use one QueryClient for two clients/tenants whose requests share a resource name but differ by scope.
  - Expect: Correct scopes/keyParts keep data separate; changing auth/headers alone is not assumed to change cache identity automatically.

- [ ] **QUERY-010 — Reserved name collisions** · `R/E`
  - Do: Create reads named `refetch`, `data`, `cache`, `cancel` or an infinite result property.
  - Expect: Framework fields keep their meaning and custom reads remain callable through `operations.<name>`.

- [ ] **QUERY-011 — Native query options** · `R`
  - Do: Exercise staleTime, gcTime, polling, focus/reconnect behavior, networkMode and throwOnError using a small controlled sequence.
  - Expect: Supported native options reach TanStack unchanged; generated queryFn/final key ownership and excluded custom hashing remain explicit.

- [ ] **QUERY-012 — Cancellation signal composition** · `R/T`
  - Do: Cancel through QueryClient, caller signal, key change and in-flight unmount in separate runs.
  - Expect: Standard reads receive the right combined signal; obsolete work stops and TanStack cancellation state is not presented as an ordinary fetch error.

<a id="cache"></a>

## Cache helpers, controllers and imperative reads — CACHE

Sources: [cache helpers](../packages/react/README.md#prefetching-cache-access-and-cancellation), [controller tests](../tests/react/controller-cache.test.ts), [React limits](../packages/react/README.md#limits).

- [ ] **CACHE-001 — Imperative read shares reactive key** · `R/T`
  - Do: Call an inherited getById and observe the same operation reactively with matching identity.
  - Expect: Both use one QueryClient entry, with fetchQuery freshness semantics rather than a separate Apixa cache.

- [ ] **CACHE-002 — Warm prefetch** · `R/T`
  - Do: Prefetch a target, mount it within staleTime, and repeat prefetch concurrently.
  - Expect: Fresh data is reused and concurrent requests deduplicate as TanStack defines; no hidden observer is mounted by prefetch.

- [ ] **CACHE-003 — Cold and stale fetch choices** · `R/T`
  - Do: Compare fetch, ensure and prefetch/controller equivalents for missing, fresh and stale data.
  - Expect: Each keeps its native fetchQuery/ensureQueryData/prefetchQuery behavior instead of being treated as interchangeable.

- [ ] **CACHE-004 — Raw cache get and functional set** · `R`
  - Do: Read and update raw list/detail data with cache helpers, including when the observer uses select.
  - Expect: No network request is made; functional updates work on raw data and observers update on TanStack's notification tick.

- [ ] **CACHE-005 — Exact versus prefix removal** · `R`
  - Do: Remove one observed entry, then explicit list/all prefixes while a sibling resource exists.
  - Expect: Only intended entries are removed; removal is not confused with invalidation or a forced refetch.

- [ ] **CACHE-006 — Scoped invalidation** · `R/T`
  - Do: Invalidate lists, one detail and the whole resource with active, inactive and disabled consumers.
  - Expect: The targeted key family is correct; inactive/disabled entries are marked stale without promising immediate fetches.

- [ ] **CACHE-007 — In-flight invalidation after write** · `R/T`
  - Do: Start a slow inactive matching fetch before a write and let mutation invalidation occur while it runs.
  - Expect: The documented invalidation behavior restarts stale in-flight work; an idle inactive entry is only invalidated.

- [ ] **CACHE-008 — Controller action distinctions** · `R`
  - Do: Try cancel/remove/reset/refetch through the advanced controller on a known entry.
  - Expect: Native QueryClient semantics and exact operation signatures are retained; reset is not mistaken for deleting backend data.

- [ ] **CACHE-009 — No-observer and render cost** · `R`
  - Do: Use prefetch/inherited reads without reading operation states, then compare a minimal native useQuery component.
  - Expect: Helper use creates no extra query observers; render behavior follows accessed native result fields rather than unnecessary wrapper copies.

- [ ] **CACHE-010 — Advanced write synchronization mapping** · `R/E`
  - Do: Use the documented advanced create/update sync helpers first with an acknowledgment-only response, then with an explicit complete-entity/id mapping; exercise delete too.
  - Expect: Acknowledgment responses trigger invalidation rather than guessed records; explicit mappings support custom IDs, and delete removes the intended detail while invalidating lists.

<a id="inf"></a>

## Infinite and paginated queries — INF

Sources: [infinite mode](../packages/react/README.md#infinite-queries), [React tests](../tests/react/), [shared key implementation](../packages/react/src/keys.ts).

- [ ] **INF-001 — Page and cursor navigation** · `R/M/H`
  - Do: Configure native infinite mode against a matching page/cursor contract and fetch subsequent pages.
  - Expect: Typed pages/pageParams grow together, next-page termination follows getNextPageParam, and page parameters reach the intended query.

- [ ] **INF-002 — Backward navigation and bounds** · `R/T`
  - Do: Provide previous-page handling and maxPages, then move both directions.
  - Expect: Native eviction and page ordering remain consistent; pageParams stay aligned with retained pages.

- [ ] **INF-003 — Regular/infinite cache separation** · `R`
  - Do: Observe ordinary and infinite reads of the same resource and inspect keys.
  - Expect: They never share incompatible raw cache shapes; infinite identity excludes its changing page parameter.

- [ ] **INF-004 — Filters belong to identity** · `R/T`
  - Do: Switch an infinite list's result-changing filter using explicit key/keyParts while reusing the paging function.
  - Expect: Distinct filters do not merge pages into one cache; changing pages within one filter retains the same infinite entry.

- [ ] **INF-005 — Custom operation argument builder** · `R/E`
  - Do: Use infinite.args for a read whose signature Core does not own and forward the supplied signal.
  - Expect: The exact tuple runs with explicit cancellation/identity; no argument position is guessed.

- [ ] **INF-006 — Cancel page load** · `R/T`
  - Do: Cancel/unmount while a next page is in flight.
  - Expect: The obsolete page request aborts according to native lifecycle and does not append late data.

- [ ] **INF-007 — Invalidate list families** · `R/T`
  - Do: Invalidate lists directly and after a mutation while both ordinary/infinite lists and details exist.
  - Expect: Both list families are included; detail/custom-read/other-resource entries are affected only by the chosen policy.

- [ ] **INF-008 — Mode change guard** · `R`
  - Do: Toggle infinite mode on an already mounted component, then repeat using a new component key.
  - Expect: Unsupported in-place mode changes fail clearly; remounting uses a valid hook order.

- [ ] **INF-009 — Native factory interoperability** · `R/E`
  - Do: Use `createResourceInfiniteQueryOptions` with native infinite/Suspense APIs and prefetch helpers.
  - Expect: Keys, pages and inference agree with hook mode; no separate custom scheduler is needed.

<a id="mut"></a>

## Resource mutations and per-call state — MUT

Sources: [mutation usage](../packages/react/README.md#mutations-useresourcemutation), [mutation tests](../tests/react/resource-mutation.test.tsx), [mutation types](../tests/react/resource-mutation-types.test.ts).

- [ ] **MUT-001 — Inherited write with native Promise** · `R/E`
  - Do: Call an inherited create/update through `useResourceMutation` and await its value.
  - Expect: Exact Core arguments/results are preserved and each call returns its own native Promise.

- [ ] **MUT-002 — Per-operation state** · `R`
  - Do: Run different writes and inspect callable state fields and `states.<op>`.
  - Expect: Both views reflect the same native observer; each operation's state is independent and unused operations remain lazy.

- [ ] **MUT-003 — Concurrent same-operation calls** · `R/T`
  - Do: Start two calls to one operation and settle them in reverse order.
  - Expect: Each promise resolves/rejects for its own call; displayed observer state is the latest-call model, not a count of every in-flight mutation.

- [ ] **MUT-004 — Native all-flight observation** · `R`
  - Do: Observe concurrent writes using useMutationState with the generated mutation key.
  - Expect: All in-flight calls can be tracked through native TanStack tools without treating one callable isPending as a global activity counter.

- [ ] **MUT-005 — Client-only mutation** · `R/E`
  - Do: Add a new named mutation with mutationFn, then try a missing function and an override function on an inherited name.
  - Expect: Valid client-only behavior runs; missing implementations and replacement of inherited Core execution are rejected.

- [ ] **MUT-006 — Callback data and context** · `R/E`
  - Do: Supply onMutate returning context plus onSuccess/onError/onSettled; try a failed and a successful call.
  - Expect: Callbacks receive the correct tuple, result/error and awaited context in documented order; the inference caveat is handled with an annotation where needed.

- [ ] **MUT-007 — Default success invalidation** · `R/T`
  - Do: Write successfully with active resource queries, then fail another write.
  - Expect: Success awaits the default all-resource invalidation before onSuccess; failure does not perform success invalidation.

- [ ] **MUT-008 — Targeted and custom invalidation** · `R`
  - Do: Use lists-only, selected detail IDs, false and an async custom invalidation function.
  - Expect: Only intended cache families change; infinite lists follow list policy and custom async work is awaited as documented.

- [ ] **MUT-009 — Native retry, scope and reset** · `R/T`
  - Do: Configure retry/retryDelay and native serial mutation scope on one operation; inspect failure state and reset.
  - Expect: Native options behave correctly; TanStack serial scope is distinct from Apixa's cache-key scope, and reset does not undo backend writes.

- [ ] **MUT-010 — Unified useResource facade** · `R/E`
  - Do: Use `useResource` with query options and top-level mutations, including a custom read/write collision.
  - Expect: Read and write capabilities retain their classifications; reserved framework fields remain usable and operations stay reachable through the documented namespace.

<a id="opt"></a>

## Optimistic state, rollback and concurrency — OPT

Sources: [optimistic ordering contract](../packages/react/README.md#declarative-optimistic-updates), [optimistic tests](../tests/react/).

- [ ] **OPT-001 — Existing list/detail optimistic edit** · `R/T`
  - Do: Warm list/detail caches, begin a delayed optimistic update and inspect both before the response.
  - Expect: Configured entries update immediately with immutable raw-data updaters; missing entries are not invented.

- [ ] **OPT-002 — Single failure rollback** · `R/T`
  - Do: Reject a pending optimistic update.
  - Expect: Only that call's optimistic change is removed before the user's onError; unrelated data is preserved.

- [ ] **OPT-003 — A fails after B succeeds** · `R/T`
  - Do: Apply overlapping changes A then B, let B succeed and A fail.
  - Expect: Rollback never restores a stale snapshot over B's surviving change; the layer stack recomputes correctly.

- [ ] **OPT-004 — Server refetch while pending** · `R/T`
  - Do: Deliver fresh server data while an optimistic change is pending.
  - Expect: Server data becomes the new base and pending layers are reapplied, rather than losing either source.

- [ ] **OPT-005 — Old fetch after success** · `R/T`
  - Do: Start a fetch before a write, succeed the write while that fetch is running, then release the old response.
  - Expect: Documented restart/invalidation behavior prevents a stale response from becoming the lasting confirmed view; first-fetch dedup limitations are recorded.

- [ ] **OPT-006 — Manual cache takeover** · `R`
  - Do: Call cache.set or native setQueryData on one optimistically managed entry, then fail its mutation.
  - Expect: That entry stays caller-owned and is not rolled back; other entries remain managed until their own lifecycle completes.

- [ ] **OPT-007 — Unmount during mutation** · `R/T`
  - Do: Unmount after optimistic application and fail the pending operation later.
  - Expect: Rollback/callback work belongs to the mutation and still executes without requiring the original component to be mounted.

- [ ] **OPT-008 — Infinite target updater** · `R/E`
  - Do: Use explicit optimistic targets for an infinite entry and preserve pages/pageParams.
  - Expect: The valid InfiniteData shape survives; the ordinary list updater is not assumed to update infinite pages automatically.

- [ ] **OPT-009 — Send order versus completion order** · `R/T`
  - Do: Complete two successful same-field writes in a different order from their invocation, once with invalidation and once with it disabled.
  - Expect: Visible optimistic ordering follows the documented send-order model; a refetch reconciles backend order, and disabling invalidation may retain temporary disagreement.

<a id="ssr"></a>

## SSR, hydration, providers and native TanStack consumers — SSR

Sources: [SSR recipe](../packages/react/README.md#server-rendering-nextjs-app-router), [request isolation](../tests/react/ssr-isolation.test.ts), [Next consumer](../examples/frontends/query-ssr-next/README.md).

- [ ] **SSR-001 — Server prefetch and hydration** · `R/B`
  - Do: Use a request-scoped QueryClient, prefetch serializable data, dehydrate, hydrate under the matching provider and use a suitable staleTime.
  - Expect: The client renders prefetched data without a hydration mismatch or unnecessary immediate refetch for fresh data.

- [ ] **SSR-002 — Request isolation** · `R/T`
  - Do: Render two overlapping server requests for different users/tenants with separate QueryClients.
  - Expect: No data, headers or cache entries leak between requests; no server-global QueryClient is introduced.

- [ ] **SSR-003 — Key parity across boundary** · `R/B`
  - Do: Prefetch detail and infinite data on the server using the same scope/key/args as the client.
  - Expect: Hydration populates the intended client entries instead of creating duplicate or shape-incompatible caches.

- [ ] **SSR-004 — No-prefetch and stale-prefetch paths** · `R/B`
  - Do: Load a page without prefetched data, then one with data deliberately stale according to native policy.
  - Expect: The client fetches when needed and preserves native loading/refetch semantics rather than assuming every hydrated entry is fresh.

- [ ] **SSR-005 — Provider alternatives** · `R`
  - Do: Use ApixaProvider with a supplied client, then the documented native QueryClientProvider integration.
  - Expect: All hooks/helpers use the intended client consistently; there is no hidden second cache.

- [ ] **SSR-006 — Provider client replacement** · `R`
  - Do: Replace the client with a keyed remount of consumers, then compare an unsupported unkeyed swap.
  - Expect: The supported remount switches ownership correctly; native observer retention is documented rather than silently expected to migrate.

- [ ] **SSR-007 — Native regular and parallel queries** · `R/E`
  - Do: Feed `createResourceQueryOptions` into useQuery/useQueries and QueryClient operations.
  - Expect: Keys, result types and request execution agree with the resource hook while preserving native composition.

- [ ] **SSR-008 — Suspense and error boundary** · `R/B/E`
  - Do: Use generated options with native useSuspenseQuery/useSuspenseInfiniteQuery and a controlled failure.
  - Expect: Native Suspense/error behavior works; removed/unsupported suspense booleans and option combinations are not recommended.

- [ ] **SSR-009 — React 18, 19 and StrictMode** · `R/B/P`
  - Do: Repeat mounting/unmounting and hydration on the supported React versions, including StrictMode.
  - Expect: No duplicate lasting live work, hook-order violations or version-specific peer breakage is hidden by a single-runtime pass.

<a id="frame"></a>

## Files across queries, mutations and SSR — FRAME

Sources: [framework files](../packages/react/README.md#files-through-the-hooks-v160), [framework queries](../tests/react/framework-files-queries.test.tsx), [framework transfer coverage](../tests/react/framework-files-transfer.test.tsx).

- [ ] **FRAME-001 — Native form input to mutation** · `R/B/E`
  - Do: Choose File/Blob values from a browser input, call a configured inherited write and await it from a form submit handler.
  - Expect: Native values and promise results flow through the existing hook without RHF dependencies or a separate file mutation API.

- [ ] **FRAME-002 — Reference result and cache** · `R/M/H`
  - Do: Complete an upload returning an entity reference and observe invalidated list/detail queries.
  - Expect: Cache contains the intended read representation, not an accidental File object substituted for a server reference.

- [ ] **FRAME-003 — Binary query identities** · `R/E`
  - Do: Attempt to use File/Blob/stream/function values in automatic identity; repeat with explicit nonsecret serializable keyParts.
  - Expect: Unsafe automatic identities are rejected; explicitly keyed supported reads avoid collisions without serializing binary contents into keys.

- [ ] **FRAME-004 — Blob query lifecycle** · `R/B`
  - Do: Read a Blob through a query, create an object URL in the consumer, then refetch/unmount and release the URL.
  - Expect: Raw Blob caching works within the browser; object URL ownership/cleanup stays explicit in the consumer.

- [ ] **FRAME-005 — Stream cache ownership** · `R/T`
  - Do: Cache a stream, replace/remove its cache entry, then cancel the old stream explicitly or let its configured timeout expire.
  - Expect: Cache removal/replacement alone is not treated as stream disposal; the caller drains/cancels every stream and the timeout still bounds forgotten work.

- [ ] **FRAME-006 — No binary dehydration** · `R/B`
  - Do: Prepare SSR data containing Blob/ArrayBuffer/stream results and apply the documented dehydration exclusions.
  - Expect: Nonserializable/live bodies do not cross server-client props/dehydration; only deliberately serializable metadata/reference data is sent.

- [ ] **FRAME-007 — Caller and query signals** · `R/T`
  - Do: Pass a caller signal while TanStack supplies its own; cancel through each independently.
  - Expect: Either signal can stop the query; one does not overwrite the other and a surviving valid query still works.

- [ ] **FRAME-008 — File error parity through hooks** · `R/M/T`
  - Do: Trigger file rule, serialization, HTTP, timeout and cancellation failures through query/mutation/unified usage.
  - Expect: Existing typed errors/violations remain observable; wrappers do not convert every failure into a generic upload error.

- [ ] **FRAME-009 — Advanced write through existing hook** · `R/T/H`
  - Do: Run a configured transfer write through useResourceMutation/useResource and observe session snapshots in caller state.
  - Expect: Native promise/result/state behavior remains intact; final success invalidates cache, while progress is not confused with mutation completion.

- [ ] **FRAME-010 — Form cancellation and retry** · `R/B`
  - Do: Cancel a pending form upload on navigation/unmount, then explicitly resubmit with a fresh signal/control.
  - Expect: No stale UI completion or automatic unsafe new session occurs; form errors remain recoverable and caller-owned state is cleaned up.

<a id="adv"></a>

## Advanced chunk/session transfer orchestration — ADV

Sources: [advanced transfer contract](../packages/core/README.md#advanced-transfers-v170), [protocol recipe](../examples/frontends/query-ssr-next/lib/advanced-transfer.ts), [chunk tests](../tests/core/advanced-transfer-chunks.test.ts). Requires an explicit protocol harness or author-owned server; Laravel currently provides none.

- [ ] **ADV-001 — Ordinary upload stays ordinary** · `T/H`
  - Do: Send a raw Blob through an operation without transfer strategy, then compare an explicitly configured transfer operation.
  - Expect: Ordinary upload stays one request; session/chunk behavior exists only with explicit protocol configuration.

- [ ] **ADV-002 — Whole-source validation first** · `T/H`
  - Do: Use a configured source that violates whole-file rules, including one changed by middleware.
  - Expect: The call rejects before initiate; small individual chunks cannot bypass logical-source limits.

- [ ] **ADV-003 — Chunk layout boundaries** · `T/H`
  - Do: Transfer sizes below, equal to and just above one chunk and an exact multi-chunk size; inspect indexes/offsets/sizes.
  - Expect: Every byte is covered exactly by the intended layout, with no gap, overlap or extra empty trailing part.

- [ ] **ADV-004 — Empty file and part cap** · `T`
  - Do: Exercise the protocol's declared empty-file behavior and an input exceeding its maxParts policy.
  - Expect: Invalid/unsupported layouts fail before network/session creation; no unbounded part manifest is scheduled.

- [ ] **ADV-005 — Sequential fallback** · `T`
  - Do: Request concurrency above one while the protocol does not declare independent parts.
  - Expect: The documented fallback runs one active part; parallelism is not assumed safe merely because it was requested.

- [ ] **ADV-006 — Bounded parallelism** · `T/H`
  - Do: Declare independent parts, use a small explicit concurrency and record active requests, including failures.
  - Expect: Active work never exceeds the selected limit and scheduling stops appropriately after terminal failure; concurrency is not secretly unlimited.

- [ ] **ADV-007 — Invalid scheduler values** · `T/E`
  - Do: Try zero, negative, fractional, NaN and Infinity for validated scheduling options using the contract's negative cases.
  - Expect: Invalid values fail before requests; no invented fixed maximum is asserted where the current API leaves policy to the caller.

- [ ] **ADV-008 — Lazy slicing and hashing** · `T/N`
  - Do: Instrument a large Blob source to record slices/arrayBuffer reads during a transfer.
  - Expect: Parts are sliced lazily, hashing is bounded by a slice, and no full-source ArrayBuffer is created for orchestration.

- [ ] **ADV-009 — Acknowledgment validation** · `T`
  - Do: Return wrong index/offset/size, conflicting ETag or a mismatched checksum from a protocol decoder.
  - Expect: Invalid evidence cannot count as a confirmed part or reach successful finalization.

- [ ] **ADV-010 — True finalization result** · `T/H/E`
  - Do: Return a real finalization ApiResponse, including a response with an embedded backend error under HTTP 200.
  - Expect: Only the decoded authoritative success resolves; full:true preserves final status/headers and backend error bodies are not mistaken for success.

- [ ] **ADV-011 — Function composition** · `T/E`
  - Do: Use `ctx.transfer` in a write function and compare ordinary ctx.request kind restrictions.
  - Expect: The same orchestrator is reused while ordinary function requests retain their read/write rules; the final result type remains exact.

- [ ] **ADV-012 — Unsupported strategy combinations** · `T/M/E`
  - Do: Use an undeclared source, conflicting dataFormat, nonseekable source or mocked session orchestration.
  - Expect: Unsupported setup rejects explicitly before unsafe dispatch; mocks do not fabricate remote session success.

<a id="ctrl"></a>

## Transfer controls, progress and local lifetime — CTRL

Sources: [control tests](../tests/core/advanced-transfer-control.test.ts), [session progress tests](../tests/core/advanced-transfer-progress.test.ts), [race regressions](../tests/core/advanced-transfer-races.test.ts).

- [ ] **CTRL-001 — Pause at quiescence** · `T/H`
  - Do: Pause a transfer while parts are active; wait for pause and inspect requests/checkpoint persistence.
  - Expect: Pause resolves at the documented quiet point, no new parts start while paused, and the original native promise remains pending.

- [ ] **CTRL-002 — Resume same invocation** · `T/H`
  - Do: Resume the paused control and await the original pending call.
  - Expect: Work continues in the same session/invocation with existing confirmed parts and eventually returns its real final result.

- [ ] **CTRL-003 — Cancel locally** · `T/H`
  - Do: Cancel during a stalled part and inspect backend session state.
  - Expect: Local work rejects as AbortError and stops; remote session/files are not silently deleted.

- [ ] **CTRL-004 — Remote abort acknowledgment** · `T/H`
  - Do: Call abort while uploading, delay its server response, then acknowledge deletion.
  - Expect: Remote abort remains pending until confirmation and does not falsely report successful completion or deletion early.

- [ ] **CTRL-005 — Abort versus completed finalization** · `T`
  - Do: Let completion reach the server before abort is requested, then delay the completion response.
  - Expect: The completed result is reconciled and the finished session is not aborted; the documented already-finished outcome is surfaced.

- [ ] **CTRL-006 — Remote abort failure** · `T/H`
  - Do: Fail the server abort request after a resumable checkpoint exists.
  - Expect: The error preserves recovery/checkpoint information; remote deletion is not claimed and a deliberate follow-up can recover.

- [ ] **CTRL-007 — Deadline includes pause and persistence** · `T`
  - Do: Hold a transfer paused or its persistence callback pending past the overall timeout.
  - Expect: The deadline still settles local work; pause/persistence cannot create an immortal invocation.

- [ ] **CTRL-008 — Control ownership** · `T/R`
  - Do: Attempt to bind one control to two active transfers, then use separate controls.
  - Expect: Concurrent reuse is rejected; independent controls do not cross-cancel or cross-resume another invocation.

- [ ] **CTRL-009 — Session versus request progress** · `T/H`
  - Do: Compare onSession confirmed bytes with onTransfer observed bytes during retries and out-of-order acknowledgments.
  - Expect: Session bytes count unique authoritative confirmations without retry double-counting; per-request observation keeps its distinct meaning.

- [ ] **CTRL-010 — Immutable observer snapshots** · `T`
  - Do: Try to mutate nested onSession/checkpoint snapshot values, and throw from an observer.
  - Expect: Snapshots remain immutable and callback errors do not change the actual transfer result or confirmation evidence.

<a id="resume"></a>

## Checkpoints, recovery, retries and integrity — RESUME

Sources: [recovery tests](../tests/core/advanced-transfer-recovery.test.ts), [checkpoint tests](../tests/core/advanced-transfer-checkpoints.test.ts), [fault tests](../tests/core/advanced-transfer-faults.test.ts).

- [ ] **RESUME-001 — Persist and reacquire source** · `T/H`
  - Do: Interrupt a transfer, persist its checkpoint in caller storage, then start a new call with a fresh signal/control and the same reacquired file.
  - Expect: Resume validates identity and inspects server state before skipping work; a checkpoint alone is never treated as uploaded bytes.

- [ ] **RESUME-002 — Same-size changed file** · `T`
  - Do: Resume using different bytes with the same size/name/time.
  - Expect: Chunk-manifest source identity rejects the mismatch before trusting the saved session; superficial metadata cannot substitute for content identity.

- [ ] **RESUME-003 — Untrusted checkpoint structure** · `T`
  - Do: Alter version, operation/protocol/layout/source details, duplicate parts, oversized serialized data or malformed fields.
  - Expect: The documented structural/size checks reject unsafe checkpoint input; no arbitrary session is created as a fallback.

- [ ] **RESUME-004 — Server lost a locally confirmed part** · `T/H`
  - Do: Let the checkpoint say a part is confirmed but have inspect report it absent.
  - Expect: Authoritative server state controls recovery; the part is resent only under the protocol's safe replay rules.

- [ ] **RESUME-005 — Unknown or conflicting session** · `T/H`
  - Do: Resume an expired/unknown session or conflicting server part metadata.
  - Expect: The call fails explicitly without silently starting a new upload or skipping inconsistent data.

- [ ] **RESUME-006 — Lost completion reply** · `T/H`
  - Do: Process completion server-side but lose its response; inspect on recovery.
  - Expect: The completed authoritative result is returned without applying completion twice.

- [ ] **RESUME-007 — Completion never processed** · `T/H`
  - Do: Fail before completion reaches the server, then resume.
  - Expect: The session remains recoverable; subsequent inspection leads to safe finalization rather than a fabricated completed state.

- [ ] **RESUME-008 — Already-completed response representation** · `T/E`
  - Do: Resume a completed session requesting its supported result representation, then one the inspector cannot supply.
  - Expect: Matching authoritative data resolves; a representation mismatch rejects and a live stream is not invented as an upload-completion result.

- [ ] **RESUME-009 — Persistence order and failure** · `T`
  - Do: Delay sequential saveCheckpoint callbacks and make one reject, including the first save.
  - Expect: Snapshots are awaited in order; further scheduling stops and available in-memory recovery information is retained.

- [ ] **RESUME-010 — Safe part retry only** · `T/H`
  - Do: Fail a replay-safe part once, then repeat with replay safety absent and with per-call retry:false.
  - Expect: Only permitted failed parts retry, stable per-step keys are reused, and explicit disable wins without replaying the entire session blindly.

- [ ] **RESUME-011 — Session key isolation** · `T`
  - Do: Run equal-content transfers concurrently and inspect initiation, part and completion idempotency namespaces.
  - Expect: Each logical transfer/session remains distinct, and protocol steps use stable distinct keys within their own logical work.

- [ ] **RESUME-012 — Renew with sibling acknowledgment** · `T`
  - Do: While one part renews/reconciles an expired destination, acknowledge another parallel part.
  - Expect: The sibling acknowledgment survives reconciliation; no required acknowledgment is accidentally lost.

- [ ] **RESUME-013 — Bounded renewal and uncertain delivery** · `T/H`
  - Do: Expire a URL after uncertain delivery, invoke explicit renew/inspect and repeat expiry to the configured bound.
  - Expect: The backend is reconciled before retrying uncertainty; renewal is bounded and does not create an infinite recovery loop.

- [ ] **RESUME-014 — Integrity evidence and crypto availability** · `T/N`
  - Do: Check a known SHA-256 vector, return a checksum mismatch, then remove required Web Crypto in a harness.
  - Expect: Valid digests match expected bytes; mismatch prevents completion; required crypto fails before initiate. ETag is never assumed to mean MD5.

- [ ] **RESUME-015 — Session ID encoding and authorization** · `T/H`
  - Do: Feed opaque checkpoint session IDs containing URL-sensitive characters into a caller-authored protocol builder using encodeURIComponent.
  - Expect: IDs remain data in URLs and the backend checks ownership; Core is not assumed to validate the application's URL construction or authorization.

<a id="sign"></a>

## Presigned destinations and S3-compatible recipes — SIGN

Sources: [presigned contract](../packages/core/README.md#presigned-destinations), [presigned tests](../tests/core/advanced-transfer-presigned.test.ts), [S3 recipe](../examples/frontends/query-ssr-next/lib/s3-transfer.ts).

- [ ] **SIGN-001 — Explicit destination policy** · `T/H`
  - Do: Configure exact HTTPS allowed origins and try an allowed signed URL plus another host/port/scheme.
  - Expect: Only an explicitly authorized destination is dispatched; ordinary origin guards are not globally disabled.

- [ ] **SIGN-002 — Exact signed query bytes** · `T/H`
  - Do: Use a synthetic signed URL with repeated parameters, encoded characters and ordering-sensitive values.
  - Expect: Its query encoding/order remains unchanged; ordinary query/path options cannot silently rewrite the signature input.

- [ ] **SIGN-003 — No ambient credentials** · `T/H`
  - Do: Set API auth headers, a dynamic header provider, cookies and ordinary middleware, then issue a delegated request.
  - Expect: No inherited credentials/headers/metadata or ordinary request middleware crosses into storage; Fetch omits credentials.

- [ ] **SIGN-004 — Allowed headers only** · `T`
  - Do: Try signed headers outside policy and forbidden credential/host headers, including changes by explicitly trusted middleware.
  - Expect: Post-middleware checks reject unauthorized headers/destination/method/body changes before dispatch.

- [ ] **SIGN-005 — No signed redirects** · `T/H`
  - Do: Have a delegated storage request redirect, including toward another allow-listed origin.
  - Expect: The delegated request fails closed instead of following the redirect with a secret-bearing URL or body.

- [ ] **SIGN-006 — Custom transport capability** · `T`
  - Do: Use a transport without presigned capability, then a conforming opted-in transport.
  - Expect: Core rejects the former before dispatch; the latter must actually enforce supplied security policy rather than merely advertising a flag.

- [ ] **SIGN-007 — Sanitized failure surfaces** · `T`
  - Do: Cause signed failures with nested causes/stacks and an attempted auth-refresh replay; inspect all library observer/error metadata.
  - Expect: Signed URL/token details are redacted on sanitized surfaces and generic signed replay is disabled; trusted middleware remains responsible for its own logs.

- [ ] **SIGN-008 — S3 raw parts versus form multipart** · `T/H`
  - Do: Use the recipe with author-owned initiate/presign/list/complete/abort endpoints; inspect part requests.
  - Expect: Raw chunk blobs and ordered acknowledgment/ETag manifests follow the session protocol; HTTP FormData is not substituted for S3 multipart semantics.

- [ ] **SIGN-009 — ETag visibility and provider normalization** · `B/H`
  - Do: Run the recipe cross-origin with ETag exposed, then omit exposure; inspect provider error and paginated part-list handling.
  - Expect: The browser can capture required evidence only with correct storage CORS; backend decoders normalize provider results and paginate authoritatively.

- [ ] **SIGN-010 — Safe query identity for signed reads** · `R/E`
  - Do: Use a presigned download query with explicit nonsecret keyParts; inspect keys, dehydrated data and error logs.
  - Expect: The temporary signed URL is not a cache key or SSR prop; existing response-size/stream constraints still apply.

<a id="sec"></a>

## Ordinary origin and redirect security — SEC

Sources: [HTTP origin protection](../tests/core/http-security.test.ts), [redirect security](../tests/core/redirect-security.test.ts), [hardening behavior](public-api.md#v180-behavior-notes-hardening-one-optional-option-no-new-exports).

- [ ] **SEC-001 — Block cross-origin before contact** · `T/H`
  - Do: Try a cross-origin declarative path, dynamic getBy path and function ctx.request with a destination recorder.
  - Expect: Each is rejected before the foreign destination receives a request; localhost/private hostnames are not automatically trusted.

- [ ] **SEC-002 — Same-origin redirect handling** · `N/H`
  - Do: Return a controlled same-origin redirect in a runtime that exposes destinations and inspect method/header behavior.
  - Expect: Supported same-origin redirects follow the documented HTTP rules, preserving only what the contract permits for that status/method.

- [ ] **SEC-003 — Cross-origin redirect default** · `N/H`
  - Do: Return a cross-origin redirect carrying synthetic sensitive headers on the original request.
  - Expect: SecurityError occurs before the target is contacted; credentials/custom headers do not escape the original origin.

- [ ] **SEC-004 — Explicit redirect allowlist** · `N/H`
  - Do: Use redirectOrigins for a permitted GET/HEAD destination and record its received headers/body/cookies.
  - Expect: The opt-in hop is credential/header/body-free; permission is exact and does not authorize arbitrary write-body forwarding.

- [ ] **SEC-005 — Cross-origin write redirect** · `N/H`
  - Do: Redirect a write with a body toward another origin, even with that origin allow-listed.
  - Expect: The write/body is not forwarded under the GET/HEAD-only cross-origin exception.

- [ ] **SEC-006 — Browser hidden redirect** · `B/H`
  - Do: Trigger a real redirect through browser Fetch using the built-in transport.
  - Expect: The request fails closed where destinations cannot be inspected; do not mark Node's following behavior as the browser expectation.

- [ ] **SEC-007 — Redirect chain and untrusted hop** · `N/H`
  - Do: Use several controlled hops with one untrusted destination and inspect each server's counters.
  - Expect: Every hop is checked; a trusted first hop does not authorize the later untrusted target.

- [ ] **SEC-008 — Caller-controlled transport boundary** · `T`
  - Do: Review and exercise a custom transport's redirect/credential handling against the same recorder cases.
  - Expect: Record actual conformance; the built-in Fetch security guarantee is not blindly attributed to arbitrary user code.

<a id="hard"></a>

## Lifecycle, performance and regression probes — HARD

Sources: [hardening milestone](../versions/v1.8.0/acceptance-criteria.md), [production guide](guides/humans/production-file-handling.md), [memory tests](../tests/core/file-memory-bounds.test.ts).

- [ ] **HARD-001 — Memory versus file size** · `N/T/H`
  - Do: On the same machine/commit, measure increasingly large synthetic transfers with fixed chunk size/concurrency and a streaming sink.
  - Expect: Retained/in-flight memory tracks bounded working buffers plus capped metadata, not whole file size; record measurements instead of universal timing claims.

- [ ] **HARD-002 — Checkpoint growth** · `N/T`
  - Do: Measure acknowledgment handling at increasing part counts using the same harness and settings.
  - Expect: Bookkeeping does not regress to quadratic behavior; snapshot metadata stays within the documented serialized cap.

- [ ] **HARD-003 — Virtual path scale** · `M/N`
  - Do: Compare many organized file puts/list operations using fixed-size file metadata and controlled counts.
  - Expect: No per-entry allocation-heavy collision scan regression returns; correctness matches small cases before comparing performance.

- [ ] **HARD-004 — Paged dataset reads** · `M/N`
  - Do: Read a small page from large data and compare retained allocations with an unpaged read.
  - Expect: Only returned rows are copied as documented; paging does not accidentally clone the entire dataset for each request.

- [ ] **HARD-005 — Repeated start/abort/reset cycles** · `M/T/R`
  - Do: Repeat a bounded number of reads/uploads with abort, timeout and reset while inspecting active work and retained handles.
  - Expect: Requests, timers/listeners, drafts and observers settle; memory is evaluated after cleanup rather than during valid in-flight work.

- [ ] **HARD-006 — Source buffer lifetime** · `T/N`
  - Do: Complete a transfer, release consumer references/control/checkpoint callbacks, then inspect retained source/buffer references.
  - Expect: The library does not retain unnecessary completed-source bytes; app-held references are distinguished from SDK retention.

- [ ] **HARD-007 — Late events after settlement** · `T/R`
  - Do: Release delayed acknowledgments/progress after failure, cancel or unmount.
  - Expect: No misleading success, duplicate terminal report or unsafe late commit updates the settled call/UI.

- [ ] **HARD-008 — Remote ownership boundary** · `M/H`
  - Do: Compare mock-managed replacement cleanup with a live update that changes a remote file reference.
  - Expect: Mock rules manage client-owned bytes only; remote deletion/expiry remains an explicit author-owned backend operation.

- [ ] **HARD-009 — Full repository regression** · `N/P/R`
  - Do: Run pnpm verify on the selected tree and inspect each stage rather than reusing an older pass.
  - Expect: Build, architecture, API, types, tests, packed consumers, browser and edge checks actually pass or have individually recorded failures/blockers.

<a id="type"></a>

## Editor and declaration contracts — TYPE

Sources: [state typing](../tests/core/define-api-state.test.ts), [inference](../tests/core/operation-inference.test.ts), [file types](../tests/core/file-fields-types.test.ts), [packed consumers](public-api.md).

- [ ] **TYPE-001 — Entity-only derived writes** · `E`
  - Do: Declare an entity with id, required fields and optional fields; inspect create/update/patch inputs and result types.
  - Expect: Inputs follow current entity derivation and operation contract without duplicating create/update state metadata or using consumer casts.

- [ ] **TYPE-002 — Untyped payload honesty** · `E`
  - Do: Omit entity metadata on a non-mock-inferred resource and inspect payload types.
  - Expect: Unknown remains unknown where no reliable inference exists; convenience does not introduce accidental any.

- [ ] **TYPE-003 — Runtime path owns arity** · `E`
  - Do: Supply nested runtime paths and misleading legacy metadata paths; check call completions and missing arguments.
  - Expect: Runtime definition controls required parameters; payload metadata does not invent or erase a runtime route argument.

- [ ] **TYPE-004 — Resource list and query types** · `E`
  - Do: Declare custom list/query metadata and inspect getAll options/results.
  - Expect: List envelope and filter types remain intact instead of collapsing everything to Entity[].

- [ ] **TYPE-005 — Operation metadata refinement** · `E`
  - Do: Declare a custom operation's body/query/response metadata and an actual runtime implementation.
  - Expect: Payload refinement works but missing runtime resources/implementations do not appear as executable methods merely from types.

- [ ] **TYPE-006 — File read/write distinction** · `E`
  - Do: Inspect single and array file-reference entities through direct Core, adapter and React operations.
  - Expect: Read values stay strings/reference arrays; supported writes accept native binary forms without changing unrelated fields.

- [ ] **TYPE-007 — Response mode and envelope typing** · `E`
  - Do: Inspect inferred text/Blob/ArrayBuffer/stream results and full:true direct results, including function ctx.request.
  - Expect: Return types match documented parsing and metadata precedence; hook arguments exclude Core full envelopes.

- [ ] **TYPE-008 — Read/write wrappers and disabled names** · `E`
  - Do: Try a write in a query, a read in mutations and a disabled operation anywhere.
  - Expect: Invalid usage is rejected and autocomplete reflects actual selected operations rather than every historical name.

- [ ] **TYPE-009 — Native query and callback inference** · `E`
  - Do: Inspect selected/initialData types, mutation variables/context and advanced controller/options signatures.
  - Expect: Native inference survives; documented generic-wrapper/context inference limits are recorded rather than patched with broad any casts.

- [ ] **TYPE-010 — Interface state and extension seams** · `E/P`
  - Do: Use interface-based API state and supported declaration augmentation in a clean packed consumer.
  - Expect: Interfaces and documented extension seams work through public types without exposing private implementation modules or adding a framework dependency to Core.

<a id="hist"></a>

## Pre-v1 history and migration checks — HIST

Sources: each linked milestone in the coverage map, [current compatibility contract](public-api.md), [migration notes](../packages/react/README.md#v100-breaking-changes). Run retired syntax only in an isolated matching historical checkout.

- [ ] **HIST-001 — v0.1 explicit operation baseline** · `X/E/T`
  - Do: Check out v0.1.0 history with its own dependencies and configure the explicitly enabled original CRUD operations from its contract.
  - Expect: That historical contract is assessed there; its explicit opt-in rule and getByID spelling are not asserted as the current API.

- [ ] **HIST-002 — v0.2 default-first transition** · `X/E/T`
  - Do: Compare a path-only resource and partial overrides across the v0.1/v0.2 transition using each version's docs.
  - Expect: The transition to default-first behavior is verified against each historical contract; the current catalog uses today's expanded defaults.

- [ ] **HIST-003 — v0.3 marker introduction** · `X/E`
  - Do: Try type/Type/Infer in the matching v0.3 history and inspect body/response inference.
  - Expect: The historical marker design is covered without suggesting those removed exports exist in the current package.

- [ ] **HIST-004 — v0.4 marker removal and entity state** · `X/E`
  - Do: Migrate a marker-based definition to the v0.4 resource-entity form; compare a current clean consumer.
  - Expect: Removed markers are not required/accepted as current public helpers; entity metadata supplies the supported derivation.

- [ ] **HIST-005 — v0.5 dataset and backend history** · `X/N`
  - Do: Review the initial local dataset/mock transport entry points and historical FastAPI removal against the milestone.
  - Expect: Old setup dependencies are not copied into current instructions; today's Laravel playground is an independent later environment, not that retired backend.

- [ ] **HIST-006 — v0.6-v0.7 request evolution** · `X/E/T`
  - Do: Compare old around-style/augmentation examples with current onRequest/onResponse/onError stage hooks, raw bodies and retry options.
  - Expect: Migrations preserve intent using the current pipeline; obsolete `(ctx, next)` middleware is not mixed into the current stage-hook API.

- [ ] **HIST-007 — v0.8 query entry evolution** · `X/E/R`
  - Do: Map the early resource-query usage/imports to current apixa/react and advanced entry points.
  - Expect: Query intent survives while removed unpublished tanstack-query paths are not described as current installation targets.

- [ ] **HIST-008 — v0.9 flat mock transition** · `X/E/M`
  - Do: Translate the previous Core mock configuration into the current resource-level data-source form.
  - Expect: Mock selection and behavior remain explicit; operation handlers are placed on operations rather than hidden in a data source object.

- [ ] **HIST-009 — v0.10 builtin rename and customization** · `X/E/T`
  - Do: Compare the original expanded builtins with current createMany/deleteMany, getById and custom function definitions.
  - Expect: Retired bulkCreate/bulkDelete spellings and older function contracts are not accidentally promised by current generated clients.

- [ ] **HIST-010 — v0.11 correction versus current independence** · `X/T`
  - Do: Read that milestone's composed-operation fix, then run today's independent getMany/findFirst/exists cases.
  - Expect: Historical delegation fixes do not override today's later resolved-operation independence contract.

- [ ] **HIST-011 — v1.0 classification and query/write split** · `X/E/R`
  - Do: Migrate readOperations, old single-operation mutation signatures and custom bare functions to current explicit kinds/resource mutations.
  - Expect: Current imports/signatures reject removed forms where documented and retain native Promise and TanStack behavior.

<a id="lar"></a>

## Laravel/PostgreSQL environment manual readiness — LAR

Sources and exact provisioning/Storage commands: [backend README](../examples/backends/laravel-backend/README.md). These cases exercise infrastructure only and do not add endpoints.

- [ ] **LAR-001 — Dependency installation and boot** · `L/N`
  - Do: Select supported PHP with pdo_pgsql, run composer install and php artisan --version/about.
  - Expect: The locked framework boots without missing-platform exceptions; no npm dependency is needed in Laravel.

- [ ] **LAR-002 — Development database identity** · `L`
  - Do: Use db:show or the README's read-only identity query before any migration/write.
  - Expect: The active connection is PostgreSQL and selects apixa_laravel_dev, with the intended dedicated role; production is not selected.

- [ ] **LAR-003 — Default migrations** · `L`
  - Do: After identity confirmation, run php artisan migrate and migrate:status against the development environment.
  - Expect: Only the standard framework migrations run and status is consistent; existing unrelated databases remain untouched.

- [ ] **LAR-004 — Real health serving** · `L/B`
  - Do: Run the documented serve command on 127.0.0.1:8000 with --no-reload and visit /up and /.
  - Expect: The built-in health route and stock welcome work over real HTTP; stop the owned process with Ctrl-C afterward.

- [ ] **LAR-005 — Empty API registration** · `L`
  - Do: Inspect bootstrap/app.php and routes/api.php; run route:list --path=api and request a nonexistent API path.
  - Expect: Native /api routing is registered, there are no application endpoints, and a nonexistent API request returns the normal JSON failure.

- [ ] **LAR-006 — Allowed and denied frontend origins** · `L/B/H`
  - Do: Use the README preflight commands for configured and unlisted origins; when a frontend exists repeat in an actual browser.
  - Expect: Preflight headers match the configured method/header/origin policy. Curl-only evidence is recorded as HTTP preflight evidence, not browser execution.

- [ ] **LAR-007 — Credentialed CORS configuration** · `L/B/H`
  - Do: Temporarily configure credentials with exact origins and a wildcard input in a private environment, clear stale config and inspect responses.
  - Expect: Wildcard is excluded; only matching exact-origin policy permits browser access. Restore the local setting and never infer CORS provides auth.

- [ ] **LAR-008 — Private filesystem lifecycle** · `L`
  - Do: Use Laravel's Storage facade as documented to write, read, delete and confirm absence of a temporary private file.
  - Expect: Private storage is writable and byte-correct; no verification artifact or public private-file serving route remains.

- [ ] **LAR-009 — Public link boundary** · `L`
  - Do: Use storage:link where appropriate, inspect its target, then remove the verification link if it was created only for the run.
  - Expect: The public disk alone is exposed; private storage is not accidentally linked into public web access.

- [ ] **LAR-010 — Separate test and E2E identity** · `L`
  - Do: Prepare private testing/playwright env files from examples and run the read-only identity query with each explicit --env selection.
  - Expect: apixa_laravel_test and apixa_laravel_e2e are independently selected; no reset/migration is run just to prove identity.

- [ ] **LAR-011 — PHPUnit database selection** · `L`
  - Do: Inspect phpunit.xml and run the default backend tests under the testing environment.
  - Expect: No in-memory SQLite override silently replaces PostgreSQL. Default tests passing are not claimed as proof of future database-dependent application behavior.

- [ ] **LAR-012 — Multi-worker readiness** · `L/H`
  - Do: Start with PHP_CLI_SERVER_WORKERS=4 and --no-reload, inspect child processes and send simultaneous /up requests.
  - Expect: Supported runtime really has multiple workers; health concurrency is recorded only as infrastructure evidence, not locking/race correctness.

- [ ] **LAR-013 — Production configuration readiness** · `L`
  - Do: Review the production example/external overrides and perform a disposable no-dev installation/cache build as documented.
  - Expect: Debug is off, secrets/origins/DB credentials are externally supplied, caches build and runtime dirs are writable; no actual deployment is claimed.

- [ ] **LAR-014 — Configuration switching and cache cleanup** · `L`
  - Do: Switch explicitly between private development/testing/playwright configs using normal Artisan env selection; clear stale config caches and recheck identity.
  - Expect: A cached development connection cannot masquerade as the selected test environment; later commands use the verified intended database.

- [ ] **LAR-015 — Stop and restart ownership** · `L`
  - Do: Stop the owned Laravel process, confirm its port is free, then restart. Stop PostgreSQL only if no other project needs the shared service.
  - Expect: Shutdown does not reset/drop databases or kill unrelated application processes; restart preserves development data.

- [ ] **LAR-016 — Native setup troubleshooting** · `L`
  - Do: On a new machine follow native prerequisites; check DB listener/address, role auth, PHP PATH/extensions and permissions when a step fails.
  - Expect: The exact missing prerequisite is recorded. The known local IPv6 listener can use ::1 in ignored env files without rewriting tracked illustrative defaults or cluster auth.

- [ ] **LAR-017 — Relational baseline and model relations** · `L`
  - Do: Follow the dataset README migrations/seed commands, inspect all twelve fixture ID sets and eager-load article/contact/comment and shared document-link relationships.
  - Expect: The 425-row fixture baseline has correct parents and real foreign-key/unique/check constraints; unrelated manually created IDs survive reseeding.

- [ ] **LAR-018 — Native JSONB structure and queries** · `L`
  - Do: Query nested profile city and product tags through Eloquent, comparing omitted/null keys, false/zero and empty object/array fixtures.
  - Expect: PostgreSQL JSONB and the configured casts preserve the intended data types; queries return the known fixture matches.

- [ ] **LAR-019 — Separate Mongo document baseline** · `L`
  - Do: Run the explicit Mongo migration path and seed three document collections; inspect embedded comments, nested profiles, Decimal128 prices and repeated seed counts.
  - Expect: The 195 fixture documents have stable identities/indexes and remain separate from PostgreSQL; no cross-store synchronization/transaction is implied.

- [ ] **LAR-020 — Seed isolation and private file fixtures** · `L`
  - Do: Check dev/test/E2E identities in both stores, verify manifest byte lengths/hashes, and exercise seeder rejection in a controlled production/wrong-database configuration test.
  - Expect: Only explicitly selected playground stores are seeded, changed private fixture files are not overwritten, and optional large files require a separate command.

<a id="journey"></a>

## Cross-feature user journeys — JOURNEY

These combine existing case groups once to expose integration gaps. Every real-HTTP workflow waits for the corresponding author-owned backend routes; no such routes are added by this notebook.

- [ ] **JOURNEY-001 — First consumer to first valid write** · `P/E/M/H`
  - Do: Install a packed build, define an entity resource, read data, create a disposable record, then read and delete it.
  - Expect: Types, package imports, wire shape, error handling and lifecycle agree end to end; record separately whether execution was mocked or HTTP.

- [ ] **JOURNEY-002 — Paginated search with edits** · `R/M/H/B`
  - Do: Search/filter a paged list, open a detail, edit it, and return to the list after invalidation.
  - Expect: Scope/filter/page identities remain distinct and the expected views reconcile without overwriting another tenant or unrelated page.

- [ ] **JOURNEY-003 — Form with file and validation** · `R/B/M/H`
  - Do: Submit a native file form first with invalid input, then valid input, then replace one file while retaining another.
  - Expect: Invalid input sends/commits nothing; valid results become references and the correct file ownership/cleanup behavior is visible.

- [ ] **JOURNEY-004 — Authenticated refresh with a file write** · `T/H/R`
  - Do: Use a synthetic token refresh/replay flow during an explicitly retry-safe multipart write with a stable key.
  - Expect: Fresh auth and intact multipart bytes are used on replay, logical idempotency is preserved, and no unsafe automatic backend deduplication claim is made.

- [ ] **JOURNEY-005 — Upload then download verification** · `M/H/B`
  - Do: Upload known bytes, read the resulting reference, download it, compare bytes and remove the disposable owner.
  - Expect: The read model, storage lookup and binary response agree; cleanup follows mock ownership or the explicit backend lifecycle policy as appropriate.

- [ ] **JOURNEY-006 — Cancel slow download and retry** · `R/B/H`
  - Do: Begin a slow download, cancel from UI, dispose its stream/object URL, then start a fresh call.
  - Expect: No stale success UI or live forgotten stream remains; the second call succeeds independently and actual bytes match.

- [ ] **JOURNEY-007 — Crash and resume advanced upload** · `T/H/R`
  - Do: Persist a checkpoint, terminate the caller, reacquire the same source and resume with a new control after inspecting server state.
  - Expect: Only missing work is safely replayed, finalization is reconciled, and UI/cache success occurs after authoritative completion.

- [ ] **JOURNEY-008 — Optimistic edit under overlapping requests** · `R/T`
  - Do: Run an optimistic update alongside an old fetch and a second mutation; fail the first mutation and settle the others out of order.
  - Expect: The documented layer/send-order model holds, successful changes survive rollback and final refetch reconciles server state.

- [ ] **JOURNEY-009 — Mock-to-live consumer switch** · `M/H/R`
  - Do: Run the same supported resource workflow with a Core mock, then author-owned HTTP endpoints using equivalent explicit scope/keys.
  - Expect: Shared behavior agrees where supported; different error/stream/session capabilities are recorded instead of hidden behind fabricated parity.

- [ ] **JOURNEY-010 — Two backends and two users** · `T/H/R`
  - Do: Use defineApis and request-scoped/safely scoped caches for two backends/users, including a failure/refresh on one.
  - Expect: Credentials, queries, files, retries and errors stay with the correct client/user; no cross-origin or cache contamination appears.

## Cases intentionally waiting for project growth

Keep these separate from implemented-case results. Promote an idea into a normal case only when a milestone and concrete contract exist; link its implementation and assign a stable ID then.

| Idea                                                               | What must exist before manual execution                                                            | Current boundary                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Genuine Laravel CRUD and server validation                         | Author-owned routes, controllers, models, response contracts and disposable rows                   | The environment currently contains none of these endpoints                     |
| Database contention, locks and isolation anomalies                 | Author-owned transactions plus independent simultaneous HTTP/DB connections and defined invariants | Multiple workers and PostgreSQL alone do not prove business correctness        |
| Backend idempotency under simultaneous duplicate requests          | Author-owned key persistence/deduplication/conflict policy                                         | Apixa sends keys; the server implements deduplication                          |
| Remote file replacement/deletion and orphan cleanup                | Author-owned storage and lifecycle policy, including failure recovery                              | Apixa does not automatically delete backend/provider objects                   |
| Real resumable/provider uploads                                    | Author-owned session protocol and signing/inspection/completion endpoints                          | An SDK protocol recipe is not a deployed provider backend                      |
| Actual browser suite against Laravel                               | Separate frontend, explicit backend E2E environment and author-owned test scenarios                | Playwright is not installed inside Laravel and no scenarios are supplied       |
| Dedicated React Hook Form adapter                                  | Separate approved integration milestone and its public contract                                    | Native File and Promise form workflows can be checked today without an adapter |
| Other framework integrations                                       | Approved Vue/Angular/etc. implementation and supported consumer                                    | Do not turn Core compatibility into a claim of a shipped framework adapter     |
| OpenAPI, GraphQL, SSE, WebSocket, gRPC and remote catalog products | Their own scoped implementations and contracts                                                     | Not implied by custom operation extensibility                                  |
| Ranged/resumable downloads                                         | Explicit orchestration contract and server Range behavior                                          | Existing response streaming is not download-resume orchestration               |
| Cross-tab transfer coordination and durable checkpoint storage     | Caller-owned persistence/coordination design and backend session authorization                     | Controls and checkpoints do not provide a cross-tab storage product            |
| Production deployment smoke and rollback                           | Owner-selected serving stack, deployment, ingress, DB permissions and real monitoring              | Production configuration readiness is not production deployment                |

New use cases should describe an observable user outcome, not just another combination of the same toggles. Add a new case when ownership, failure stage, wire contract, cache identity or runtime behavior changes. Use the existing variation matrix for ordinary extra input values.

## Source inventory for deeper regression work

This catalog groups risks instead of reproducing every unit assertion. When a new defect appears, read the relevant tests and promote the missing user-visible risk into one permanent case.

| Concern                                      | Existing source of detailed examples                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions, arity, selection and metadata   | `tests/core/define-api*.test.ts`, `operation-inference`, `operation-selection`, `operation-classification`, `default-operations`, `config-validation` |
| Builtin wire behavior and independence       | `tests/core/operations-builtins.test.ts`, `operations-customization`, `operation-independence`, `http`, `read-options-types`                          |
| Request pipeline and transformations         | `tests/core/headers.test.ts`, `config-merge`, `middleware`, `transforms`, `v1-polish`, `transport-fetch`                                              |
| Reliability and idempotency                  | `tests/core/reliability.test.ts`, `retry-timeout`, `idempotency`, `idempotency-retries`, `download-reliability`                                       |
| Core/adapter mocks and datasets              | `tests/core/mock-*.test.ts`, `dataset-registration`, `resource-slice`, `tests/mocking/`                                                               |
| Upload serialization and file types          | `tests/core/file-requests.test.ts`, `multipart-serialization`, `file-fields-types`, `mock-files`                                                      |
| Downloads and filename metadata              | `tests/core/response-types.test.ts`, `download-types`, `content-disposition`, `mock-downloads`                                                        |
| Progress and streams                         | `tests/core/transfer-*.test.ts`, `download-progress`, `upload-progress`, `stream-lifecycle`, `stream-limits`                                          |
| Input/output safety and error consistency    | `tests/core/file-rules-*.test.ts`, `file-validation-*.test.ts`, `response-limits`, `validation-transfer`, `file-error-matrix`, `error-secrecy`        |
| Virtual ownership, fixtures and rollback     | `tests/core/mock-storage*.test.ts`, `mock-fixtures`, `mock-file-lifecycle`, `mock-write-faults`, `tests/mocking/mock-file-storage.test.ts`            |
| Advanced sessions, security and races        | `tests/core/advanced-transfer-*.test.ts`, `redirect-security`, `http-security`, `operation-security`                                                  |
| Hooks, cache, optimistic state and SSR       | `tests/react/`, `tests/internal-shared/`, `examples/frontends/query-ssr-next/`                                                                        |
| Packed artifact and runtime constraints      | `tests/facade/`, `tests/architecture/`, existing `scripts/verify-*` checks and root package scripts                                                   |
| Measured hardening and ownership contract    | `versions/v1.8.0/acceptance-criteria.md`, production file handling guide                                                                              |
| Laravel prerequisites and environment checks | `examples/backends/laravel-backend/README.md`, its four environment examples, standard Laravel configuration and default tests                        |

Historical test filenames can remain after an API changes. Read the test's actual assertions and the current public contract; a filename such as `type-markers` does not mean markers are still supported.

## Run log

Copy this block for each testing session. Leave secrets out of the evidence.

```text
Run ID / date:
Tester:
Commit / branch / packed artifact:
Milestone(s) covered:
Node / browser / OS / React / TanStack versions:
Backend URL and environment (no credentials):
Verified database identity, if applicable:
Execution modes used:
Selected case IDs / variation dimensions:
Passed:
Failed (actual versus expected + reproduction):
Blocked (exact missing prerequisite):
Not applicable (contract-based reason):
Deferred (owner decision / future feature):
Evidence links / redacted logs / screenshots:
Cleanup performed / temporary resources still owned:
Follow-up issue or local note:
```

Use this ledger for concise ongoing tracking; duplicate rows as needed. A blocked or deferred case retains an empty checklist box.

| Run | Case ID | Result  | Evidence / actual behavior                      | Next action                                  |
| --- | ------- | ------- | ----------------------------------------------- | -------------------------------------------- |
| —   | —       | Not run | Initial catalog; no fresh test results asserted | Choose a group and prepare its prerequisites |

## Maintaining this catalog over time

1. When a milestone starts, add its map row and candidate cases; mark planned behavior explicitly until implemented.
2. When it lands, validate wording against the actual code/public API and link the regression source. A milestone folder alone is not proof that a feature shipped.
3. Before changing an existing expectation, explain the contract change and retain a historical migration case where users can be affected.
4. Every fixed user-visible defect gets a case that describes the trigger, observable failure and expected recovery. Keep low-level implementation-only assertions in automated tests.
5. Preserve IDs. If two cases duplicate one risk, retain one and replace the other with a redirect note rather than silently reusing its ID.
6. Keep setup once per group or in the linked package/backend README. Do not copy long setup scripts or API declarations into every case.
7. Track app-owned resources explicitly: readers, object URLs, QueryClients, transfer controls, checkpoints, temporary records and backend sessions. Cleanup is part of the observed workflow.
8. Add newly supported runtimes/consumers to the matrix. Treat unsupported capabilities as a documented result, not a reason to fake a pass.
9. Review the growth ideas after each milestone and promote only work that now has a concrete implementation contract.
10. Reset visible checkboxes or make a fresh run copy when changing the tested baseline; retain previous evidence in the run log instead of carrying passes forward silently.
