# Apixa agent instructions

Generated from `.cursor/rules/*.mdc` by `scripts/sync-agent-rules.sh`. Edit the .mdc files, then re-run. Slash commands live in `.cursor/commands/` (symlinked to `.claude/commands`); the skill is in `.cursor/skills/`.

---

<!-- source: .cursor/rules/apixa-core.mdc -->

# Apixa — always follow this

## Before coding

1. Read `docs/context.md` (principles). Do not recap it in chat.
2. Read the **active** milestone under `versions/` (see `versions/README.md`; none open after v0.7.0).
3. Implement against that folder’s `scope.md`, `implementation-plan.md`, and `acceptance-criteria.md`.

## Structure (do not invent a different layout)

```text
docs/           # living: context, architecture, roadmap, conventions, decisions/, story
versions/       # frozen milestones only — never empty future stubs
packages/core/  # only package until a version scope says otherwise
examples/next/  # only maintained example; do not edit other examples/*
tests/
```

- Living context stays at `docs/context.md` — **not** a duplicate root `context.md`.
- Do **not** create future version folders until that milestone starts (use `/start-version`).
- Do **not** create `transport-fetch`, `client`, `server`, `mocking`, `tanstack-query`, or `openapi` packages unless the **active** version scope says so.

## Core non-negotiables

- No React, Next.js, or TanStack Query in `@apixa/core`.
- Native `Promise<T>` — no custom Promise wrappers.
- Custom endpoints beat conventions; do not silently invent backend ops.
- Fetch stays **inside** Core until ADR/version says otherwise.
- Do not couple mocking to production request execution.
- Mark docs as implemented vs planned. Examples show **implemented** API only.

## When direction or a milestone changes

- Update living docs under `docs/` when principles/architecture change.
- Append to `docs/story.md` (newest first); do not rewrite old entries.
- After a version ships, do not rewrite its frozen folder except factual fixes.
- New milestone → create `versions/vX.Y.Z/` with all four files (use `/start-version`).

---

<!-- source: .cursor/rules/apixa-docs.mdc -->

# Docs and versions

## Living docs (`docs/`)

| File                 | Role                                                         |
| -------------------- | ------------------------------------------------------------ |
| `context.md`         | Identity, principles, constraints                            |
| `architecture.md`    | Core shape, request flow, source map                         |
| `roadmap.md`         | Phases; later versions as headings only                      |
| `conventions.md`     | How we build and document                                    |
| `story.md`           | Dated log, newest first                                      |
| `decisions/NNN-*.md` | ADRs (Context / Decision / Consequences)                     |
| `guides/`            | Short how-tos — `humans/` (prose) and `agents/` (checklists) |

Do not move living context to the repo root.

### Guides (`docs/guides/`)

- Task-oriented only — not a second `context.md` or architecture dump.
- Put human-facing prose under `guides/humans/`; agent checklists and Cursor command pointers under `guides/agents/`.
- Keep both indexes (`guides/README.md`, folder READMEs) updated when you add a guide.
- Prefer linking to package READMEs / source for long code samples instead of duplicating them.

## Version folders (`versions/vX.Y.Z/`)

Required files — all four, filled (no empty stubs):

1. `context.md` — frozen subset for that release
2. `scope.md` — explicit in / out
3. `implementation-plan.md` — ordered smallest path
4. `acceptance-criteria.md` — checklist that gates “done”

Also keep `versions/README.md` pointing at the **active** version.

## Honesty

- Planned ≠ implemented.
- Do not invent future version folders “for later.”
- Roadmap bullets are enough until the milestone starts.

---

<!-- source: .cursor/rules/apixa-examples.mdc -->

# Examples — Next only

The maintained playground is **`examples/next`**. Do not create, edit, delete, or “sync” other example apps unless the user explicitly names that framework.

## Allowed

- `examples/next/**` (and its README when documenting Next usage)
- Root docs / README that _mention_ examples in general

## Do not touch

- `examples/basic`
- `examples/react-vite`
- `examples/vue`
- `examples/vanilla`
- `examples/angular`
- `examples/react-native`
- Any new `examples/<framework>/` folder

```text
# ❌ BAD — drive-by updates across playgrounds
examples/vue/src/api.ts
examples/react-vite/src/api.ts

# ✅ GOOD — Next only
examples/next/lib/api.ts
examples/next/components/...
```

If an API change needs a usage sample and Next is not enough, update Core tests / README first. Only open another example when the user asks for that example by name.

---

<!-- source: .cursor/rules/apixa-git-push-format.mdc -->

# Format before `/git-push`

Before committing on a `/git-push` (after rebase onto latest `main`, before `git add` / `git commit`):

1. From the repo root, run `npm run format` (Prettier write over the whole tree).
2. Stage Touches-list files **and** any other files that Prettier changed.
3. Do **not** stop for Touches violations when the only extra diffs are formatting. Those are allowed.
4. Still stop for real (non-format) edits outside the issue Touches list — do not sneak in logic changes via format.

```bash
npm run format
git add <touches> <prettier-touched-files>
```

Do not skip format because “nothing looks dirty” — run it every `/git-push`.

---

<!-- source: .cursor/rules/apixa-packages.mdc -->

# Core and examples

## Prefer reshape over new packages

Reuse folders under `packages/core/src/` (`api/`, `operation/`, `request/`, `http/`, `transport/`, `errors/`, `types/`). Do not add workspace packages without an active version scope item.

## Public API

- Prefer `defineApi` as the documented entry; v0.2.0 default-first resources are the active DX.
- Keep `index.ts` exports small: define API, types, errors, Fetch/transport.
- Unexport or remove production `mocks`, auth product surface, and logging middleware unless the active scope includes them.

## Types and ops

- Infer types from definitions.
- Default-first builtins; optional `operations` merges overrides. Custom names coexist.
- Custom operation with the same name wins over a convention.

## Examples and tests

- Only maintain **`examples/next`** (see `apixa-examples` rule). Do not edit other `examples/*`.
- Tests under root `tests/` (e.g. `tests/core/`); use injectable/fake `Transport`.
- No flaky live-network as the primary suite.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
