# Examples and playgrounds

Examples are grouped by role:

```text
examples/
  backends/     # server environments you can run directly
  frontends/    # client apps used to exercise Apixa in a browser or Node
  templates/    # empty starter placeholders (laravel, next, react)
```

Start with the maintained **[Next.js example](frontends/query-ssr-next/README.md)** to exercise
Apixa in a frontend, or the independent **[Laravel backend](backends/laravel-backend/README.md)** to
explore real databases and prepare your own HTTP APIs.

## Maintained environments

| Environment                                              | Purpose                                                                                                                                                                       | Start command                                                                                 | Local address            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| [frontends/query-ssr-next](frontends/query-ssr-next/README.md) | Tracked Next.js App Router consumer: queries, mutations, optimistic updates, SSR/hydration, infinite queries and the `/files` transfer scenarios. Exercised by `pnpm verify`. | From the repository root: `pnpm --filter @apixa/example-query-ssr-next dev`                   | http://localhost:3010    |
| [backends/laravel-backend](backends/laravel-backend/README.md) | Independent Laravel 13 backend with PostgreSQL relational/JSONB data, MongoDB documents, Eloquent models, JSON fixtures and guarded seeders.                                  | `./scripts/macos/run-laravel.sh` (or the matching platform launcher)                  | http://127.0.0.1:8000/up |

The Next example supplies its own mock/controlled data and does **not** require Laravel. The Laravel
backend has no Apixa SDK integration. It serves a standalone
[Product Management API](backends/laravel-backend/docs/PRODUCT_API.md) over HTTP; the other datasets can be explored
through Tinker. Further endpoints are author-owned routes/controllers.

## Frontend setup

Use a supported Node.js runtime (22 or 24) and pnpm. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @apixa/example-query-ssr-next dev
```

Visit http://localhost:3010 and http://localhost:3010/files. See the
[example README](frontends/query-ssr-next/README.md) for its SSR, file, resumable-transfer and
production-build scenarios.

Workspace examples resolve private implementation modules locally. External applications install the
single published `apixa` package and use its public import paths.

## Backend setup and datasets

Laravel uses Composer independently of the pnpm workspace. It needs PHP 8.4+, the PostgreSQL and
MongoDB PHP extensions, Composer, native PostgreSQL and native MongoDB. It has no npm manifest or
Node dependency.

- [Backend setup](backends/laravel-backend/README.md): PHP/runtime selection, native services,
  private environments, CORS, filesystem and multi-worker server configuration.
- [Playground datasets](backends/laravel-backend/database/fixtures/README.md): relational
  schema/models, JSONB queries, MongoDB collections, JSON sources, private file fixtures,
  migrations, repeatable seeding and optional scale profiles. Follow these current data-setup
  commands after provisioning the services.
- Development, backend-test and E2E configurations select separate databases on both engines.
  Seeders refuse production/unrelated databases; reseeding restores known fixture IDs without
  truncating tables or removing unrelated records.

After provisioning and seeding, explore the development data:

```bash
cd examples/backends/laravel-backend
# Select this runtime on the verified Homebrew macOS setup:
export PATH="/opt/homebrew/opt/php@8.4/bin:/opt/homebrew/opt/php@8.4/sbin:$PATH"
php artisan tinker
```

For example, inspect `App\Models\Article::with('comments.contact')->first()` or
`App\Models\Mongo\MongoArticle::first()`. Use the dataset guide for complete commands and isolated
test/E2E preparation. Scenario JSON describes future test behavior; it does not create HTTP
endpoints.

Stop an Artisan development server with **Ctrl-C**. Keep database services running if another
project uses them. Production requires a proper PHP serving stack; the CLI server is for local
development.

## Local frontend playgrounds

The following apps are local and untracked. They exist to test frontend behavior directly and are
not maintained or verified by the current examples workflow:

- `frontends/next` — local Next.js playground, separate from the tracked `query-ssr-next`.
- `frontends/react-vite`, `frontends/vue`, `frontends/vanilla`, `frontends/angular`,
  `frontends/react-native` — older framework playgrounds.
- `frontends/basic` — Node CLI consumer.

Their presence does not establish a supported Apixa framework integration. Use the maintained Next
example for current behavior.

## Templates

`examples/templates/laravel`, `examples/templates/next` and `examples/templates/react` are empty,
tracked placeholders. They reserve the intended starter-template layout; they contain no
application code and are not runnable. Do not put generated starters or secrets there without an
approved milestone.

Historical platform launch scripts and aliases are listed in [scripts/README.md](../scripts/README.md);
the direct commands above are the starting points for the maintained environments.
