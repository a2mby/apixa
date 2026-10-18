# Conventions

Shared rules for building Apixa Core, writing docs, and shipping version milestones.

## Tooling

- Package manager: **pnpm** (workspace at repo root).
- Language: **TypeScript**, strict mode.
- Node: `>=18`.
- Build Core with the existing package scripts (`build`, `typecheck`); do not introduce a second toolchain without a decision.

## Core API design

- Prefer **native `Promise<T>`** over custom Promise wrappers.
- Prefer **clear operation names** (`update`) over ambiguous ones (`appendUser`).
- **Custom endpoints win** over generated conventions.
- Do **not** silently invent backend endpoints. Generated operations must be configurable / opt-in.
- Do **not** add React, Next.js, or TanStack Query as Core dependencies.
- Do **not** build caching or state management into Core.
- Do **not** couple mocking to production request execution.
- Do **not** expose server-only secrets to browser code.
- Do **not** add abstractions only because they might be useful later.

## Types

- Infer types from definitions where possible.
- Do not duplicate types unnecessarily.
- Keep the public export surface small and honest.

## Documentation honesty

- Mark features as **implemented** vs **planned**.
- Living docs live under [`docs/`](./):
  - [context.md](./context.md) — project direction
  - [architecture.md](./architecture.md) — structure and request flow
  - [roadmap.md](./roadmap.md) — phases
  - [decisions/](./decisions/) — ADRs
- Milestone specs live under [`versions/`](../versions/). A version folder freezes intent for that release. Do not invent empty future version folders; add them when that milestone starts.

## Version folders

Each active or completed milestone under `versions/vX.Y.Z/` should include:

| File                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `context.md`             | Frozen subset of project context for that release        |
| `scope.md`               | In / out for the milestone                               |
| `implementation-plan.md` | Ordered smallest-path plan                               |
| `acceptance-criteria.md` | Checklist that must pass before calling the version done |

See [versions/README.md](../versions/README.md).

## Coding against a version

1. Read `docs/context.md` for principles.
2. Read `versions/<current>/` for the coding contract.
3. Preserve working setup; reshape existing Core files before adding packages.
4. Update `docs/story.md` when a meaningful milestone lands.
5. Update living docs when direction changes; do not rewrite frozen version folders after the version ships unless correcting factual errors.

## Cursor agent workflow

Use these so the structure does not drift:

| Command              | When                                       |
| -------------------- | ------------------------------------------ |
| `/plan-change`       | Open issue + `task/N-slug` branch          |
| `/implement-version` | Code against the active `versions/vX.Y.Z/` |
| `/start-version`     | Create the next filled version folder      |
| `/check-structure`   | Audit docs/versions/packages layout        |
| `/git-push`          | Commit, PR, squash merge, story log        |

Rules live in `.cursor/rules/apixa-*.mdc`. Skill: `.cursor/skills/apixa-workflow/`.

## Examples and tests

- `examples/basic` should demonstrate **implemented** API, not aspirational syntax.
- Tests for Core live under root `tests/` (see [tests/README.md](../tests/README.md)).
- Prefer testing behavior (URL building, success/error paths, generation) over testing implementation details.
