# Laravel real-world backend playground

> **Local data follow-up:** PostgreSQL relations/JSONB, MongoDB documents, JSON sources and guarded seeders are now available. See [Playground datasets](database/fixtures/README.md) for the current migration/seeding commands. The environment-only text below describes the original v1.8.1 baseline; `php artisan test` now also requires the migrated PostgreSQL/MongoDB test stores. A standalone Product Management API (`/api/workspaces/{workspace}/products`) was added afterwards: see [docs/PRODUCT_API.md](docs/PRODUCT_API.md). No other application endpoints exist.
> A permanent, independent Laravel environment for real HTTP and PostgreSQL experiments. The author
> owns all future API design, controllers, models, transactions, file handling and concurrency tests.
> This milestone configures infrastructure only: no application API, authentication, SDK integration,
> frontend, Playwright scenarios, Docker or Redis.

## Prerequisites

- PHP **8.4+** for the committed lockfile (verified with PHP 8.4.21). Laravel 13 itself supports
  PHP 8.3+, but this lock resolves PHP 8.4 dependencies. Use `composer check-platform-reqs`.
- Composer 2 (verified with 2.10.3).
- Native PostgreSQL 16+ and its command-line tools (verified with Homebrew PostgreSQL 16.15).
- Standard Laravel PHP extensions, including `pdo_pgsql`, `mbstring`, `openssl`, `fileinfo`, XML,
  ctype, curl, DOM and tokenizer. `pcntl`/fork support is needed for local multiple workers.

