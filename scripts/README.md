# Scripts

Platform helpers for the frontend playgrounds and the standalone Laravel backend. Examples use
`@apixa/mocking` (local JSON datasets) — no separate API server is needed for the frontends.

## Layout

```text
scripts/
  macos/   linux/   win/   one launcher per example and platform (run-frontend-*, run-laravel)
  shared/               the implementation every platform launcher calls (run-frontend, run-laravel)
  lib/                  JavaScript helpers imported by the verification scripts
  datasets/             dataset collection builder (`pnpm datasets:build`)
  *.mjs                 build, verification, measurement and spike tools, run through `package.json`
```

Platform folders hold only thin wrappers; change behavior in `shared/`.

## Backends

The Laravel environment runs directly through Artisan. The launcher checks PHP, installs Composer
dependencies when `vendor/` is missing, creates `.env` from `.env.example` and generates an app key when
`.env` is absent, then runs `php artisan serve --host=127.0.0.1 --port=8000 --no-reload`.

| Platform | Command                          |
| -------- | -------------------------------- |
| macOS    | `./scripts/macos/run-laravel.sh` |
| Linux    | `./scripts/linux/run-laravel.sh` |
| Windows  | `scripts\win\run-laravel.bat`    |

| Variable or flag | Default     | Purpose                              |
| ---------------- | ----------- | ------------------------------------ |
| `LARAVEL_HOST`   | `127.0.0.1` | Listener host                        |
| `LARAVEL_PORT`   | `8000`      | Listener port                        |
| `LARAVEL_ENV`    | unset       | Laravel environment (`--env=<name>`) |
| `--env=<name>`   | unset       | Same as `LARAVEL_ENV`                |

```bash
LARAVEL_PORT=8010 ./scripts/macos/run-laravel.sh
./scripts/linux/run-laravel.sh --env=testing
```

The launcher does not create databases, run migrations, seed data, or start queue workers. See the
[backend setup guide](../examples/backends/laravel-backend/README.md) for PostgreSQL, MongoDB, migrations
and seeding. `Ctrl-C` stops the development server.

## Frontends

Each script builds `@apixa/core` (and `@apixa/mocking` when needed), then starts that example.

| Example                        | macOS                                          | Linux                                          | Windows                                     | URL / notes           |
| ------------------------------ | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------- | --------------------- |
| **Next.js** (local playground) | `./scripts/macos/run-frontend-next.sh`         | `./scripts/linux/run-frontend-next.sh`         | `scripts\win\run-frontend-next.bat`         | http://localhost:3000 |
| React + Vite                   | `./scripts/macos/run-frontend-react.sh`        | `./scripts/linux/run-frontend-react.sh`        | `scripts\win\run-frontend-react.bat`        | http://localhost:5173 |
| Vue                            | `./scripts/macos/run-frontend-vue.sh`          | `./scripts/linux/run-frontend-vue.sh`          | `scripts\win\run-frontend-vue.bat`          | http://localhost:5174 |
| Vanilla                        | `./scripts/macos/run-frontend-vanilla.sh`      | `./scripts/linux/run-frontend-vanilla.sh`      | `scripts\win\run-frontend-vanilla.bat`      | http://localhost:5175 |
| Angular                        | `./scripts/macos/run-frontend-angular.sh`      | `./scripts/linux/run-frontend-angular.sh`      | `scripts\win\run-frontend-angular.bat`      | http://localhost:4200 |
| React Native                   | `./scripts/macos/run-frontend-react-native.sh` | `./scripts/linux/run-frontend-react-native.sh` | `scripts\win\run-frontend-react-native.bat` | Expo DevTools         |
| Node CLI (`basic`)             | `./scripts/macos/run-frontend-basic.sh`        | `./scripts/linux/run-frontend-basic.sh`        | `scripts\win\run-frontend-basic.bat`        | stdout                |

Shared implementation: [`shared/run-frontend.sh`](./shared/run-frontend.sh) / [`shared/run-frontend.bat`](./shared/run-frontend.bat).

These launchers target the local playground apps under `examples/frontends/`. The maintained,
verification-driven Next.js App Router example is
[`examples/frontends/query-ssr-next`](../examples/frontends/query-ssr-next/); start it with
`pnpm --filter @apixa/example-query-ssr-next dev` (see its README) and prefer it for scenarios that
must stay maintained.

On macOS/Linux, make scripts executable once:

```bash
chmod +x scripts/macos/*.sh scripts/linux/*.sh scripts/shared/*.sh
```

pnpm aliases (any platform): `pnpm example:next`, `example:react`, `example:vue`, `example:vanilla`, `example:angular`, `example:react-native`, `example`.
