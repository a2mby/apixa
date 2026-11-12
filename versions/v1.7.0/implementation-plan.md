# v1.7.0 — Implementation plan

Baseline audit and implementation contract, now owner-approved and implemented under issue #103.
Follow [scope.md](./scope.md); acceptance records actual evidence and remaining delivery gates.
Architecture/public API sources of truth remain `docs/architecture.md`, `docs/public-api.md` and ADRs.

## Baseline audit (2026-11-10)

Audited `main` at `2cdf2e2`, version scopes/acceptance evidence v1.1.0–v1.6.0, canonical sources
below, relevant test cases and verification scripts. Graphify supplied navigation; direct source
reads confirmed behavior. Source searches found no advanced session, checkpoint, presigned or
range-download implementation. Existing occurrences of “chunk” describe stream buffers, not an
upload-part protocol. This is a static audit with historical test evidence, not a fresh runtime gate.

| Milestone / seam                 | Existing behavior and source                                                                                                                                                                                                                                                         | Evidence / consequence for v1.7.0                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.1.0 file fields/serialization | `types/definition.ts`, `api/resource-client.ts` (`prepareFiles`), `http/multipart.ts`: typed field configuration, aliases, arrays/nested objects, binary-preserving bodies. Multipart is chosen on binary presence.                                                                  | `tests/core/file-requests.test.ts`, `file-fields-types.test.ts`: CRUD, `createMany`, custom and `ctx.request`, explicit JSON rejection, equivalent multipart retries, no retry for stream bodies. Keep all defaults. Advanced strategies must select a source explicitly rather than reinterpret every file field.                                                                             |
| v1.2.0 downloads                 | `transport/fetch.ts`, `transport/read-body.ts`, `request/pipeline.ts`: binary mode, full metadata, content-aware errors, no binary key transforms/shaping.                                                                                                                           | Existing download/mock suites and v1.2.0 evidence. Streaming already avoids full buffering; blob/arrayBuffer deliberately buffer the requested result. No new download stack needed.                                                                                                                                                                                                           |
| v1.3.0 transfer observation      | `types/transport.ts`, `transfer/channel.ts`, `counting.ts`, `stream.ts`, `support.ts`: request-direction/attempt lifecycles, observed bytes (not acknowledgments), unknown totals, unsupported uploads where required, pull-based counting and stream-owned cleanup.                 | `upload-progress.test.ts` includes loopback bytes/backpressure; `download-progress.test.ts` covers unknown totals and consumption. Aggregate session state does not fit `TransferEvent` without an additive decision.                                                                                                                                                                          |
| v1.4.0 safety                    | `request/pipeline.ts`, `validation/check.ts`: rules after middleware/key transforms, before serialization/transport/mock writes; raw streams counted, binary responses limited.                                                                                                      | `file-validation-pipeline.test.ts`: rejection produces no transport/event/retry; middleware-added files are checked. Validate original selected source before session creation; part-only checks cannot enforce whole-file rules.                                                                                                                                                              |
| v1.5.0 mock storage              | `mock/files.ts`, pipeline's `runManagedMock`, transaction integration: per-client bytes, disks/paths, lazy fixtures, managed atomic commits and shared refs. `packages/mocking/src/mock-types.ts` supplies dataset-facing types.                                                     | v1.5.0 acceptance/evidence and `scripts/lib/mock-storage-scenario.mjs`. This is not a resumable upload server. Protocol simulation belongs in fake transports; mocks must never fall through to storage/network.                                                                                                                                                                               |
| v1.6.0 framework integration     | `packages/react/src/hydration.ts`, query-options/controller behavior: omit binary hydration, reject binary generated identities, combine query and caller signals; operations remain ordinary promises.                                                                              | `tests/react/framework-files-*.test.tsx`, `query-identity-binary.test.tsx`, `ssr-binary-dehydrate.test.ts`; `scripts/file-consumer-runtime.mjs`, `verify-react-consumers.mjs`, tracked Next `/files`. Cached streams are consumer-owned; no session state in query keys/cache/dehydration.                                                                                                     |
| Request/retry lifecycle          | `request/pipeline.ts`: `runOperation` owns one timeout/signal and middleware execution per logical request; `sendWithRetry` reuses headers/body and keys, refuses non-replayable streams. `request/retry.ts`: retries opt-in, default methods GET/HEAD/OPTIONS, Retry-After/backoff. | `idempotency-retries.test.ts`: one key per logical call, retry/replay reuse; function operations reject declarative idempotency. A transfer spanning requests needs a shared deadline and distinct stable part keys, not a new retry loop or globally enabled PUT retry.                                                                                                                       |
| Function requests                | `api/resource-client.ts:functionOperation`, `types/builtins.ts`: function returns native Promise; `ctx.request` calls the same pipeline and validates method against parent operation kind. Each request has a separate budget.                                                      | A write function cannot silently issue a status GET. Bind protocol steps to existing declared read/write operations or approve a narrow internal executor. Also characterize option forwarding: `maxResponseSize` is declared on `OperationFnRequestInit` but is absent from the current function's options mapping. Any needed fix requires a failing regression, not an unrecorded redesign. |
| Origins and credentials          | `http/url.ts:assertSameOrigin` runs after request middleware; `transport/fetch.ts` calls fetch without an explicit credentials/redirect policy. Request URL and headers can appear in `ApiError.request`.                                                                            | Cross-origin presigned destinations are rejected today. Adding a URL field alone would be unsafe. Need isolated header resolution, explicit credentials/redirect controls, signed-query preservation and safe diagnostics through the existing pipeline.                                                                                                                                       |
| Distribution/runtime gate        | Root `package.json`, ADR 005, `docs/public-api.md`: one `apixa` distribution; private modules; Node >=22, React 18/19 optional peers.                                                                                                                                                | `pnpm verify` builds, checks architecture/API, typechecks, runs tests, packed consumers, Chromium/Next and Vercel Edge/workerd. Root conventions' older Node >=18 text does not override current package/runtime contract. No new runtime/provider support claimed.                                                                                                                            |

