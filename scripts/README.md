# Scripts

Platform helpers for frontend examples. Examples use `@apixa/mocking` (local JSON datasets) — no separate API server to start.

## Frontends

Each script builds `@apixa/core` (and `@apixa/mocking` when needed), then starts that example.

| Example               | macOS                                          | Linux                                          | Windows                                     | URL / notes           |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------- | --------------------- |
| **Next.js** (primary) | `./scripts/macos/run-frontend-next.sh`         | `./scripts/linux/run-frontend-next.sh`         | `scripts\win\run-frontend-next.bat`         | http://localhost:3000 |
| React + Vite          | `./scripts/macos/run-frontend-react.sh`        | `./scripts/linux/run-frontend-react.sh`        | `scripts\win\run-frontend-react.bat`        | http://localhost:5173 |
| Vue                   | `./scripts/macos/run-frontend-vue.sh`          | `./scripts/linux/run-frontend-vue.sh`          | `scripts\win\run-frontend-vue.bat`          | http://localhost:5174 |
| Vanilla               | `./scripts/macos/run-frontend-vanilla.sh`      | `./scripts/linux/run-frontend-vanilla.sh`      | `scripts\win\run-frontend-vanilla.bat`      | http://localhost:5175 |
| Angular               | `./scripts/macos/run-frontend-angular.sh`      | `./scripts/linux/run-frontend-angular.sh`      | `scripts\win\run-frontend-angular.bat`      | http://localhost:4200 |
| React Native          | `./scripts/macos/run-frontend-react-native.sh` | `./scripts/linux/run-frontend-react-native.sh` | `scripts\win\run-frontend-react-native.bat` | Expo DevTools         |
| Node CLI (`basic`)    | `./scripts/macos/run-frontend-basic.sh`        | `./scripts/linux/run-frontend-basic.sh`        | `scripts\win\run-frontend-basic.bat`        | stdout                |

Shared implementation: [`lib/run-frontend.sh`](./lib/run-frontend.sh) / [`lib/run-frontend.bat`](./lib/run-frontend.bat).

On macOS/Linux, make scripts executable once:

```bash
chmod +x scripts/macos/*.sh scripts/linux/*.sh scripts/lib/*.sh
```

pnpm aliases (any platform): `pnpm example:next`, `example:react`, `example:vue`, `example:vanilla`, `example:angular`, `example:react-native`, `example`.
