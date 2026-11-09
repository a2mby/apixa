# v1.5.0 — Implementation plan

Implementation authorized on issue #99, branch `task/99-advanced-mock-file-storage`. Follow the batches below in order. Owner sign-off recorded on 2026-11-09.

## Architectural decisions and recommendations

These are proposed milestone decisions, not claims of implemented API or owner approval.

| ID  | Decision                       | Recommendation and rejected alternative                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Disks/namespaces               | Use one optional string `disk`, default `default`, inside the existing store. A disk is a logical partition, not a global registry, separate backend or security boundary. Avoid two synonymous configuration systems.                                                                                                                                                                                                                                                       |
| S2  | Paths and references           | Put normalized relative `path` and `disk` in existing metadata. Keep `mock-file://<uuid>/<encoded-name>` and bare-ID resolution; ID is authoritative, name suffix stays descriptive. Do not encode disk/path into refs or tighten `isMockFileRef`.                                                                                                                                                                                                                           |
| S3  | Naming and identity            | Keep original names and UUID refs by default. Optional unique stored filename or deterministic naming callback changes metadata `name` and new refs' suffix, never existing refs. Add `originalName` only for renamed files. Inject a UUID generator for tests; reject invalid/duplicate generated IDs. Names and IDs are separate concerns.                                                                                                                                 |
| S4  | Configuration/public surface   | Extend resource `mock: { data, idKey?, seed?, storage?, fixtures? }` and optional `MockFileStorage` constructor/put options. `storage` holds resource defaults (`disk`, directory, naming, ID callback). Resource configuration must not mutate shared client defaults. Reuse `mockFiles(api)`; no new storage client. Exact option/helper names are locked in Batch 0.                                                                                                      |
| S5  | Fixtures/datasets              | Runtime-neutral descriptor (text, Uint8Array or Blob plus name/type/lastModified; optionally lazy factory) in resource `fixtures` keyed by a local name. Recommend opt-in `mock-fixture://<key>` string tokens in declared seed file fields; resolve to ordinary UUID refs before exposing records. Same key deduplicates within one resource's seeded fixture set, not across clients/resources. Existing dataset shapes and cached JSON stay unchanged.                    |
| S6  | Reference resolution           | Existing `get/meta/has` resolve the local store only; predicate remains syntactic. No fetching a ref. Unknown fixture key or bad scoped reference fails seed initialization with existing `MockError`; seed records and staged files remain unpublished. With no fixture registry, preserve existing seed-string behavior. Reject new foreign/stale refs only in the opted-in fixture workflow unless a compatibility change is approved.                                    |
| S7  | Ownership and cleanup          | Internally track committed record references by resource/record/field plus fixture baseline pins. Shared refs survive until their last managed owner/pin is removed. Automatic cleanup never deletes another resource's active ref. Public low-level `put` is manually owned until explicit delete/clear/reset; keep legacy resource tagging. No public ref-count model.                                                                                                     |
| S8  | Reset and missing data         | Resource reset drops transient ownership and restores a reproducible fixture baseline, leaving other resources intact. Whole-client reset covers all mocked resources. Keep reset synchronous: invalidate generation immediately, discard pending work and lazily rehydrate fixtures on next awaited operation. Reads after explicit delete/clear retain existing missing-file behavior; reset must repair fixture baselines, not retain dangling seeded refs.               |
| S9  | Atomic managed writes          | Stage bytes and record changes privately within the existing store/executor; verify inputs, IDs, refs and signal, then publish records/bytes/ownership in one synchronous commit. Per-resource serialization or revision checks and per-client ID reservations prevent lost updates/collisions. Reset generations prevent an older async read/load from publishing after reset. Avoid whole-client byte snapshots.                                                           |
| S10 | Handler boundary               | Recommend transaction-local `store` handles for declarative handlers with read-your-writes and automatic file conversion/cleanup at successful settlement. Throw/abort discards changes and revokes late writes. Preserve read-only `files`. This changes documented immediate-write/no-rollback semantics: approve before implementation. Legacy `defineMockApi` liveRows callbacks need separate analysis; never claim arbitrary callback side effects can be rolled back. |
| S11 | Extensibility                  | Defer public or optional storage-driver interface: one in-memory backend is sufficient. Internal staging helpers can evolve without becoming an adapter contract. No filesystem, cloud, database, S3 or provider dependencies.                                                                                                                                                                                                                                               |
| S12 | Listing, lifecycle and exports | Extend metadata filters with disk and segment-aware path prefix; preserve insertion order. Listing is metadata-only, linear in stored entries; no sorting/copying bytes or eager fixture loading. Export only consumer-needed descriptors/options through existing Core/Mocking subpaths; keep transactions, indexes, generations and ownership internal.                                                                                                                    |

