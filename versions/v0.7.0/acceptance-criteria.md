# v0.7.0 — Acceptance criteria

Check every item before calling v0.7.0 done.

## Types

- [x] `ApiState` is `Record<string, ResourceState>` (no unknown collapse for resources).
- [x] Resource + op path params both appear in call arity / `PathParamsOf`.
- [x] `ResourceState` supports `list?` / `query?`; `getAll` uses `ListOf` / `QueryOf`.
- [x] `RuntimeOperationValue` and `ResourceDefinition` are gone; runtime ops use `OperationDefinition` (+ extensions).
- [x] Header fields use `HeadersInitLike` (not `BuiltinHeaders | …` union at call sites).
- [x] `ApiClient<T>` omits non-resource keys without mapping them to `never`.
- [x] Empty `ResourceExtensions` / `OperationExtensions` exist; mocking augments mock keys outside Core’s base types.

## Runtime

- [x] `hasBody` defaults from method; override still works.
- [x] Binary / form / string bodies pass through; plain objects JSON-encoded.
- [x] `queryArrayFormat` and `querySerializer` work as documented (default `"repeat"`).
- [x] `RequestOptions` supports `retry`, `responseType`, `meta`, `full` with typed `CallResult` behavior.
- [x] Middleware `next` returns `ApiResponse` and is safely re-callable; context includes `request`, `response?`, `attempt`, `meta`.
- [x] Retry supports `respectRetryAfter`, `shouldRetry`, `onRetry`.
- [x] Errors expose `ApiErrorCode`, `retryable`, `attempt`; `HttpError<D>`; `isHttpError` / `isTimeoutError` exported.

## Constraints

- [x] No new packages; no React / TanStack in Core.
- [x] Auth / cache / validation / pagination helpers not added to Core.
- [x] Core types do not declare `mock` / `mockConfig` (mocking augments).

## Docs

- [x] CHANGELOG lists breaking changes (middleware next/ctx, mock moved out, hasBody default) + short migration note.
- [x] README / Core docs match **implemented** API only.
- [x] Living roadmap / context / story updated for v0.7.0 completion.

## Tests

- [x] Existing suites updated and green.
- [x] New tests cover new behavior only (path concat, body passthrough, query format, `full`, middleware re-call, retry hooks, error guards, mocking augmentation).
- [x] `pnpm` typecheck and test pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or consciously waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note.

Implementation-plan notes: All steps 2–10 completed. Kickoff (step 1) was `/start-version`. Optional Next demo limited to existing reliability config; no `examples/basic` edits (Next-only rule).
