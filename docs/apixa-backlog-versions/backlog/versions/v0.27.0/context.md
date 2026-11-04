# v0.27.0 — OpenAPI import/export and code generation

> **Planning only — not approved, implemented, or released.** This provisional backlog is deliberately stored outside `versions/` so it does not override the repository rule that only active/completed milestones receive frozen implementation folders. The A–F implementation decisions remain authoritative and unchanged.

## Status

Backlog / proposal. **Priority:** Medium. **Source:** Recommended integration.

## Goal

Interoperate with backend contracts while preserving Apixa-first API definitions.

## Invariants

- Apixa Core remains framework-agnostic; integrations depend on Core, never the reverse.
- Existing A–F semantics and independent operation behavior remain intact unless a separately approved breaking change says otherwise.
- Types and runtime behavior must agree; no invented backend capability.
- Optional integrations may not add mandatory peer dependencies to `@apixa/core`.

## Upstream dependencies

- Stable public definition model
- Zod schema design
- Package exports

## Open design questions

- Source-of-truth strategy: OpenAPI→Apixa, Apixa→OpenAPI or both.
- Schema mapping fallback and generated file update policy.
