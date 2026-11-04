# v0.14.0 — React Hook Form integration

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## In scope

- Provide an optional integration package or recipes for useForm and Apixa resource mutations.
- Map mutation loading, success, server field errors and general errors to form UX.
- Optionally compose with @apixa/zod resolvers, without requiring Zod.
- Support create, update, patch, and custom operations when present; form reset and invalidation are explicit.
- Keep composable submit handlers rather than a second form state machine.

## Out of scope

- No React Hook Form dependency in Core or mandatory root import.
- No duplicate implementation of React Hook Form validation and state.

## Deliverables

- Approved public API/design notes and package-boundary decision.
- Focused implementation with types, runtime support, integration tests, and working examples.
- Documentation describing limitations and migration/compatibility impact.
- No release until acceptance criteria pass.
