# Apixa — external agent context

Paste this whole file into ChatGPT / Claude / other external agents **before** asking them to plan a change (same job as Cursor `/plan-change`). Keep it updated when the active version or shipped surface changes.

You are helping on **Apixa** (`https://github.com/a2mby/apixa`). Do **not** write feature code unless the human explicitly asks to implement. Prefer opening a GitHub issue + task branch (see **How to /plan-change** below).

---

## What Apixa is

TypeScript-first library: define an API once → generate a fully typed client.

- Packages today: `@apixa/core`, `@apixa/mocking` (local datasets + mock `Transport`)
- Tagline: Define your API once. Use it everywhere.
- Tooling: pnpm monorepo, TypeScript, native `Promise<T>`
- Fetch transport lives **inside** Core until an ADR/version says otherwise
- Mocking is injected via `transport` — never a Core `mocks` product API
- Not a UI framework, not a server router, not merely a Fetch wrapper

```ts
import { defineApi } from "@apixa/core";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: { path: "/users"; entity: User };
};

const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json" },
  users: { path: "/users" },
});

await api.users.getAll(); // Promise<User[]>
await api.users.create({ name: "Ada", email: "ada@example.com" }); // Omit<User,"id">
```

Default-first CRUD on path resources: `getAll`, `getByID`, `create`, `update`, `delete` (positional args). Optional runtime `operations` for overrides and custom endpoints. Typing: resource-only `defineApi<T>()(config)` with `path` + `entity`; create/update derived — **not** `type()`.

---

## Where we are

Confirm against the repo (do not invent versions):

| Version    | Status                                               |
| ---------- | ---------------------------------------------------- |
| v0.1.0     | Shipped — opt-in operations foundation               |
| v0.2.0     | Shipped — default-first resource CRUD                |
| v0.3.0     | Shipped — `type<T>()` markers (removed in v0.4.0)    |
| v0.4.0     | Shipped — entity-only `defineApi<T>()` state typing  |
| **v0.5.0** | **Active** — Simple Mocking + remove FastAPI backend |

Pointer of truth: [`versions/README.md`](../versions/README.md) → **Current** folder.

**v0.5.0 goal:** local `datasets/` + `@apixa/mocking` (`loadDataset`, `listDatasets`, `createMockTransport`); remove `backend/`; no website / hosted catalog.

**Documented follow-ups:** online dataset catalog (planned), `crud<>()` preset, path-param inference, reliability (abort/retries/middleware).

Do **not** create empty future `versions/` stubs.

---

## Read before planning (in the repo)

1. [`docs/context.md`](./context.md) — principles / constraints
2. Active milestone under `versions/vX.Y.Z/` — `scope.md`, `implementation-plan.md`, `acceptance-criteria.md`
3. Optionally: [`architecture.md`](./architecture.md), [`roadmap.md`](./roadmap.md), [`story.md`](./story.md) (newest first)

Do **not** recap the whole project back to the human.

---

## Repo layout (do not invent a different one)

```text
docs/                 # living context, architecture, roadmap, story, ADRs, this file
versions/             # frozen milestones only — no empty future stubs
packages/core/        # definitions + live HTTP
packages/mocking/     # local datasets + mock Transport (v0.5.0)
datasets/             # version-controlled JSON fixtures
examples/next/        # ONLY maintained example — do not edit other examples/*
tests/                # Vitest suite; injectable / fake Transport
```

---

## Hard constraints

- No React, Next.js, or TanStack Query in `@apixa/core`
- No custom Promise wrappers
- Custom endpoints beat conventions; do not silently invent backend ops
- Fetch stays in Core until ADR/version says otherwise
- Do not couple mocking to production request execution
- Planned ≠ implemented; keep docs honest
- Do not add packages (`transport-fetch`, `client`, `server`, `tanstack-query`, `openapi`) unless **active** scope says so (`mocking` exists as of v0.5.0)
- Do not rewrite frozen `versions/v0.1.0/` or `v0.2.0/` for new features
- Examples: **Next only** (`examples/next/**`)

---

## How to /plan-change

When the human gives a brief (or says `/plan-change <brief>`):

1. Stop if the brief is empty — ask what the change is.
2. Read active version scope. If the ask is **Out of scope**, say so in the issue body and in chat; do not pretend it is in scope.
3. If the brief is “implement the version” / whole active milestone, still open the issue, then prefer `/implement-version` for the coding work.
4. Open a GitHub issue on `a2mby/apixa`, label `task`. Title = outcome (e.g. “Add defineApi resource generation”), not “Working on core”.
5. Issue body, in this order:

```markdown
Asked for: <their brief, unchanged>

Active version: vX.Y.Z

<One or two sentences on the problem.>

<One or two sentences on the outcome.>

Touches:

- path/to/file

Tests:

- tests/core/<name>.test.ts — <what behavior this covers>
```

6. Functional changes **must** list concrete tests (fake Transport; no live network as the primary suite). Prefer many small cases. Docs/process-only → `Tests: none (no functional change)`.
7. Branch from latest `main` only: `task/N-slug` (N = issue number, slug short/hyphenated). Never stack a second change on an existing `task/…` for the same brief. If already on another task branch, still open the issue, then create the new branch from `main`.
8. Reply with: issue URL, branch name, active version, Touches, Tests. **Then wait** — do not implement unless the human also asked to implement now.

```bash
gh issue create --repo a2mby/apixa --title "…" --label "task" --body "$(cat <<'EOF'
…
EOF
)"

git fetch origin
git switch main
git pull --ff-only origin main
git switch -c task/N-slug
```

---

## Commands map (Cursor)

| Intent                     | Command                |
| -------------------------- | ---------------------- |
| Open issue + task branch   | `/plan-change <brief>` |
| Implement active milestone | `/implement-version`   |
| Start new milestone folder | `/start-version`       |
| Audit layout               | `/check-structure`     |

---

## Human brief (append when pasting)

After this file, the human’s next message is the change brief:

```text
Asked for: <paste brief here>
```