### Baseline status and gaps

- v1.6.0 is merged/verified, owner sign-off open. Its acceptance evidence records `pnpm verify`
  exit 0 (125 files / 1336 tests); the final combined CI checkbox is still unchecked. Earlier
  frozen coverage/sign-off checkboxes are preserved; v1.6.0 supplies later coverage evidence.
- v1.5.0 alone has recorded owner approval among these file milestones. No stable-release claim.
- Missing capabilities: session state machine, source/layout identity, lazy scheduler, authoritative
  reconciliation, durable metadata, aggregate acknowledged progress, protocol integrity and safe
  delegated destinations. Existing request infrastructure remains the execution engine.
- Existing streaming is the large-download baseline. Range support remains a question, not a
  prerequisite for uploading large files.

## Architectural decisions — approved in Stage 2A

D1–D18 record the problem, alternatives, recommendation and cost from Stage 1. The owner approved
the precise Stage 2A proposal below on 2026-11-10 before production work. That proposal and the
implementation refinements below are the locked decision record; final supported syntax lives in
the Core README and public API contract.

### D1 — Strategy selection

**Problem:** file size cannot reveal backend capabilities. **Options:** automatic threshold;
transport-wide mode; explicit operation strategy. **Recommendation:** optional operation strategy,
ordinary behavior when absent, with no implicit threshold. An explicitly selected advanced strategy
may handle small files as its protocol specifies. **Trade-offs:** backend configuration is required
for advanced work; normal uploads keep zero configuration and unchanged wire requests.

### D2 — Configuration seam and typed results

**Problem:** resource-wide defaults could alter unrelated writes and custom overrides. **Options:**
root/resource inheritance; operation config; only user-written function operations.
**Recommendation:** optional operation-level config; per-call source/checkpoint/control inputs only
as justified, no root/resource strategy inheritance in this version. Bind source selection to one
File/Blob in the existing body; keep domain response inference and native `Promise<T>`. Custom
functions can compose the same internal orchestration through an approved context seam.
**Trade-offs:** some duplicated configuration across operations; fewer precedence rules. Review
`full: true` as finalization response metadata, never fabricated aggregate HTTP metadata. An
explicit `dataFormat`/strategy conflict fails configuration rather than silently overriding either.

### D3 — Shared chunk/resume orchestration

**Problem:** chunking does not inherently provide resume. **Options:** two engines; compulsory
resume; one scheduler with capability-gated session behavior. **Recommendation:** one internal
orchestrator in existing `transfer/`; optional inspect/reconcile/abort capabilities. Non-resumable
chunk protocols never expose a resumable checkpoint. **Trade-offs:** capability checks add states
but avoid duplicate scheduling and misleading support claims. Non-seekable streams stay outside.

### D4 — Backend protocol differences and request binding

**Problem:** APIs differ in methods, URLs, numbering, request bodies, acknowledgments and assembly.
**Options:** hardcoded routes; arbitrary callbacks allowed to fetch; typed step bindings to Apixa
operations/request descriptors. **Recommendation:** minimal typed initiate/inspect/part/complete/
abort/renew bindings, with step-specific read/write classification and response decoding. Resolve
bindings to the existing pipeline; strategy code never calls fetch/transport directly. Prove two
protocols (offset/range and S3-style part manifest) before exporting a reusable protocol interface.
**Trade-offs:** a small configurable seam is necessary; avoid a plugin registry. Owner must settle
how step-specific read operations work with the current write-function `ctx.request` restriction.

### D5 — Session creation and authoritative completion

**Problem:** final bytes sent do not mean an assembled object exists. **Options:** implicit
completion; a fire-and-forget finalizer; explicit session state machine.
**Recommendation:** create → reconcile when needed → transfer missing parts → finalize → confirmed
complete, with interruption/failure/expired/remote-aborted terminals. Finalize once after all required
acknowledgments/integrity checks. An ambiguous finalize response triggers status reconciliation,
not blind recreation/completion. **Trade-offs:** backends must expose completion/status evidence;
without that, surface an indeterminate failure and preserve safe state, never success.

### D6 — Checkpoint shape, ownership and persistence

**Problem:** restart recovery must be safe without becoming a database product. **Options:**
built-in browser/Node stores; caller-owned opaque JSON; versioned typed metadata plus optional save
callback. **Recommendation:** versioned, validated serializable metadata: protocol ID/version,
resource/operation identity, opaque session ID, source size/type plus optional name/lastModified,
source fingerprint strength, effective part layout, acknowledged part IDs/ranges/ETags/checksums,
verification state. Caller supplies a checkpoint on a later call and reacquires source bytes;
optional awaited save callback serializes snapshots and provides backpressure. No load framework,
automatic storage, binaries, tokens, headers or presigned URLs. Bound part count/metadata and reject
malformed or excessive input. **Trade-offs:** persistence availability/security is caller-owned;
save failure stops scheduling and reports a durability failure rather than pretending it saved.
Session IDs may themselves be sensitive; document access-controlled application storage.

### D7 — Reconciliation and checkpoint compatibility

**Problem:** local state is stale/untrusted and an upload response can be lost after server commit.
**Options:** trust local completed flags; restart always; query authoritative session state.
**Recommendation:** validate protocol/layout/source identity, then inspect server before skipping
parts; server state wins. Recognize server-only confirmed parts, reject conflicts, resend missing
parts only where safe, and reject expired/unknown sessions without silently starting a new upload.
User may explicitly restart. **Trade-offs:** an extra request on resume; no restart resume promise
without authoritative inspect support. Size/name/time alone are weak identity: require a caller or
protocol content identity for strong cross-restart resume, or reject that mode explicitly.

