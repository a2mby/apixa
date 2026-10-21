# v0.6.0 — Acceptance criteria

Check every item before calling v0.6.0 done.

## API and types

- [x] Per-call `signal` and `timeout` are documented on operation call options (`RequestOptions` or equivalent).
- [x] Root (and any documented override level) supports opt-in `retry` config with typed fields.
- [x] Thin `middleware` (or locked name) accepts an ordered list of hooks with `ctx` + `next`.
- [x] Operations still return native `Promise<T>` (no custom Promise wrappers).
- [x] Public exports from `@apixa/core` include only the types callers need for retry / middleware.

## Runtime behavior

- [x] Aborting via `AbortSignal` throws documented `AbortError` and stops the request (and any retry loop).
- [x] Exceeding `timeout` throws documented `TimeoutError`.
- [x] When `retry` is enabled, allow-listed methods (default at least `GET`) retry on configured network / HTTP failures and eventually succeed or throw the last error.
- [x] Non-allow-listed methods (e.g. `POST` by default) are not retried.
- [x] Middleware can mutate request headers before the transport runs; composition order is documented and tested.
- [x] Caller abort is never turned into a silent retry success.

## Constraints

- [x] `@apixa/core` has no React, Next.js, or TanStack Query dependencies.
- [x] No new packages under `packages/` for this milestone.
- [x] No schema validation library dependency in Core.
- [x] Production path still does not require a Core `mocks` product API.
- [x] Fetch remains the default transport **inside** Core.

## Example and docs

- [x] Core README documents cancel, timeout, retry, and middleware with **implemented** syntax only.
- [x] CHANGELOG records v0.6.0 reliability work.
- [x] Roadmap / living docs mark shipped reliability items vs still-planned (schema hooks, pagination conventions, client/server, TanStack package).

## Tests

- [x] Tests cover abort, timeout, retry success after failures, no-retry for unsafe methods, abort during retry, and middleware header mutation.
- [x] Tests use injectable / fake `Transport` (no flaky live network requirement).
- [x] `pnpm` typecheck and test scripts relevant to Core pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or consciously waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated with a completion note.

Implementation-plan notes: Steps 2–7 completed. Step 1 was the `/start-version` kickoff. Optional Next abort demo waived (docs + `tests/core/reliability.test.ts` suffice per scope). `examples/basic` not updated (repo rule: maintain `examples/next` only; Next demo optional and skipped).
