# v1.8.1 — Acceptance criteria

Check only after observed evidence. Owner sign-off is independent of implementation.

## Environment

- [x] Official stable Laravel 13 skeleton and Composer lock install on supported PHP; no Node dependency.
- [x] PostgreSQL default with no normal SQLite test/development path; framework migrations unchanged.
- [x] Native PostgreSQL dev connection and default migrations/status verified.
- [x] Test and E2E environments select distinct PostgreSQL databases with no reset.
- [x] Empty API file registered at `/api`; no Sanctum or application endpoint/controller added.
- [x] Environment-driven built-in CORS preflight exercised for allowed and denied origins; optional credentials safe.
- [x] Private filesystem write/read/delete verified; public disk/link configuration retained; runtime artifacts ignored.
- [x] Multi-worker local server exercised; PostgreSQL supports independent simultaneous connections.
- [x] Four secret-free environment references and reproducible setup/start/stop/reset/production/Playwright documentation.

## Boundaries and checks

- [x] No SDK internals, public API, package-version, root Node manifest/workspace or CI changes; npm tarball excludes Laravel.
- [x] Default Laravel tests, Composer validation/platform/audit, PHP syntax/style and config/route caching checked.
- [x] Full `pnpm verify` passes unchanged; exact limitations recorded if any prerequisite is missing.
- [x] `graphify update .` run; final diff and tracked secret/runtime exclusions inspected.
- [ ] Commit pushed and PR opened into main; existing CI Node 22 and 24 completes successfully.
- [ ] Owner final sign-off (requires explicit approval; no merge authorized by this implementation request).

## Evidence

Recorded 2026-11-11 on `task/107-laravel-backend`, based on `b0cf6b4` (PR #106).

- Official `laravel/laravel` skeleton **v13.11.0**, installed with Composer `create-project --no-scripts`; framework locked at **13.42.0**. Runtime verification uses **PHP 8.4.21** (Homebrew) and **Composer 2.10.3**. Manifest requires PHP 8.4 and `ext-pdo_pgsql`; lockfile installs reproducibly.
- PostgreSQL **16.15** already ran as an external Homebrew service. Created only a new non-superuser/non-createdb/non-createrole `apixa_dev` role and three new owned databases. Existing loopback authentication is `trust`; no passwords, listener/auth changes or existing database modifications. Existing service listens on `::1`, so ignored private environment files select that host; tracked illustrative defaults remain `127.0.0.1`.
- `artisan --version`, `about`, `db:show --database=pgsql` boot successfully. Laravel reports **pgsql / apixa_laravel_dev / apixa_dev**; all **three unmodified framework migrations** ran successfully (batch 1), confirmed by `migrate:status`. No seeds or factories executed.
- `tinker --env=testing` and `--env=playwright` perform read-only identity queries against **apixa_laravel_test** and **apixa_laravel_e2e**. No migrations or resets ran against either. Two simultaneous independently named Laravel connections to the test DB returned distinct PostgreSQL backend PIDs.
- `route:list` reports only stock `/` and framework `/up`. `route:list --path=api` reports no matching routes (exit **0**). API bootstrap registration and the minimal API file inspected structurally. The stock skeleton's JSON rendering policy is retained. No Sanctum installed; automatic private-file serving disabled.
- Native `Storage::disk("local")` temporary UUID file: write, read equality, delete and nonexistence assertions passed. `storage:link` and `storage:unlink` passed with the standard **public** target only; no symlink or verification file remains.
- Real PHP HTTP server on **127.0.0.1:8000**, with `--no-reload`: four child workers plus parent listener confirmed by process inspection. `/up` and stock `/` returned **200**. Sixteen parallel health requests returned **200**; this does not test business concurrency correctness.
- Real OPTIONS preflight against nonexistent `/api/probe`: **204** for GET/POST/PUT/PATCH/DELETE; configured localhost origin receives its exact allow-origin header and no credentials header; unlisted origin receives no allow-origin header. GET on that API path returns **JSON 404**, proving no endpoint was added.
- Additional server using native `--env=playwright` on **127.0.0.1:8002** returned `/up` **200**. External configuration enabled credentials and supplied `*, http://localhost:3000`: wildcard was removed, the configured origin was echoed with credentials true, and the unlisted origin received no matching allow-origin value. Both verification servers were stopped with Ctrl-C and their ports released.
- `composer validate --strict`, `check-platform-reqs` (including `pdo_pgsql`), and `audit` passed (no vulnerability advisories). Pint passed; **27 PHP source files** linted successfully. `artisan test --env=testing`: **2 default tests / 2 assertions**, passed. No application-specific tests added.
- `config:cache`, `route:cache`, `view:cache` passed and all were cleared afterward. A clean temporary copy of the 57 trackable files also passed `composer install --no-dev --optimize-autoloader --no-interaction`, framework boot and all three caches with `APP_ENV=production` / `APP_DEBUG=false`, without development packages, a real production key or any database migration.
- `npm pack --dry-run --ignore-scripts --json`: **208 files**, version **1.0.0-rc.0**, **no examples/Laravel files**. `pnpm list -r --depth -1` contains no Laravel workspace. Root package/workspace/CI files and SDK internals unchanged.
- Git candidate inspection found **57** Laravel source/reference/placeholder files, exactly four environment references, no private environments, keys, passwords, vendor or runtime files. Root format and `git diff --check` passed. `graphify update .` ran successfully (AST update; configuration-only PHP files may yield no symbols; docs are not semantically rebuilt by this command).

### Resolved environment observations and limits

- Initial TCP connection to `127.0.0.1:5432` failed because the existing cluster listens only on IPv6 loopback. Verified successfully with `::1` without changing the cluster; README documents this case.
- Initial backend shell selected a separate Homebrew PHP 8.5 binary with a pre-existing missing optional `grpc.so` extension warning. All recorded backend checks use the explicit Homebrew **PHP 8.4.21** PATH; no global PHP configuration changed.
- A redundant `config:publish cors` invocation reported the custom file already existed; it did not overwrite configuration. The committed CORS configuration is derived from Laravel's built-in configuration.
- No production deployment, browser/Playwright scenario or application contention/locking/isolation test was performed; these are explicit non-goals. Local health/preflight requests are real HTTP requests, not an actual browser run.

### Remaining delivery evidence

`pnpm verify` completed with **exit 0** on Node 24.20.0: build, architecture, public API,
typecheck, **151 files / 1,600 tests**, packed React 18/19 and other consumers, **62/62**
type-consumer checks, real Chromium **5 checks**, Vercel Edge and workerd. No checks weakened.

Commit/PR and Node 22/24 CI are delivery gates tracked on issue #107 and its linked PR; their
results cannot be known before the final commit is pushed. Owner sign-off remains separate;
no merge or publication. The unchecked delivery item is intentionally left for PR evidence.