### Path and naming rules to characterize and lock

Use portable `/` separators; normalize backslashes, repeated separators and `.` segments. Reject
absolute paths, drive/UNC paths, NUL/control characters, `..` segments and URI-like schemes before
joining. Reject encoded traversal/separators rather than repeatedly URL-decoding; define this once
for configuration, callbacks and filters. An empty directory denotes disk root. A filename is a
single safe segment; an unsafe original display name may remain in existing metadata but must
never become an unsafe virtual path. Disk names are nonempty safe identifiers, not paths.

Recommend virtual path = normalized directory + stored safe filename; same disk/path collision
rejects without overwrite. Preserve duplicate original upload names by using an internal ID directory
in the default path; opt-in exact paths must choose unique names or accept a collision error. A
prefix `a/` matches descendants of `a`, not `ab`; metadata paths are not a second lookup identity.
Define Unicode/case policy explicitly: preserve Unicode and case, exact comparisons, no filesystem
case folding. Safe defaults for new paths must not reject legacy uploads with unusual display names.

### Compatibility-sensitive decisions before production edits

Batch 0 must record approval or a concrete alternative for S5's token syntax/escaping, S6's strict
opt-in seed resolution, S7's shared ownership policy and S10's handler transactions. The required
atomicity cannot be called satisfied while immediate handler writes remain an undocumented exception.
If compatibility prevents transactional legacy callbacks, record the explicit boundary and obtain
approval of that contract adjustment; do not silently waive it. Existing external side effects are
always outside rollback. No approval of reference-format changes is assumed.

Also lock reset visibility: immediately after reset, transient entries disappear; fixtures may be
absent until the next awaited resource operation. Keep direct store reads synchronous. Prove how
resource reset behaves when another resource deliberately reuses one of its refs.

## Batch 0 decisions (locked 2026-11-09)

The implementation request authorizes resolving the recommendations without routine approval.
S1–S4 and S7–S12 are adopted with these concrete choices:

- `mockFileFixture(content, { name, type?, lastModified? })` creates an immutable descriptor;
  `mockFixtureRef(key)` creates an explicit tagged object `{ $apixaFixture: key }`. Only this
  object in declared seed file fields is interpreted, never an ordinary string. This replaces
  S5's suggested URI token to avoid string collisions. Fixture references infer as strings on reads.
- S6: a configured `fixtures` registry opts into strict seed resolution; unknown keys, malformed
  descriptors and missing local UUID refs fail initialization atomically. Legacy sources without
  that registry keep arbitrary seed strings unchanged. Factories load only selected fixtures.
- `storage: { disk?, directory?, naming?: "original" | "unique" | callback, generateId? }` is
  resource-local; constructor and put accept the same options. Original names/UUID refs stay default.
- S7: ownership is tracked per resource as a set of refs computed from committed record fields,
  with separate fixture pins. Last-owner removal releases managed bytes; manual puts remain manually
  owned. Explicit delete/clear is destructive and can leave stale refs, exactly as before.
- S9/S10: a resource serializes managed work; draft record state and staged file bytes commit only
  after configured mock response checks. Handlers read their draft writes. Throw, abort, timeout or
  reset discards/revokes the draft. Arbitrary external side effects and response middleware after
  commit remain outside rollback. This intentionally strengthens legacy immediate-write semantics.
- S8: reset invalidates generations synchronously; fixture sources rehydrate lazily on the next
  operation. Other resources' refs are protected. Direct file reads remain synchronous.
- Adapter: route `defineMockApi` through existing `defineApi` mocked resources, preserving adapter
  calling conventions/error translation. Mutable `rows()` callbacks operate on transaction-local
  copies, reconciled only on successful completion; no second storage engine or public transaction API.
- Fixture helpers/options belong to existing Core/Mocking subpaths; no root convenience exports,
  drivers or provider interfaces. Internal coordination helpers remain unexported.

Baseline characterization: `tests/core/mock-storage-atomicity.test.ts` initially fails all three
cases on unmodified production code: deleting one shared owner removes bytes, a late bulk insert
failure leaves an earlier row, and reset during an awaited Blob read allows a write to resurrect.
The initial red run is recorded in `/tmp/apixa-v150-batch0.log`; the tests retain the intended guarantees.

## Ordered implementation batches

### 0. Characterize baseline and settle decisions