### D8 — Retry, idempotency and deadlines

**Problem:** request retries, middleware replay, URL renewal and hook retries can multiply writes.
**Options:** retry whole transfer; independent scheduler retry engine; existing request retry per
part. **Recommendation:** only the existing retry mechanism, stable session+part/range+source keys
where supported, distinct keys for initiate/finalize, unchanged request defaults and explicit safe
write retry opt-in. Reconcile uncertain outcomes before resending. No nested whole-transfer retries;
document TanStack mutation retry hazards and bind the same session/checkpoint when explicitly used.
One overall transfer deadline covers hashing, protocol steps, backoff, reconciliation and saves;
step budgets may shorten it. **Trade-offs:** safe replay needs backend idempotency; otherwise fail
without blind resend. Async user callbacks must honor signal; late results cannot mutate settled state.

### D9 — Chunk size, concurrency and resource bounds

**Problem:** no size/concurrency works for every backend/runtime. **Options:** auto-tune; fixed
parallel default; conservative configurable defaults. **Recommendation:** propose 8 MiB slices and
concurrency 1 for explicitly enabled advanced transfers; parallelism requires declared independent
parts and an explicit finite positive integer. Validate protocol min/max size/count and safe-integer
offsets before initiate. Protocol constraints may choose a larger part size before session creation,
recorded in checkpoint; no silent mid-session layout changes. **Trade-offs:** conservative throughput;
no promise of universal provider limits. At most C active part bodies plus one hashing buffer, lazy
slicing/no full-file read or unbounded task creation; acknowledged metadata is O(N) under a validated
maxParts cap (proposed generic cap 10,000, protocol may lower it). Different caps require review.

### D10 — Progress semantics

**Problem:** existing `TransferEvent.loaded` is observed bytes per request attempt, not server state;
parallel retries reset individual observations. **Options:** reinterpret `onTransfer`; add fields to
its union; separate opt-in typed session observation. **Recommendation:** preserve `onTransfer`
unchanged on each bound request; expose a separately approved session snapshot/observer carrying
part identity+attempt, unique confirmedBytes, source total, optional current observed bytes and
session phase. confirmedBytes = sum of disjoint server-confirmed ranges, never retransmitted bytes;
reconciliation can correct stale prior state and must identify that phase. Wire bytes include retries
and multipart overhead and must not masquerade as logical file completion. **Trade-offs:** one
small additional observation seam; unknown/unsupported in-flight counts stay absent. Observer
exceptions remain nonfatal; durable save callbacks have the separate D6 failure contract.

### D11 — Integrity and source changes

**Problem:** an ETag/local digest alone does not prove server-verified whole-file integrity.
**Options:** hash full ArrayBuffer; dependency/incremental algorithm; bounded chunk digests and
protocol/server verification. **Recommendation:** optional SHA-256 per bounded chunk using
`crypto.subtle` where available, protocol-specific checksum encoding/headers and explicit server
verification evidence. Hash the exact bytes sent. Metadata-only source matching is weak; strong
resume requires a stable content identity/verified chunk manifest, checking reused source ranges
with bounded reads where necessary. Web Crypto digest is not incremental: defer mandatory local
whole-file digest if it needs a new dependency or full buffering. **Trade-offs:** hashing costs
CPU/read time; server whole-object verification may be required. Never label a hash-of-chunk-hashes
as the whole-file SHA-256 or S3 multipart ETag as MD5. Required unavailable integrity fails before
sending; optional unavailable verification is reported truthfully, not downgraded silently.

### D12 — Pause, cancellation, server abort and resume

**Problem:** a native Promise has no pause method and `AbortSignal` is one-shot. **Options:** custom
Promise/handle; signal only; optional caller-owned controller input with separate controls.
**Recommendation:** keep `Promise<T>`; review a minimal control input. Pause stops new scheduling,
lets active parts settle safely and saves a quiescent checkpoint while the Promise remains pending;
the overall deadline continues. Caller cancel rejects `AbortError`, stops/drains active work and
preserves acknowledged resumable state; it does not implicitly destroy the remote session.
Explicit server abort is a configured operation, reports confirmed remote deletion separately and
invalidates state only on acknowledgment. Network interruption rejects with recoverable metadata;
resume is a new call with a new signal and reconciled checkpoint. **Trade-offs:** explicit controls
add surface; no detached background work. Race tests must define pause versus completion/abort.

### D13 — Presigned security and origin policy

**Problem:** existing same-origin guard deliberately prevents inherited credentials escaping.
**Options:** separate storage client; blanket allow-cross-origin; narrowly scoped delegated
request policy through existing pipeline. **Recommendation:** owner-approved explicit per-strategy
trusted HTTPS origins (loopback HTTP only in tests), validated after middleware for every part and
renewal. Keep ordinary origin checks unchanged. Resolve delegated requests from an isolated empty
header/credential baseline, allow only explicitly supplied signed headers, never call inherited
auth providers, use credentials omit and reject redirects (including same-origin redirects).
Preserve signed URL query/order/encoding exactly; no base-path join, query serializer or key transform
on the signed destination. Renewal comes only from configured trusted backend operations and is
bounded; reconcile uncertain writes first. **Trade-offs:** additive `TransportRequest` security
capabilities may be needed; custom transports must explicitly support them or reject delegated
mode, never silently ignore. Scope trusted middleware and re-check added headers/destination after
it runs. Sanitize signed query strings/auth from errors, replay metadata, observers and checkpoints;
caller-provided middleware intentionally seeing a signed URL is a documented trust boundary.

### D14 — S3-compatible integration

