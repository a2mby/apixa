# v1.8.1 — Context

Frozen milestone context. Living direction: [`docs/context.md`](../../docs/context.md).

## Goal

Provide a permanent, independent Laravel HTTP backend playground for the author to build real API behavior later. This milestone provisions and verifies the environment only.

## Identity (this release)

- Official Laravel 13 Composer skeleton under `examples/laravel-backend/`, PHP 8.4 supported by the resolved lockfile.
- External native PostgreSQL; separate development, backend-test and browser/E2E databases.
- Baseline: `origin/main` at `b0cf6b4`, including v1.8.0 PR #106; Node 22/24 CI passed. No assertion of v1.8.0 owner sign-off.
- Issue #107; branch `task/107-laravel-backend`. One published npm package stays `apixa@1.0.0-rc.0`; no npm release or version bump.

## What success looks like

A contributor installs Composer dependencies, provisions PostgreSQL, selects an environment, generates a private key, migrates the default schema and starts a multi-worker HTTP server. Native API routing is registered but empty. CORS and local storage work, and the SDK verification pipeline is unaffected.

## Principles that bind this release

1. Laravel conventions and Artisan environment selection, no custom loader or CLI.
2. Independent backend: no Apixa imports, Node dependency or PHP dependency in SDK packages.
3. No automatic database reset; no production connection in testing examples.
4. Verify actual infrastructure and distinguish readiness from application correctness or deployment.
5. The author owns future routes, controllers, models, transactions, storage and concurrency behavior.

## Intentionally out

Application APIs, authentication, custom middleware/error handlers, business logic, SDK integration, Playwright scenarios, Docker, Redis, workers and deployment infrastructure. See [scope.md](./scope.md).