Read the audit in [context.md](./context.md) and ADR 003/005. Add focused characterization tests for
existing APIs, defaults, unusual names/ref suffixes, direct destructive operations, custom handlers,
`defineMockApi` callbacks, seed loading and reset. Reproduce candidate gaps before changing them:
staged-file visibility, shared-ref deletion, reset during Blob read/provider load, mixed explicit and
generated IDs in createMany, handler throw/abort after a write, and response validation failure after
a successful mock write. Record results and resolve the approval gates above. Complete when each S1–S12
has a final shape and every semantic change has an explicit compatibility note.

### 1. Extend the existing virtual store

Implement normalized disk/path metadata and filters, original/unique/deterministic naming, safe ID
reservation and constructor/put options without changing old signatures. Keep read-copy isolation.
Test collision, malformed paths and absent File in isolation. Complete when default characterization
passes and optional organization works through `mockFiles(api)` and handler reads.

### 2. Coordinate records, files and ownership

Add private staging/commit support to current MockStore and MockFileStorage, then wire existing
builtins and routed `ctx.request()` through it. Validate complete bulk batches before publication,
including generated IDs. Track references without scanning or copying binary content. Handle
replacement, deleteMany and reset generations; roll back naming/byte-read/clone failures and aborts.
Complete when fault-injection and concurrency tests prove no partial records, visible staged files,
leaked bytes, cross-resource deletion or resurrection after reset.

Commit boundary: engine-managed handler/body/result preparation and configured mock response checks
must succeed before commit where feasible. Response middleware remains outside the transaction as
in the existing pipeline: its failure after commit does not mean the operation never happened.
Document this distinction and test it. Transfer completion must not advertise a rolled-back write.
A stream mock remains unsupported; no transaction stays open for a response stream.

### 3. Fixtures and lazy dataset seeding

Add the small descriptor/helper and optional registry on current mock sources; resolve only selected
seed records' declared file fields, preserving scalar/array order and ordinary strings. Consume
factories sequentially, single-flight per resource initialization, cache only that resource's needed
fixtures. Validate descriptor metadata and configured file rules using existing validation helpers
before publishing. Seed failures publish neither records nor files and may be retried. Never mutate
catalog JSON or put bytes in record snapshots. Keep fixture definitions or owned byte baselines only
as needed for reset; clear abandoned caches. Complete when inline/provider/named datasets,
`defineMockApi` and reset round-trip fixtures through existing downloads without network access.

### 4. Managed handlers and integration

Wire `packages/mocking/src/resource.ts` and `mock-api.ts` to the same Core storage/fixture/commit
helpers and client registration used by `mockFiles`/`resetMock`. Today they only reuse the record
store and builtin executor. Extend adapter config/types narrowly, preserving dataset selection,
calling conventions and `MockError` → `MockApiError` translation. No duplicate lifecycle engine or
new mandatory request-pipeline surface is needed for adapter-only calls.

Apply the approved S10 boundary using existing handler/store abstractions; test read-your-writes,
throw, abort, timeout, late continuations and ref cleanup. Characterize legacy callbacks individually.
Keep middleware order, one shared pre-write validator, error classes/codes and transfer semantics.
Direct fixture setup is storage work and emits no transfer events. Complete when the required
atomicity matrix is covered and v1.1.0–v1.4.0 regression suites pass without weakened assertions.

### 5. Types, docs and runtime evidence

Lock consumer-facing types without `any` leakage; add positive and negative type tests and packed
consumer cases. Update architecture/public API only as behavior is implemented, review generated
export snapshots with the prescribed tool, document costs/ownership/missing files/reset and examples.
Use only Next if an example is needed; distinguish ignored local files from delivered source.
Run browser/SSR/Edge checks and final verification below. Complete when all acceptance evidence is
recorded and owner sign-off is obtained; prior milestone gaps remain separately visible.

## Intended file touch list for implementation