**Problem:** S3 multipart sessions differ from HTTP multipart forms and from each other in limits,
checksum support and exposed headers. **Options:** AWS SDK dependency; public provider adapter;
backend-mediated recipe. **Recommendation:** include a tested SDK-free recipe using D4 bindings:
server initiates/signs, parts use temporary URLs, opaque ETags/checksums captured, server lists parts,
completes with ordered part manifest or aborts. No client signing credentials. Validate limits and
CORS/exposed ETag requirements from the chosen provider's primary documentation in Batch 0.
**Trade-offs:** backend endpoints remain application work; no universal S3 compatibility claim.
A public adapter ships only if the two concrete protocols prove a gap and owner approves its scope.

### D15 — Mock behavior

**Problem:** the existing mock store is not a remote multipart server. **Options:** build a second
session storage engine; fake success; protocol fixtures/fake transports.
**Recommendation:** deterministic in-test session server over injected Transport, fault injection,
ack/manifest inspection; production mock resources require explicit configured protocol handlers or
return `MOCK_UNSUPPORTED`, with no network fallback. Store only final small artifacts in the
existing store when needed. **Trade-offs:** advanced mock recipes are explicit; no fabricated
network progress or production provider emulation. Keep mock streaming unsupported as today.

### D16 — React compatibility

**Problem:** hook/cache lifecycle can restart writes or serialize nonserializable state.
**Options:** new transfer hooks; TanStack-owned session engine; existing mutations/queries.
**Recommendation:** existing hooks call Core Promise operations and pass controls/callbacks through
approved options; transfer UI state belongs to the app. Keep keys/invalidation unchanged, binary
identity guard/dehydrate exclusions intact, cancellation composed and source/checkpoints out of
query identity/SSR payload by default. **Trade-offs:** callers manage controls and persistence;
no global progress hook, resumable cache or automatic mutation replay. Verify React 18 and 19.

### D17 — Public exports and errors

**Problem:** implementation needs typed sessions/checkpoints/control without bloating curated root.
**Options:** no additions; broad transfer namespace/client; minimal types/config plus justified
helper. **Recommendation:** inventory exact additions after type spikes: likely checkpoint,
protocol/config, session snapshot and control types in `apixa/core`, with existing definition types
referencing them; a controller factory only if required by D12. Reuse existing ApiError subclasses
and add structured advanced failure metadata only if narrowing cannot otherwise be expressed.
**Trade-offs:** review source/declaration compatibility for every addition; no new error class or
root value by default. Record approved changes in public-api/story and regenerate/review the
snapshot only when implementation changes exports. No snapshot update in Stage 1.

### D18 — Deferrals and large downloads

**Problem:** phase 8 could turn into a storage platform or rewrite working downloads.
**Options:** implement every provider/range/persistence feature; upload-only; bounded upload core
plus existing download audit and presigned download security.
**Recommendation:** the latter. Defer range-based download orchestration unless a real server
scenario proves a gap and owner explicitly approves an addendum here (206/Content-Range, strong
validator/If-Range, 200 fallback, 416, encoding, sink offsets and durable sink ownership). Existing
stream mode plus caller-owned sink already meets bounded-memory download requirements.
**Trade-offs:** restartable downloads are not promised. Defer auto-tuning, background transfers,
mandatory incremental hash dependency, generic provider registry and automatic multi-file scheduler;
RHF/Zod remain separate, v1.8.0 owns broader cleanup/performance/hardening.

## Batch 0 decision gate

The gate below was satisfied by the explicit owner approval recorded in Stage 2A. Before production edits, record owner dispositions for D1–D18 in this file with final names,
precedence, state transitions, failure codes/metadata, examples and rejected alternatives. Especially
block on operation/context binding and mixed read/write steps (D2/D4), progress (D10), controls and
Promise behavior (D12), destination/transport credential+redirect guarantees (D13), and exports
(D17). No owner response is implied by starting the milestone. Any scope deferral must be explicit;
update acceptance consistently rather than silently waive an in-scope capability.

## Stage 2A precise API proposal — owner-approved 2026-11-10

Prepared for `/plan-change` and approved as written by the owner on 2026-11-10. The proposal below
is retained as the decision record; final behavior and refinements are documented in the Core README
and evidence below. The Stage 1 non-steps below describe initialization;
they do not override this later request. `/implement-version` was invoked exactly once on 2026-11-10, beginning Batch 0.

### Configuration, binding and result (D1–D5, D17)

Recommend `OperationDefinition.transfer?: AdvancedTransferConfig` for explicit chunked uploads.
Only operation-level selection; no root/resource/per-call strategy override. `source` names one
top-level declared file field or selects a raw Blob body; selectors return Blob and are checked
against the inferred body where metadata exists. Source selection happens after outer request
middleware and validation. Existing body fields/params/query remain available to step callbacks.
A strategy combined with explicit outer `dataFormat` is a ConfigError; step requests choose their
own encoding. Existing operation `response` metadata/domain result inference still wins.

Proposed authoring shape (names and observable behavior for review):

```ts
operations: {
  create: {
    transfer: {
      strategy: "chunked",
      source: "document",
      chunkSize: 8 * 1024 * 1024,
      concurrency: 1,
      maxParts: 10_000,
      protocol: {
        id: "example-part-upload",
        version: 1,
        independentParts: true,
        replaySafeParts: true,
        emptyFile: "complete",
        initiate: async (ctx, input) => {
          const session = await ctx.request<{ id: string }>({
            kind: "write", method: "POST", path: "/sessions",
            body: { size: input.source.size },
          });
          return { id: session.id };
        },
        inspect: async (ctx, input) => ctx.request({
          kind: "read", method: "GET", path: "/sessions/:id",
          params: { id: input.session.id },
        }),
        uploadPart: async (ctx, input) => ctx.request({
          kind: "write", method: "PUT", path: "/sessions/:id/parts/:part",
          params: { id: input.session.id, part: input.part.index + 1 },
          body: input.part.blob,
        }),
        complete: async (ctx, input) => ctx.request({
          kind: "write", method: "POST", path: "/sessions/:id/complete",
          params: { id: input.session.id }, body: { parts: input.parts }, full: true,
        }),
        // Optional abort and renew bindings use the same context.
      },
    },
  },
}
```

