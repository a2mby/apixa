# Scripts

Platform helpers for the frontend playgrounds and the standalone Laravel backend. Examples use
`@apixa/mocking` (local JSON datasets) — no separate API server is needed for the frontends.

## Backends

The Laravel environment runs directly through Artisan. Its launcher checks PHP, installs Composer
dependencies when `vendor/` is missing, creates `.env` and an app key when needed, then serves on
`http://127.0.0.1:8000`.

| Platform | Command                                  |
| -------- | ---------------------------------------- |
| macOS    | `./scripts/laravel/macos/run-laravel.sh` |
| Linux    | `./scripts/laravel/linux/run-laravel.sh` |
| Windows  | `scripts\laravel\win\run-laravel.bat`    |

Set `LARAVEL_HOST`, `LARAVEL_PORT` or `LARAVEL_ENV` to override the defaults. See
[`laravel/README.md`](./laravel/README.md) and the
[backend setup guide](../examples/backends/laravel-backend/README.md) for databases, migrations and
seeding. The launcher does not provision or migrate databases.

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

Shared implementation: [`lib/run-frontend.sh`](./lib/run-frontend.sh) / [`lib/run-frontend.bat`](./lib/run-frontend.bat).

These launchers target the local playground apps under `examples/frontends/`. The maintained,
verification-driven Next.js App Router example is
[`examples/frontends/query-ssr-next`](../examples/frontends/query-ssr-next/); start it with
`pnpm --filter @apixa/example-query-ssr-next dev` (see its README) and prefer it for scenarios that
must stay maintained.

On macOS/Linux, make scripts executable once:

```bash
chmod +x scripts/macos/*.sh scripts/linux/*.sh scripts/lib/*.sh scripts/laravel/macos/*.sh scripts/laravel/linux/*.sh scripts/laravel/lib/*.sh
```

pnpm aliases (any platform): `pnpm example:next`, `example:react`, `example:vue`, `example:vanilla`, `example:angular`, `example:react-native`, `example`.
