# Behavioral verification

**Why it exists:** Directs tests at behavior and changed boundaries, not implementation details.
**Use when:** choosing behavioral coverage or verifying changed module/integration boundaries.
**Do not use when:** the change has no behavior or contract effect (comment, rename); extra tests only add maintenance.

Use the project's existing runner and test conventions. Add tests for meaningful behavior, changed contracts, or regression risk; exception: a reversible low-impact presentation change needs focused existing checks and visual/interaction inspection rather than a test that mirrors implementation details.

## Select coverage at the changed boundary

| Changed responsibility | Verify                                                                | Avoid coupling to                               |
| ---------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Pure model/rule        | Invariants, boundary inputs, malformed values                         | Private helper names or file layout             |
| State owner/reducer    | Allowed transitions, reset, stale response, derived values            | Store implementation internals                  |
| Typed client/parser    | Required/optional/unknown fields, errors, timeout/abort               | A mock that bypasses the parser being tested    |
| Mutation workflow      | Pending, server validation, unknown outcome, retry/duplicate handling | Assuming disabled buttons guarantee idempotency |
| Form interaction       | Keyboard/focus, retained input after error, success/reset             | DOM snapshots with no behavioral assertion      |
| Boundary refactor      | Public consumer behavior, forbidden imports, cycle removal            | Counting folders or checking exact export text  |
| SSR/client handoff     | Browser-safe imports, serializable props, one cache owner             | Duplicated independent fetches in fixtures      |

## Procedure

1. Establish current behavior from a public consumer or existing regression test. For a bug, demonstrate the failing behavior before the repair when a reproducible test is available; otherwise record the concrete reproduction.
2. Select the smallest test exercising the real owner and its public contract. For an integration change, include the boundary parser/error path instead of mocking it away.
3. Test expected failure paths alongside success. Contract fixtures must be schema-valid unless malformed input is the test. Keep browser globals out of pure model tests.
4. Run targeted checks while editing, then the repo checks listed in [enforcement](enforcement.md). After they pass, repeat only if new changes/failures justify it.
5. For visual/interaction changes, inspect the UI with available permitted tooling. If inspection is unavailable, report that limitation rather than implying pixels, accessibility, or browser behavior were verified by typecheck.

A Square uses Node's test runner with its TypeScript alias registration in the web workspace script. Read that script before running an individual file; running plain `node --test` can bypass required resolution. Do not introduce a second runner for ordinary additions.

Tradeoff: testing the boundary protects behavior through internal refactors; costs maintaining realistic contract fixtures. Avoid adding framework-heavy integration tests for a pure function. Misuse of implementation-shaped mocks can make a broken integration pass.