The example omits backend-specific response decoding: `inspect` must decode to a discriminated
`{ state: "active", parts } | { state: "completed", result: ApiResponse<T> } |
{ state: "expired" | "aborted" }`; each confirmed part supplies `{ index, offset, size, etag?,
checksum?, verification }`. `uploadPart` must explicitly return that acknowledgment after decoding
server evidence; no callback returning void counts as an acknowledgment. Completion returns an
actual `ApiResponse<T>` and protocol decoding must reject error payloads even under HTTP 200.
`initiate` returns only `{ id, expiresAt? }`, never arbitrary persisted provider data.

**Mixed kinds:** only the protocol-bound `TransferStepContext.request` accepts explicit `kind`
and validates it against its method; outer operation remains `write` for hooks. Ordinary
`OperationFnContext.request` retains its existing parent-kind restriction. Add
`OperationFnContext.transfer(config, body, options?): Promise<T>` for function composition; it
calls the same internal orchestrator, not another client or transport. Read functions cannot start
upload orchestration. Each step request uses runOperation/sendWithRetry; nested requests never
recursively select the outer transfer strategy. Outer middleware validates the logical body once;
step middleware runs once per logical request, existing retry behavior unchanged. Outer response
middleware sees only the final domain result/envelope, not every control response.

**Alternatives:** bind every step to an existing named resource operation (less public context but
more configuration/operation registration), or permit mixed methods on all function requests
(smaller implementation but changes the existing classification contract). Recommend the narrow
protocol context above. `full: true` returns finalization's real envelope; unwrapped calls return T.

### Checkpoints, recovery and integrity (D6–D9, D11)

Add `RequestOptions.transfer?: AdvancedTransferOptions` (rejected on operations without a strategy):

```ts
interface AdvancedTransferOptions {
  checkpoint?: TransferCheckpoint;
  control?: TransferControl;
  onSession?: (snapshot: TransferSnapshot) => void | Promise<void>;
  saveCheckpoint?: (checkpoint: TransferCheckpoint) => void | Promise<void>;
}
```

`TransferCheckpoint` schema version 1 contains protocol id/version, resource/operation, session id
and expiry, source size/type/name/lastModified when available, effective chunk size/count, a
SHA-256 chunk-manifest source identity, monotonically ordered revision and acknowledged parts.
There is no arbitrary metadata bag, binary, authorization or URL field. Serialization rejects
unknown/excess fields, invalid numbers/ranges and over-limit metadata. Snapshots are deeply
immutable; saves are serialized and awaited, failure stops work with durability metadata.

For strong restart identity, compute a bounded chunk-digest manifest (one hash buffer, no whole-file
ArrayBuffer); on restart compare all selected source chunk digests before network resume. It is
labeled a manifest identity, never a whole-file SHA-256. Non-resumable mode may omit it. If required
crypto is unavailable, reject before initiating. Resume always inspects authoritative server state;
expired/conflicting sessions reject, with no automatic fresh session. Confirmed parts are accepted
only with matching identity/ranges/protocol evidence. No inspect capability means no durable resume.

Optional `integrity: "sha256" | "none"` selects chunk checksums; resume requires the source manifest
regardless of optional wire checksum choice. Protocol response verification is independently tagged
`"unverified" | "local" | "server"`, with algorithm/digest where applicable. A backend checksum only
counts as server verification if its protocol decoder asserts actual verification evidence.
ETags remain opaque. Whole-file server verification can be supplied by finalization; no mandatory
incremental hashing dependency. Defaults: 8 MiB, concurrency 1, at most 10,000 parts; provider bounds
may lower caps or select a larger fixed layout before initiate. Explicit unsupported parallelism
falls back to 1. Empty file uses protocol `emptyFile: "complete" | "single-part" | "reject"`.

**Alternatives:** caller-provided content identity (faster but weaker enforcement), or built-in
persistence/hash dependencies (larger API/runtime cost). Recommend the manifest and caller-owned
save callback; application handles secure durable storage and source reacquisition.

### Progress and controls (D10, D12, D16)

Preserve existing `onTransfer` events on each HTTP request, including attempt resets and unsupported
observation. `onSession` receives immutable `{ phase, total, confirmedBytes, parts, checkpoint? }`;
parts carry index, request attempt and optional observed bytes/total. Session phases are
`"starting" | "reconciling" | "uploading" | "pausing" | "paused" | "completing" | "complete" |
"interrupted" | "cancelled" | "aborted" | "error"`. Confirmed bytes sum unique acknowledged ranges;
retry traffic never increases them. Unsupported observation stays absent. Callback errors are
ignored; save callback failures are not.

Export only from `apixa/core` a `createTransferControl()` helper returning `TransferControl` with
`pause(): Promise<void>`, `resume(): void`, `cancel(reason?): void`, `abort(): Promise<void>`.
One control binds to one active invocation; reuse while bound rejects. Pause waits for active parts
and persistence, keeps the operation Promise pending and keeps deadline running. Cancel aborts local
work, rejects AbortError, preserves resumable state and never deletes server storage. Abort stops
part work, calls the configured remote abort request with its own remaining deadline budget and
resolves the control Promise only after backend acknowledgment; missing abort capability rejects
ConfigError without pretending deletion. The operation rejects AbortError after confirmed remote
abort. Abort failure preserves recoverable state and rejects with the backend error. Restart resume
uses a new operation invocation/checkpoint/control/signal. Terminal controls are inert or return the
recorded terminal outcome consistently; no late work can revive the session.

