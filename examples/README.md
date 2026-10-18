# Examples

Playgrounds that consume **implemented** `@apixa/core`. The maintained happy path uses `@apixa/mocking` and local [`datasets/`](../datasets/) — no live API server required.

## Prerequisites

```bash
pnpm install
pnpm --filter @apixa/core build
pnpm --filter @apixa/mocking build
```

## Frontends

| Example | Focus | Platform script (macOS) | URL |
| --- | --- | --- | --- |
| **[next](./next/)** | **Primary** — App Router + mock transport | `./scripts/macos/run-frontend-next.sh` | http://localhost:3000 |
| [react-vite](./react-vite/) | React + Vite SPA | `./scripts/macos/run-frontend-react.sh` | http://localhost:5173 |
| [vue](./vue/) | Vue 3 + Vite | `./scripts/macos/run-frontend-vue.sh` | http://localhost:5174 |
| [vanilla](./vanilla/) | No UI framework (Vite + DOM) | `./scripts/macos/run-frontend-vanilla.sh` | http://localhost:5175 |
| [angular](./angular/) | Angular standalone | `./scripts/macos/run-frontend-angular.sh` | http://localhost:4200 |
| [react-native](./react-native/) | Expo / React Native | `./scripts/macos/run-frontend-react-native.sh` | Expo DevTools |
| [basic](./basic/) | Node CLI smoke test (mock transport) | `./scripts/macos/run-frontend-basic.sh` | stdout |

Linux: `./scripts/linux/run-frontend-<name>.sh`  
Windows: `scripts\win\run-frontend-<name>.bat`  
Full table: [`scripts/README.md`](../scripts/README.md)

pnpm aliases: `pnpm example:next`, `example:react`, `example:vue`, `example:vanilla`, `example:angular`, `example:react-native`, `example`.

Start with **Next.js** — it shows list + create/update/delete on a typed client backed by `@apixa/mocking`.

Core stays framework-agnostic. These apps import `@apixa/core` (and mocking where wired); they do not add React/Next/etc. into the library.
