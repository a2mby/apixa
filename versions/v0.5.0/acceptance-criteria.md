# v0.5.0 — Acceptance criteria

Check every item before calling v0.5.0 done.

## Mocking API

- [x] `@apixa/mocking` is a workspace package that depends on `@apixa/core` (not the reverse).
- [x] Public API can load a local dataset by id and construct a mock `Transport`.
- [x] `defineApi({ transport: mockTransport })` serves at least `getAll` / `getByID` from dataset data.
- [x] Core production Fetch path does not require or expose a Core `mocks` product API.
- [x] Dataset metadata includes id, title, license, version, and enough info for record count / schema summary.

## Registry

- [x] Registry can list local datasets and load one on demand (no network).

## Backend removal

- [x] `backend/` directory is gone from the repo.
- [x] Backend run/stop/restart scripts are removed or no longer reference FastAPI.
- [x] Docs / README / scripts README no longer instruct developers to start the FastAPI server.
- [x] Next example does not depend on `127.0.0.1:8787` for the happy path (uses mocking).

## Website / hosted

- [x] No Apixa website app added.
- [x] No hosted catalog, auth, or DB.
- [x] Docs note a future online catalog as planned only.

## Constraints

- [x] No React / Next / TanStack Query in `@apixa/core`.
- [x] Frozen v0.1–v0.4 folders not rewritten for new features.
- [x] Documentation marks implemented vs planned honestly.

## Tests

- [x] Tests cover dataset load, registry list/load, and mock transport read routing.
- [x] Existing Core tests still pass.
- [x] `pnpm typecheck` and `pnpm test` pass.

## Sign-off

- [x] [implementation-plan.md](./implementation-plan.md) steps completed or waived with a note here.
- [x] [docs/story.md](../../docs/story.md) updated for kickoff and completion.
