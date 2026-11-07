# 005 — One npm distribution with private modular implementations

Status: accepted, 2026-11-08. Supersedes ADR 004's four-publication strategy.

## Context

The owner controls `apixa` under npm account `a2mby`, but not the `@apixa` scope. Separate
publications add coordination and install requirements without improving the intended developer
interface. Core must remain independent of React and future framework integrations.

## Decision

Publish only `apixa`. Keep Core, Mocking, React and shared logic in private workspaces with their
existing names and dependency boundaries. Compile canonical sources through the facade into one
code-split distribution. Leave React and TanStack external as optional peers. Emit declarations
per canonical module with relative imports, preserving identity and isolating Core from React types.
The public entry contract lives in [public-api.md](../public-api.md); enforcement lives in
[architecture.md](../architecture.md#architecture-contract-v100).

## Consequences

One tarball includes all capabilities and lazy datasets, so the download includes unused integrations.
Consumer tree shaking and entry isolation keep unused framework code out of Core applications.
No scope ownership, coordinated publication or separately installed implementation package is required.
Private workspaces remain independently testable. Future integrations add subpaths, not public packages.