**Alternatives:** signal-only controls (cannot support pause), or return a handle/custom Promise
(changes operation return contract). Recommend the input helper with native operation promises.
No new hook, global registry, automatic persistence or cache ownership.

### Presigned security and exports (D13–D18)

Use an explicitly configured operation-level `presigned` policy for advanced upload steps and
standalone presigned download operations. Policy: `{ origins: readonly string[], headers?: readonly
string[] }`; trusted HTTPS origins only, exact origin matching, no wildcard, no URL userinfo or
fragment. Signed requests select `ctx.request({ kind, method, presigned: { url, headers }, ... })`
in protocol context (also an additive `presigned` field for ordinary `ctx.request` on an operation
with the policy). No global origin bypass and no additional client. Signed query is byte-for-byte
preserved; incompatible params/query/path-transform options reject.

A delegated step begins with empty headers and credentials, never evaluates inherited header/auth
providers, and uses only policy-allowed explicit signed headers. Inherited ordinary request
middleware is skipped for delegated requests to prevent automatic auth injection; policy may declare
explicit trusted `requestMiddleware` for this path. Final checks enforce exact destination/method,
allowlisted headers and unchanged body identity. Existing response/error middleware gets sanitized
request context; retries use the same private signed descriptor. Response auth-refresh replay cannot
silently switch to ordinary credential resolution. Explicit renewal goes through trusted backend
steps with a maximum one renewal per failed part invocation, shared remaining deadline and
reconciliation of ambiguous writes. Signed query/auth data is stripped from library diagnostics,
response/error request metadata and nested causes. User-defined trusted middleware is documented
as able to see the signed URL, and must not log it.

Proposed transport additions: `Transport.capabilities?.presigned: true` and
`TransportRequest.security?: { credentials: "omit"; redirect: "error" }`. Fetch transport advertises
and enforces them. A custom transport without explicit capability fails before delegated send;
existing normal custom transports remain unchanged. `ApiRequest` gains optional delegated marker
for middleware discrimination. Returned raw Response/full metadata must also avoid signed URL
exposure; document sanitization limits and test engine behavior before claiming redaction.

**Alternative:** run inherited auth middleware then strip sensitive headers (retains side effects and
cannot enumerate every secret); recommend isolation and explicit opt-in middleware instead.

Proposed `apixa/core`-only exports: `createTransferControl` plus `AdvancedTransferConfig`,
`AdvancedTransferOptions`, `TransferProtocol`, `TransferStepContext`, `TransferCheckpoint`,
`TransferPart`, `TransferPartAck`, `TransferSnapshot`, `TransferControl`, `TransferSessionState`,
`PresignedPolicy`, `PresignedRequest` and `AdvancedTransferFailure` types. No new curated-root values
or subpaths; existing public option types reference these canonical types. Add optional
`ApiError.advancedTransfer?: AdvancedTransferFailure` with reason
`"checkpoint" | "durability" | "session-expired" | "integrity" | "protocol" | "interrupted"`,
safe checkpoint when available and phase; existing error classes/codes stay primary, with validation
failures represented by ValidationError. No new transfer error class.

Deliver a tested backend-mediated S3 multipart recipe, not a public S3 adapter/registry. The recipe
uses the same bindings, server initiation/signing/list/completion/abort, exposed opaque ETags and
provider-specific limits/checksums. Preserve existing mock engine and explicit unsupported paths;
no new mock session engine. Range-download orchestration, mandatory local whole-file digest,
auto-tuning/background persistence/provider abstractions remain deferred per D18. Presigned GET
and existing streamed-download regression coverage are included.

### Approval status

**Owner approved the precise proposal as written on 2026-11-10**, explicitly replacing the earlier
request for changes: “Approve the proposal as written and implement it.” D1–D18 are locked to
these recommended behaviors and precise additions. One `/implement-version` invocation is already
in progress; it is not invoked again after approval. Ordinary private factoring/test details do not
need approval. Range orchestration and a public provider framework remain deferred.

Batch 0 evidence: six characterization tests run; the maxResponseSize forwarding regression failed
first under `it.fails`, then passed as an ordinary test after the option was forwarded. No existing
test was weakened. Ordinary write functions still reject GET; only protocol context permits mixed
classified steps. New deterministic server ledger supplies explicit acks and state independent of
caller checkpoints. Subsequent batch evidence is recorded in acceptance criteria as verified.

## Implementation evidence and documented refinements

- D1–D18 owner approval is recorded above; production work follows that package. No new public
  root value, package, provider abstraction or ranged downloader is introduced.
- Baseline maxResponseSize defect was reproduced before the forwarding fix. React identity tests
  then reproduced transfer controls/signed URLs in generated query keys before fixing them;
  presigned queries now require explicit safe keyParts rather than caching temporary credentials.
- `transferLayers` preserves operation retry/header policy for steps while running only root/resource
  middleware on steps; operation middleware runs once on the outer logical call. Presigned steps
  retain their isolated middleware/credential policy. Control writes do not inherit unsafe retries.
- Private implementation files are `transfer/advanced.ts`, `checkpoint.ts`, `control.ts`,
  `integrity.ts`, and `types/advanced-transfer.ts`; no separate scheduler module was needed.
- Added source-field compile/runtime checks. String selectors name declared file fields; dynamic
  selector functions return a Blob. Checkpoints and byte buffers are independently bounded.
- The shared packed runtime scenario extends `scripts/lib/mock-storage-scenario.mjs` to include
  `advanced-transfer-scenario.mjs`, so existing Node/Chromium/Next SSR/Edge/workerd verification
  callers run real checkpoint/reconciliation assertions. React consumers invoke it through actual
  mutation hooks. `scripts/lib/type-consumer-fixtures.mjs` extends the existing declaration matrix.
