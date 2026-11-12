# Apixa — external agent context

Paste this file into an external agent (ChatGPT, Claude, another CLI) **before** asking it to plan
a change. It is only a bootstrap: the repository's canonical instructions are
[`AGENTS.md`](../AGENTS.md), the shared rules under [`.ai/rules/`](../.ai/rules/), and the active
milestone under [`versions/`](../versions/README.md). Do not treat this file as a second
specification.

You are helping on **Apixa** (`https://github.com/a2mby/apixa`). Do not write feature code unless
the human explicitly asks to implement. Prefer opening a GitHub issue and a `task/N-slug` branch.

## What Apixa is

TypeScript-first library: define an API once → generate a fully typed client. One published npm
package (`apixa`, ESM, Node.js 22+). Core, Mocking, React and shared helpers are private workspace
modules. Fetch stays inside Core; Core never imports React, TanStack Query or Node built-ins.
Mocking is an explicit, client-scoped branch of the same request pipeline.

## Read before planning

1. [`AGENTS.md`](../AGENTS.md) — non-negotiables and conditional rules.
2. [`docs/context.md`](./context.md) — principles (do not recap them back to the human).
3. [`versions/README.md`](../versions/README.md) — the active milestone; then read its four files.
4. [`docs/conventions.md`](./conventions.md), [`docs/public-api.md`](./public-api.md) when the
   change touches public surface.
5. [`docs/use-cases.md`](./use-cases.md) when the change needs manual-test impact.

If the repository and this file disagree, the repository wins; say so and update this file.

## Hard constraints

- No React, Next.js or TanStack Query in `@apixa/core`; no custom Promise wrappers.
- Custom endpoints beat conventions; never invent backend operations.
- Mocking never falls back to the network; docs must distinguish implemented from planned.
- Do not create `packages/transport-fetch|client|server|vue|angular|openapi` or empty
  `versions/vX.Y.Z/` folders without an approved milestone.
- Examples: only `examples/frontends/query-ssr-next` (maintained) and the local, untracked `examples/frontends/next`
  may be edited unless the human names another example.
- Only `apixa` is published; `@apixa/*` names never appear in public imports.

## Planning template

Use the same issue body as the `plan-change` skill
([`.agents/skills/plan-change/SKILL.md`](../.agents/skills/plan-change/SKILL.md)):

```markdown
Asked for: <the human's brief, unchanged>

Active version: vX.Y.Z

<one or two sentences on the problem>

<one or two sentences on the outcome>

Touches:

- path/to/file

Tests:

- tests/core/<name>.test.ts — <behavior covered>
```

Functional changes must list concrete tests; docs/process-only changes say
`Tests: none (no functional change)`. Stop if the request is Out of scope for the active milestone.
Reply with the issue URL, branch name, active version, Touches and Tests, then wait unless the human
also asked to implement.

## Human brief

After this file, the human's next message is the change brief.
