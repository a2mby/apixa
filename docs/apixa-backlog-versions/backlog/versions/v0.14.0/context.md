# v0.14.0 — React Hook Form integration

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Optional. **Source:** Existing backlog + requested integration.

## Goal

Offer convenient form submission using Apixa operations while leaving React Hook Form in charge of form state.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- TanStack integration contracts
- Zod adapter design (optional for usage)

## Open design questions

- Integration helper versus full package; assess whether recipes alone suffice.
- Server error shape and field-level mapping.