On a new macOS machine with [Homebrew](https://brew.sh/), install only missing prerequisites:

```bash
brew install php@8.4 composer postgresql@16
export PATH="$(brew --prefix php@8.4)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
php -v
composer --version
php -m
psql --version
```

An existing supported PHP/Herd or PostgreSQL installation is fine. Inspect `brew services list`
and `pg_isready -h 127.0.0.1 -p 5432` first; do not replace an existing cluster, change its
authentication rules, or start a second service on the same port. No Node installation is needed
for this application. The root Node workspace and verification remain independent. If an existing PostgreSQL service
listens only on IPv6 loopback, set `DB_HOST=::1` in private environment files and use
`psql -h ::1`; there is no need to change that service's listener configuration.

## Native PostgreSQL provisioning

For a new Homebrew PostgreSQL 16 installation:

```bash
brew services start postgresql@16
pg_isready -h 127.0.0.1 -p 5432
```

Homebrew initializes a cluster for your macOS account. Run the following as its local administrator
(or use your existing cluster's administrator connection). Inspect first:

```bash
psql -d postgres -c '\du'
psql -d postgres -c '\l'
```

Create only resources that are absent. Each database is independently provisionable:

```bash
createuser --login --no-superuser --no-createdb --no-createrole --pwprompt apixa_dev
createdb --owner=apixa_dev apixa_laravel_dev
createdb --owner=apixa_dev apixa_laravel_test
createdb --owner=apixa_dev apixa_laravel_e2e
```

`--pwprompt` asks you to choose a role password; there is no shared default password. Put it only
in your private environment files. Local Homebrew clusters may already allow loopback `trust`
authentication; in that case an empty password works under that existing policy, and you may omit
`--pwprompt`. Do not weaken authentication to make these instructions work. On a password-protected
cluster, use `psql -W` or a private PostgreSQL password file; do not put passwords in shell history.
The local role owns only these new playground databases and has no cluster administration powers.
For production use deployment-managed least-privilege credentials and separate roles as appropriate.

Check the intended database over the same TCP connection Laravel uses:

```bash
psql -h 127.0.0.1 -p 5432 -U apixa_dev -d apixa_laravel_dev \
  -c 'SELECT current_database(), current_user, version();'
```

These commands never drop databases. Do not rerun creation for an existing role/database or alter
an existing role's password without understanding who else uses it.

## Install and start

From the repository root:

```bash
cd examples/backends/laravel-backend
composer install
cp .env.example .env
# Edit .env for your local PostgreSQL credentials before continuing.
php artisan key:generate
php artisan config:clear
php artisan db:show --database=pgsql
php artisan migrate
php artisan migrate:status
php artisan serve --host=127.0.0.1 --port=8000 --no-reload
```

The server stays in the foreground; **Ctrl-C** stops Laravel and its workers. `APP_URL` describes
the public URL; `--host` and `--port` control the actual listener. Templates also supply Laravel 13's
`SERVER_HOST` and `SERVER_PORT`. Bind to loopback by default. `/up` is Laravel's built-in health
route; `/` is the unmodified skeleton welcome page and works without a Vite build.

`composer install` uses the lockfile and discovers framework packages. It does not provision or
migrate a database, start a queue worker, or invoke npm. Composer's skeleton `setup` and `dev`
scripts, optional npm/Vite scaffolding and automatic SQLite migration hooks were removed for this
PHP-only environment. Optional skeleton agent bootstrap instructions were omitted because they
require installing additional tooling. The default User model, base Controller, factory, empty
seeder and three framework migrations are retained; no custom model/controller or data was added.

## Select an environment

Only reference files are tracked. Copy a reference once (do not overwrite an existing local file),
set private credentials, and generate its own local key:

| Purpose              | Reference → private file                      | Database             | HTTP port        |
| -------------------- | --------------------------------------------- | -------------------- | ---------------- |
| Development          | `.env.example` → `.env`                       | `apixa_laravel_dev`  | 8000             |
| Backend tests        | `.env.testing.example` → `.env.testing`       | `apixa_laravel_test` | 8001             |
| Future browser/E2E   | `.env.playwright.example` → `.env.playwright` | `apixa_laravel_e2e`  | 8002             |
| Production reference | `.env.production.example`                     | supplied externally  | production stack |

Laravel natively loads `.env.<name>` when Artisan receives `--env=<name>`. `--env=playwright`
selects the file even though that file's `APP_ENV` is `testing`. An already exported environment
variable takes precedence over dotenv. Run local test commands in a shell free of production
`APP_ENV`, `DB_*` and `APP_CONFIG_CACHE` values. Keep `DB_URL` empty: a connection URL otherwise
overrides discrete database fields. Do not point a test or E2E configuration at production.

**Clear cached configuration before switching.** Laravel's default cache file is shared between
environments; when cached, it bypasses dotenv selection. Stop running servers before changing a
shared cache. Do not run `config:cache` during local cross-environment work. Separate parallel
Laravel checkouts if different servers need cached configuration simultaneously.

Backend test preparation and optional HTTP server:

```bash
cp .env.testing.example .env.testing
php artisan key:generate --env=testing
php artisan config:clear
php artisan db:show --database=pgsql --env=testing
php artisan migrate --env=testing
php artisan migrate:status --env=testing
php artisan test --env=testing
php artisan serve --env=testing --host=127.0.0.1 --port=8001 --no-reload
```

The default two Laravel tests contain no application scenarios. PHPUnit explicitly forces
`pgsql`, `apixa_laravel_test`, an empty `DB_URL` and `APP_ENV=testing`; it cannot silently fall back
to SQLite or the development database name. Credentials/host still come from the test environment.
`php artisan test` is not the future browser/E2E runner: its database remains the backend test
DB. Clear config first even when invoking `vendor/bin/phpunit` directly. No `RefreshDatabase`
behavior or automatic reset was added. Future database-dependent tests must preserve isolation.

Future Playwright backend preparation (Playwright itself belongs to a separate frontend project):

```bash
cp .env.playwright.example .env.playwright
php artisan key:generate --env=playwright
php artisan config:clear
php artisan db:show --database=pgsql --env=playwright
php artisan migrate --env=playwright
php artisan migrate:status --env=playwright
php artisan serve --env=playwright --host=127.0.0.1 --port=8002 --no-reload
```

A future runner can use backend base URL `http://127.0.0.1:8002`, wait for `/up`, and stop the
foreground process group afterward. Configure the separate frontend's exact origin in
`.env.playwright`. Inspect the selected DB before running any future fixture or reset command.
Stopping this server does not affect the development database. There are no E2E routes, browser
tests, generated datasets or fixtures here.

## API routing and CORS

`bootstrap/app.php` registers `routes/api.php` with prefix `/api` and the standard `api` middleware
group. It originally defined no endpoints; it now registers the Product API only (see [docs/PRODUCT_API.md](docs/PRODUCT_API.md)). No Sanctum is
installed. The skeleton already renders JSON for `api/*` requests or an `Accept: application/json`
header; no custom exception handler was added.

```bash
php artisan route:list
php artisan route:list --path=api
```

The second command reports no matching routes (exit 0 on the verified Laravel version). This is
expected. The retained framework routes are the welcome page and built-in health route only.

`config/cors.php` customizes Laravel's built-in global CORS middleware for `api` and `api/*`.
`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact origins, with no trailing slash or path.
Local references allow localhost and 127.0.0.1 on ports 3000 and 5173. Methods and ordinary request
headers are accepted through framework preflight handling. `CORS_SUPPORTS_CREDENTIALS=false` is
the default; change it only when future application behavior requires it. Wildcard origin entries
are ignored, including with credentials enabled. An empty allowlist permits no cross-origin
browser access. Production requires explicit frontend origins. CORS is not authentication and
does not bypass CSRF or create API endpoints.

With Laravel running, preflight can be checked against a nonexistent API path:

```bash
curl -i -X OPTIONS http://127.0.0.1:8000/api/probe \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type, Authorization'
```

Expect 204 with `Access-Control-Allow-Origin: http://localhost:3000`. An unlisted origin must not
receive that header. The actual `/api/probe` request still returns JSON 404; no probe route exists.

## Filesystem

- `local` (default): `storage/app/private`, private application files. Automatic signed local-disk
  serving is disabled, so the framework adds no file upload/download routes.
- `public`: `storage/app/public`, exposed only when explicitly used with `php artisan storage:link`.
  That command links `public/storage` to **public storage only**; never link the private disk.
- Logs: `storage/logs`; compiled views/session/cache: `storage/framework`; framework caches:
  `bootstrap/cache`. Directory placeholders are tracked and runtime contents are ignored.

Keep these directories writable by the local PHP user and deployment service account. Do not use
world-writable permissions. To verify private storage through Laravel's built-in facade:

```bash
php artisan tinker --execute='$disk = Illuminate\Support\Facades\Storage::disk("local"); $path = "verification/".Illuminate\Support\Str::uuid().".txt"; try { throw_unless($disk->put($path, "storage-ok"), new RuntimeException("write failed")); throw_unless($disk->get($path) === "storage-ok", new RuntimeException("read failed")); } finally { $disk->delete($path); } throw_if($disk->exists($path), new RuntimeException("delete failed")); dump("private storage round trip passed");'
```

No verification file remains. This does not expose a route or validate future file-handling code.

## Concurrency readiness and server limits

Each local reference sets `PHP_CLI_SERVER_WORKERS=4`. On supported macOS/Linux PHP builds,
`php artisan serve ... --no-reload` starts multiple CLI server workers (PHP also has a parent
listener). **Without `--no-reload`, Laravel warns and uses one server.** Restart after environment
changes because reload is disabled. Windows' PHP CLI server does not support workers; use an
appropriate multi-worker PHP stack for concurrency experiments there.

The built-in server is for development only: worker count, timeouts, process supervision and
streaming behavior differ from production; long requests occupy workers. It is not a benchmark
or production deployment. Check actual worker processes before future contention tests:

```bash
ps -axo pid,ppid,command | rg 'php.*(-S|artisan serve)'
```

Use `grep` if `rg` is unavailable. PostgreSQL must permit enough independent connections for all
workers/test clients (`SHOW max_connections`). Laravel uses normal per-process PDO connections,
PostgreSQL transactions/locks/isolation/indexes/constraints and no artificial global mutex or
shared transaction. Future tests can open independently named Laravel connections to the same
dedicated test database. In-process PHPUnit HTTP tests are not real concurrent HTTP clients.
Worker processes and separate DB connections establish infrastructure readiness only; no race,
contention, locking, isolation or application correctness claim is made.

## Reset, stop and caches

Stop each foreground Laravel server with Ctrl-C before switching its environment. Leave a shared
PostgreSQL service running for other projects. If this service is yours alone, stop it with:

```bash
brew services stop postgresql@16
```

Normal migrations are additive: `php artisan migrate` and `php artisan migrate:status`. No setup
or verification command here resets a database. For a **deliberate destructive reset** of the
backend-test database only, stop its server, clear config, inspect `db:show --env=testing`, confirm
it reports `apixa_laravel_test`, then explicitly choose:

```bash
php artisan migrate:fresh --env=testing
```

This drops all tables in the selected database. Never use it against development data you need or
production; never add it to automatic startup. No automatic seeds or factories run.

```bash
php artisan config:clear
php artisan route:clear
php artisan view:clear
```

Rebuild `config:cache` / `route:cache` only for the intended environment, and clear them again
before switching. `cache:clear` clears the selected application's cache store, not its schema.

## Production configuration reference (no deployment)

`.env.production.example` is a reference, not a provisioned server. Supply configuration through
the deployment environment or a protected server-side dotenv file. Required expectations:

- `APP_ENV=production`, `APP_DEBUG=false`, a private deployment-generated `APP_KEY` and HTTPS
  `APP_URL`; keep the key stable. Never commit secrets or print them in reports.
- Explicit `DB_CONNECTION=pgsql`, host/port/database/role/password and least-privilege PostgreSQL
  permissions. The reference uses `DB_SSLMODE=verify-full`; configure the trusted database CA and
  hostname for that deployment. Blank DB settings must be supplied before use.
- HTTPS at the application ingress, an exact `CORS_ALLOWED_ORIGINS` list and credentials off
  unless deliberately enabled. No `*` origin policy.
- `FILESYSTEM_DISK=local`, `LOG_CHANNEL=stderr`, `CACHE_STORE=file`, `SESSION_DRIVER=file` and
  `QUEUE_CONNECTION=sync` are simple native choices. No Redis or background worker required.
  File-based state is node-local; a future multi-node deployment must choose suitable shared
  storage/state drivers and retention separately.
- A proper PHP production serving stack with document root **`public/`**, writable `storage/`
  and `bootstrap/cache`, protected `.env`, and runtime-appropriate file permissions. Never serve
  the repository root or use `php artisan serve` in production.
- Install with `composer install --no-dev --optimize-autoloader --no-interaction`; with the actual
  deployment configuration loaded, run `php artisan config:cache`, `php artisan route:cache` and
  `php artisan view:cache`. Migrations are a separate reviewed deployment step
  (`php artisan migrate --force`), never an install side effect.

No production stack, infrastructure configuration or deployment is included. Successful local
boot, cache generation and HTTP verification do not establish a completed production deployment.

## Verification and troubleshooting

Run from this directory with development credentials configured:

```bash
composer validate --strict
composer check-platform-reqs
composer audit
php artisan --version
php artisan about
php artisan db:show --database=pgsql
php artisan migrate:status
php artisan route:list --path=api
php artisan config:show cors
vendor/bin/pint --test
php artisan config:clear
php artisan test --env=testing
curl --fail http://127.0.0.1:8000/up
```

`config:show cors` contains no secrets; avoid dumping full configuration or `APP_KEY` in shared
output. `db:show` reports connection/schema metadata without a reset. To check exact DB identity:

```bash
php artisan tinker --execute='dump(config("database.default"), Illuminate\Support\Facades\DB::selectOne("select current_database() as database, current_user as role, version() as version"));'
php artisan tinker --env=testing --execute='dump(config("database.default"), Illuminate\Support\Facades\DB::selectOne("select current_database() as database"));'
php artisan tinker --env=playwright --execute='dump(config("database.default"), Illuminate\Support\Facades\DB::selectOne("select current_database() as database"));'
```

From the Apixa repository root, `pnpm verify` still checks SDK architecture, exports, types,
tests, packed consumers, Chromium and edge runtimes. Existing Node 22/24 CI has no PHP/PostgreSQL
requirement. The backend is Composer-only, has no `package.json` to enter pnpm's `examples/*`
workspace glob, and is excluded by the root npm `files: ["dist"]` whitelist. No SDK version changed.

Common issues:

- **Could not find driver:** enable `pdo_pgsql` in the PHP used by Composer and Artisan; compare
  `which php`, `php --ini`, `php -m` and `composer check-platform-reqs`.
- **Connection refused:** inspect `brew services list`, `pg_isready`, configured host and port.
  Do not replace an existing service to fix a port collision.
- **Role/database missing or authentication failed:** verify with TCP `psql`; create only absent
  resources using a cluster administrator; set your own private password. Do not edit `pg_hba.conf`
  to weaken authentication.
- **Wrong database/environment:** stop the server, `config:clear`, inspect exported `DB_*`/`APP_ENV`
  variables and `DB_URL`, and explicitly pass `--env=testing` or `--env=playwright`.
- **Missing application key:** generate a local key for that exact environment; production keys
  are deployment secrets. Never copy a production key into tests.
- **One worker only:** use `--no-reload` and a supported non-Windows PHP runtime; inspect processes.
- **Permission denied:** fix ownership of runtime storage/cache directories for the PHP account.
- **CORS missing:** verify the exact origin, `api/*` path and `config:show cors`, then clear cached
  config and restart. JSON 404 on an API request is expected until the author adds routes.

Milestone evidence: [v1.8.1 acceptance criteria](../../../versions/v1.8.1/acceptance-criteria.md).