- The tracked example adds `lib/advanced-transfer.ts`, `lib/s3-transfer.ts`, a client section and
  `app/api/transfers/[...path]/route.ts`. Local tsconfig public-import aliases point at existing
  workspace package directories; packed consumers have no such packages and resolve the tarball.
- Additional touches: `packages/core/src/types/inference.ts`, `packages/react/src/query-options.ts`,
  `examples/frontends/query-ssr-next/tsconfig.json`, its README, the two existing script fixture modules above.
  These narrow additions follow test-proven typing/identity and consumer needs, not broad redesign.

- Additional regressions reproduce and fix signed tokens in already-materialized error stacks,
  failed HTTP envelopes masquerading as completed sessions, stalled outer middleware escaping the
  deadline, and raw chunk-body replacement after hashing. No existing test was weakened.
- Finalization honors existing buffered responseType overrides; the protocol inspector must supply
  the same representation for an already-completed session or it rejects safely. Advanced upload
  completion must settle its body: live-stream completion is explicitly unsupported; existing
  streamed download operations remain unchanged. This prevents an upload control lifetime from
  silently aborting a returned download stream. Function ctx.transfer preserves full:true inference.
- The Chromium security test uses two real HTTPS origins, a positive cookie-sending control,
  credential-omitting native Fetch, CORS-exposed ETags and redirect rejection. Test certificates are
  generated in the temporary consumer with system OpenSSL; no signing credential is checked in.

- Explicit protocol idempotency headers retain normal header precedence; generated part keys are
  stable and distinct without creating duplicate differently-cased headers. Capability flags are
  validated as booleans for untyped callers.
- Middleware replay is constrained by protocol safety. Unsafe binary writes/control writes without
  explicit idempotency cannot replay. Recoverable outer replay requires a safe checkpoint and
  authoritative reconciliation, uses the original deadline signal and never creates a new session.
  Both regressions failed before these guards. Upload observation excludes response/control bytes.

- Final call-option regressions verify backend header/metadata forwarding, caller `retry: false`,
  response limits and operation-scoped idempotency keys across initiation/parts/completion. Signed
  steps remain isolated. Control responses default to a 4 MiB cap using `maxResponseSize`.

Primary specifications inspected 2026-11-10:

