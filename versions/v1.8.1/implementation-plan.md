# v1.8.1 — Implementation plan

## Design decisions

1. Use Composer's official stable Laravel 13 skeleton; retain lockfile. Resolve and verify against installed PHP 8.4.
2. PostgreSQL is the default connection; retain standard database configuration and migrations. No SQLite install hook or in-memory PHPUnit override.
3. Register API routing directly in `bootstrap/app.php`; do not install Sanctum. Retain the skeleton's JSON rendering policy.
4. Publish only CORS configuration; exact origins from environment, credentials off unless enabled. Empty production allowlist fails closed.
5. Preserve local/public disks; disable the local disk's automatic signed serving routes so no file endpoints are introduced.
6. Remove npm/Vite assets/manifests and Composer scripts that require npm or automatically migrate. Keep the stock welcome view (its inline fallback works without Vite).
7. Separate environment files via native Artisan `--env`; clear configuration cache before switching. Force PHPUnit database identity and clear DB_URL to avoid accidental development/production selection.
8. No merge or npm publication in this task; PR and CI monitoring only.

## Ordered steps

1. Inspect repository, previous milestone merge/CI, publishing whitelist and workspace discovery; create issue #107 and branch from latest main.
2. Create this filled contract and living pointers without changing frozen milestone files.
3. Install the official skeleton without its SQLite/automatic migration hooks; configure PHP-only Composer lifecycle and PostgreSQL/API/CORS/storage/environment settings.
4. Document native Homebrew provisioning, independent environment selection, safe manual reset, multi-worker startup/shutdown, production expectations and troubleshooting.
5. Provision only new local role/databases; boot Laravel, inspect DB identity, migrate development defaults, round-trip private storage, inspect routes, exercise /up and preflight, inspect worker processes and test/E2E DB identities.
6. Run Composer validation/platform/audit, PHP lint/Pint, default Laravel tests, configuration/route cache checks, unchanged pnpm verify, npm pack exclusion and workspace inspection. Record actual results.
7. Run graphify update, format, inspect scoped diff/secret exclusions, rebase latest main, commit, push, open PR and monitor Node CI. Leave merge approval to the owner.

## File touch list

- `examples/backends/laravel-backend/**` (official skeleton, lockfile, environment references, README)
- `.gitignore` (allow only the requested additional example)
- `README.md` (discovery link)
- `docs/context.md`, `docs/roadmap.md`, `docs/story.md`
- `versions/README.md`, `versions/v1.8.1/{context,scope,implementation-plan,acceptance-criteria}.md`
- `graphify-out/**` (generated, already ignored)

## Explicit non-steps

No SDK edits, version bump, npm publish, new frontend/API/domain behavior, custom infrastructure or tests simulating application behavior. No destructive database command is run by setup or verification.
