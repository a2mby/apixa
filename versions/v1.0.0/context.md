# v1.0.0 — Query integration context

Apixa Core owns resource operations, request execution, cancellation, timeouts, and Core retries.
`@apixa/tanstack-query` owns the mapping from those operations to TanStack Query v5. TanStack
owns query observers, cache state, refetch scheduling, and query retries. React and TanStack do
not enter Core.

The previous v0.8 hook mixed reads and writes. The query/write split was started on the task
branch before this workstream. This milestone finishes the Query side, makes
`useResourceMutation` resource-wide, and adds the `useResource` facade over both.

The package is still versioned `0.8.0` in source until the full v1 release is approved and
published. This folder records the v1 Query contract and its verification without claiming a
package release.

Final stabilization requires an explicit `kind` for every custom Core operation, validates
HTTP methods against that kind, and removes query-side read overrides and the single-operation
mutation overload. The unified hook composes the public query and mutation hooks.