| Files                                                                                                                                                                  | Purpose                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/mock/{files,files-exec,store,source,handler,execute,datasets,index}.ts`                                                                             | Existing engine, private staging/ownership, fixture interpretation, handles and exports. Small colocated helpers are allowed. |
| `packages/core/src/api/{client,reset,resource-client,validate}.ts`                                                                                                     | Client store options, source configuration, generation/reset and config checks.                                               |
| `packages/core/src/types/{definition,inference,mock-handler}.ts`, `types/index.ts`, Core index                                                                         | Additive options and inference, existing exported types.                                                                      |
| `packages/core/src/request/pipeline.ts`                                                                                                                                | Existing mock dispatch and commit/result/validation/event boundary only.                                                      |
| `packages/mocking/src/{index,loader,types}.ts`, `mock-api.ts`, `resource.ts`, `mock-types.ts`                                                                          | Convenience exports and dataset/adapter parity, no Core reverse dependency.                                                   |
| `src/core/index.ts`, `src/mocking/index.ts`                                                                                                                            | Specialized facade re-exports if needed; curated root unchanged by default.                                                   |
| `tests/core/mock-files.test.ts`, `mock-downloads.test.ts`, `mock-handlers.test.ts`, `file-validation-mock.test.ts`, `transfer-mock.test.ts`; new focused storage tests | Default and new behavior, concurrency and injected failure matrix.                                                            |
| `tests/mocking/**`, `tests/facade/**`, `scripts/lib/type-consumer-fixtures.mjs`, relevant `scripts/verify-*.mjs`                                                       | Dataset/adapter, declarations, packed package and runtime evidence.                                                           |
| READMEs, `docs/architecture.md`, `docs/public-api.md`, `docs/story.md`, `versions/v1.5.0/*`; optionally `examples/next/**`                                             | Honest usage, compatibility notes and recorded evidence.                                                                      |

## Testing strategy and completion gate

Use fake/throwing transports to prove zero network, controlled Blob readers/provider barriers for
race tests and injected deterministic UUID/name/time inputs. Avoid elapsed-time assertions. Compare
before/after records, file IDs/metadata/bytes, pins and visibility on every failure. Test concurrent
writes to the same and different resources, reset during each awaited stage, stale callbacks and
same disk/path collisions. Repeated cycles must return live counts/retained byte totals to baseline;
listing must not read Blob bytes. Keep fixtures small; large-file load testing is deferred.

Final implementation gate: `pnpm verify` (build, architecture/API checks, typecheck, tests, packed
consumers, Chromium/Next SSR, Vercel Edge and workerd). Run `graphify update .` after code changes.
When public exports change, run `node scripts/verify-public-api.mjs --update` and review the generated
snapshot. A passing Stage 1 baseline does not prove the planned v1.5.0 behaviors; rerun these gates after implementation.

## Explicit non-steps

No production code in Stage 1; no new engine/package, driver interface, external storage dependencies,
future version folders, version bumps, `/plan-change`, commit, push, merge or publication. Preserve
unrelated `.claude/settings.json` and `.codex/`. Shipped milestone folders remain untouched.

## Implementation record

- Batches 0–4 implemented. Batch 5 documentation, type/consumer and runtime coverage is complete;
  `pnpm verify` passes (117 files / 1,279 tests, 62/62 type consumers, Chromium/Next SSR and both Edge engines). Owner review completed with explicit approval on 2026-11-09.
- Fixture markers use explicit tagged objects rather than suggested URI strings. Legacy strings
  are untouched; a supplied registry opts into strict existing-ref checks. Markers always require
  a resolvable registry key. Read inference resolves markers to ordinary string/string-array fields.
- Both adapter forms use the existing Core client/pipeline. Resource wrappers retain calling
  conventions, list query forwarding and MockApiError translation. Read-only files are available
  in custom callbacks; new disk/fixture config is opt-in. Synchronous Core builtin File/Blob input
  signatures stay exact; reference reuse remains available through existing string-valued handler
  writes and the adapter's backwards-compatible string inputs.
- Managed handlers' synchronous store methods keep draft values during execution; binary values
  become refs at successful operation settlement. External effects and response middleware after
  commit are not rolled back. `defineMockApi` mutable rows are copied/reconciled at settlement.
- Fixtures are pinned until reset. Reset invalidates generations synchronously and restores files
  lazily; an existing ref retained by another resource can be reused during rehydration. Generator
  callbacks remain caller-owned and are not reset or rewound.
- Existing source-architecture assertions in `tests/mocking/mock-api-data.test.ts` and
  `getall-parity.test.ts` now require Core pipeline reuse instead of direct MockStore construction.
  Runtime regression assertions are retained; this is an intentional architecture expectation update.
- Next usage is exercised through the tracked shared storage scenario and generated SSR consumer
  source in `scripts/verify-unified-consumer.mjs`, in dev and production. No ignored local example
  file is counted as delivered evidence, and no other example app is edited.
- Internal transactions/ownership/path helpers have no public exports. Existing MockStore engine
  coordination members are marked @internal; no public transaction client or storage-driver API.

Final test-harness corrections: Chromium uses the packed `core.js` entry; the existing React
validation type-only render uses `query: { enabled: false }` and explicit cleanup, eliminating an
unhandled scheduler task after jsdom teardown. These changes preserve runtime validation assertions.
No safety requirement was waived. All v1.5.0 acceptance criteria, including owner sign-off on 2026-11-09, are complete.
