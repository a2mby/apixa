# Laravel launchers

Run the standalone Laravel playground at
[`examples/backends/laravel-backend`](../../examples/backends/laravel-backend/) directly from the
repository root.

| Platform | Command                                  |
| -------- | ---------------------------------------- |
| macOS    | `./scripts/laravel/macos/run-laravel.sh` |
| Linux    | `./scripts/laravel/linux/run-laravel.sh` |
| Windows  | `scripts\laravel\win\run-laravel.bat`    |

The launcher checks PHP, installs Composer dependencies when `vendor/` is missing, creates `.env`
from `.env.example` and generates an app key when `.env` is absent, then runs:

```bash
php artisan serve --host=127.0.0.1 --port=8000 --no-reload
```

Options:

| Variable or flag | Default     | Purpose                              |
| ---------------- | ----------- | ------------------------------------ |
| `LARAVEL_HOST`   | `127.0.0.1` | Listener host                        |
| `LARAVEL_PORT`   | `8000`      | Listener port                        |
| `LARAVEL_ENV`    | unset       | Laravel environment (`--env=<name>`) |
| `--env=<name>`   | unset       | Same as `LARAVEL_ENV`                |

Examples:

```bash
LARAVEL_PORT=8010 ./scripts/laravel/macos/run-laravel.sh
./scripts/laravel/linux/run-laravel.sh --env=testing
```

The launcher does not create databases, run migrations, seed data, or start queue workers. Follow
the [backend setup guide](../../examples/backends/laravel-backend/README.md) for PostgreSQL,
MongoDB, migrations and seeding. `Ctrl-C` stops the development server.