- [Fetch Standard](https://fetch.spec.whatwg.org/): credentials omit and redirect error are enforced
  by Fetch; injected custom transports must opt in to enforcing the same policy.
- [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html): part
  numbers 1–10,000; 5 MiB–5 GiB part size with no minimum on the last part; ListParts pagination
  returns at most 1,000 parts per request. The backend recipe must paginate and normalize state.
- [CompleteMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html):
  ordered parts/ETags and possible embedded error under HTTP 200; backend parses provider response,
  recipe rejects a normalized Error payload rather than declaring status-only success.

## Ordered implementation batches

### Batch 0 — Characterize, prove seams and lock decisions

- Add passing baseline characterizations and failing reproductions for proven gaps, including
  `ctx.request` option forwarding and method-kind constraints. Preserve old suites.
- Build a deterministic offset protocol and S3-style protocol simulator with a durable server
  ledger independent from caller checkpoints; define authoritative completion and recovery.
- Type-spike operation override, custom function binding, `full`, controls, checkpoint/result
  inference and React mutation consumption. Prove no separate networking loop is required.
- Audit standard Fetch redirect/credentials/CORS behavior and primary S3-compatible provider
  protocol documentation; record provider/version limits and integrity capabilities with URLs.
- Record memory model and strategy caps, optional range decision and all owner approvals above.

### Batch 1 — Optional configuration and sequential transfer

- Resolve/validate approved operation config once; absent config uses the exact old path.
- Validate original source and entity body after relevant middleware, before initiating a session;
  document outer/step middleware ordering without running an outer HTTP request twice.
- Bind protocol steps to the existing pipeline with shared signal/deadline, preserving kind,
  dynamic headers, serialization, response limits and final result/full-envelope inference.
- Implement lazy offsets/slicing and sequential session state machine, part acknowledgments and
  exactly-once logical finalization. No resume/parallel shortcuts before sequential invariants pass.

### Batch 2 — Checkpoints, reconciliation and interruption controls

- Validate version/layout/source/protocol/session metadata; persist ordered immutable snapshots
  through approved awaited callback, test save failure and corrupt/oversized data.
- Resume only after server reconciliation and source checks. Cover lost acknowledgments, expired
  sessions, mismatched parts and completion-response loss; do not silently create a new session.
- Implement approved pause/cancel/remote-abort transitions and late-result guards, clean listeners/
  timers, stop queued work and retain safe state after partial failure. Restart tests reconstruct
  the client/orchestrator from JSON and reacquired source with the same simulated server ledger.

### Batch 3 — Parallel scheduling, retry and aggregate progress

- Add finite worker scheduling only for independent parts, sequential fallback when unsupported,
  bounded source reads/hash buffers and no unbounded Promise fan-out.
- Reuse per-request retry/backoff/idempotency, stable part keys and shared remaining deadline;
  no whole-transfer retry loop. Reconcile ambiguous writes and test replay/renew interactions.
- Emit approved per-part/session observations, disjoint confirmed-byte accounting, honest
  unsupported observation and terminal/finalization race handling. Retain old `onTransfer` tests.

### Batch 4 — Integrity and delegated destinations

- Implement bounded chunk digests/protocol checksums, changed-source checks, explicit local vs
  server verification evidence and unavailable-feature behavior without mandatory dependencies.
- Implement only the approved D13 security seam in the existing pipeline/transport; test inherited
  auth exclusion, credential omission, after-middleware destination/header checks, redirects,
  signed-query preservation, URL expiry/renewal budgets and redacted error/replay state.
- Exercise SDK-free S3-compatible recipe: part numbering/limits/ETags/ordered completion, abort,
  list/recovery, checksum mismatch, renewal and opaque errors including HTTP-200 error payloads
  where the selected backend/provider requires it. No success from status alone.

### Batch 5 — Integration, downloads and documentation

- Test builtin overrides/custom operations/context requests, validation on original source and
  parts, middleware replacements/replay/recovery, mock unsupported/handler paths, and reset.
- Existing download stream into a slow sink remains bounded, cancellable, size-limited and byte
  exact; test presigned GET with the same destination policy. Range implementation requires D18.
- Existing three hooks, React 18/19 packed runtime, binary identity/hydration/invalidation remain
  intact. Extend tracked Next `/files` with interrupted → resumed advanced upload and honest UI.
- Update architecture/public API/READMEs/story to implemented behavior only; document protocol
  setup, optional capabilities, errors, runtime limits, persistence security and deferrals.

### Batch 6 — Verification and sign-off

- Extend packed type/runtime consumers and shared small deterministic protocol scenarios in
  Chromium, Node 22/24, Next SSR/dev/production, Vercel Edge and workerd; test capability rejection
  when crypto/headers/redirect controls are unavailable, not fabricated parity.
- Run `graphify update .` after code changes; review generated output normally.
- Final gate: `pnpm verify` (build → architecture → API → typecheck → tests → packed consumers →
  Chromium/Next → Edge/workerd), and CI Node 22/24. Record evidence and limitations against every
  acceptance item, then obtain owner sign-off. No version bump or release as an incidental step.

## Expected affected files (implementation candidates, not authorization now)

Paths below exist unless marked proposed. Keep the smallest change set proven by Batch 0.

| Paths                                                                                                                                                                          | Expected work                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/transfer/`                                                                                                                                                  | Proposed private orchestration, scheduler, checkpoint and integrity helpers alongside existing channel/counting/lifetime code; preserve old observer behavior. |
| `packages/core/src/api/resource-client.ts`, `api/validate.ts`                                                                                                                  | Strategy resolution, step bindings, optional config validation and proven context-forwarding fix.                                                              |
| `packages/core/src/request/pipeline.ts`, `request/retry.ts`                                                                                                                    | Reuse lifecycle/retry; approved shared-budget/delegated-request seam only, no second send loop.                                                                |
| `packages/core/src/types/definition.ts`, `types/transport.ts`, `types/builtins.ts`                                                                                             | Additive approved config/control/checkpoint/step types and transport security capabilities; new internal type file only if it improves cohesion.               |
| `packages/core/src/http/url.ts`, `http/multipart.ts`, `transport/fetch.ts`                                                                                                     | Narrow destination/security/body handling only where justified; multipart serialization itself is not redesigned.                                              |
| `packages/core/src/validation/`, `errors/`, `index.ts`                                                                                                                         | Original-source checks, structured failure narrowing and approved specialized exports only.                                                                    |
| `packages/core/src/mock/`, `packages/mocking/src/mock-types.ts`                                                                                                                | Minimal explicit unsupported/handler integration only if needed, no transfer storage engine.                                                                   |
| `packages/react/src/`, `packages/internal/shared/`                                                                                                                             | No planned source changes; fixes only with demonstrated regression and documented reason.                                                                      |
| `src/index.ts`, `src/core.ts`, other existing facade entries                                                                                                                   | Only approved re-exports; curated root additions not assumed.                                                                                                  |
| `tests/core/advanced-transfer-*.test.ts`, `tests/helpers/` (proposed)                                                                                                          | State/scheduler/recovery/security/integrity/types tests and independent protocol simulator.                                                                    |
| `tests/react/framework-files-*.test.tsx`, `tests/facade/`                                                                                                                      | Advanced operation integration and stable existing public surfaces.                                                                                            |
| `scripts/file-consumer-runtime.mjs`, `scripts/verify-react-consumers.mjs`, `verify-type-consumers.mjs`, `verify-unified-consumer.mjs`, `verify-browser.mjs`, `verify-edge.mjs` | Extend existing packed/runtime matrices, no parallel verification toolchain.                                                                                   |
| `examples/frontends/query-ssr-next/app/files/`, associated routes/lib                                                                                                                    | Tracked deterministic transfer/recovery demonstration through public `apixa` imports.                                                                          |
| `packages/core/README.md`, `packages/react/README.md`, `README.md`, `docs/architecture.md`, `docs/public-api.md`, `docs/story.md`, roadmap/pointers                            | Implemented recipes, security boundaries, runtime evidence and milestone status.                                                                               |
| `tests/facade/public-exports.snapshot.json`                                                                                                                                    | Generated only after an approved actual export change, using `node scripts/verify-public-api.mjs --update`; never hand-edit.                                   |

## Explicit non-steps

- Stage 1 initialized this contract. The owner subsequently authorized Stage 2 under issue #103;
  `/implement-version` was invoked once. Do not invoke it again for this run, and do not invoke
  `/git-push` before the next owner instruction.
- Do not rewrite older frozen milestones or their unchecked approvals/evidence.
- Do not implement a second SDK/client, mandatory provider dependency, arbitrary cloud operations,
  automatic storage/persistence service, new hooks or public package.
- Do not weaken the ordinary origin guard, enable write retries globally, change normal uploads,
  bypass validation or claim server verification/completion from locally observed bytes.
- Do not create v1.8.0 or other future folders; do not commit, push, bump versions or publish.

## Done when

The approved contract and all applicable [acceptance-criteria.md](./acceptance-criteria.md) items
have implementation evidence and owner sign-off. Stage 1 is complete when these documents are
reviewable; it does not make the implementation checklist complete.
