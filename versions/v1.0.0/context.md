# v1.0.0 — Query integration context

Apixa Core owns resource operations, request execution, cancellation, timeouts, and Core retries.
`@apixa/react` (developed as `@apixa/tanstack-query`) owns the mapping from those operations to TanStack Query v5. TanStack
owns query observers, cache state, refetch scheduling, and query retries. React and TanStack do
not enter Core.

The previous v0.8 hook mixed reads and writes. The query/write split was started on the task
branch before this workstream. This milestone finishes the Query side, makes
`useResourceMutation` resource-wide, and adds the `useResource` facade over both.

The only public package is `apixa`, prepared as `1.0.0-rc.0` but not published. Core, Mocking,
React and shared logic are private implementation workspaces (ADR 005). This folder records the v1 Query contract and its verification without claiming a
package release.

Final stabilization requires an explicit `kind` for every custom Core operation, validates
HTTP methods against that kind, and removes query-side read overrides and the single-operation
mutation overload. The unified hook composes the public query and mutation hooks.
