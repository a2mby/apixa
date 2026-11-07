# Contributing to Apixa

First off, thank you for considering contributing to Apixa! 🚀

Apixa is an open-source, TypeScript-first library built around a simple principle:

**Define your API once. Use it everywhere.**

We welcome bug reports, improvements, documentation updates, tests, and new ideas.

This guide explains how to set up the project, understand its architecture, and contribute changes.

## 1. Getting Started

### Prerequisites

Before contributing, make sure you have:

- **Node.js** 18 or newer
- **pnpm** 9.15.0 (managed through Corepack)
- **Git**
- A code editor with TypeScript support

Optional:

- Python 3.10+ and Graphify for local knowledge-graph exploration
- Claude Code, Codex, or Cursor for AI-assisted development

### Fork and Clone

Fork [Apixa](https://github.com/a2mby/apixa) on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/apixa.git
cd apixa
```

Add the original repository as an upstream remote:

```bash
git remote add upstream https://github.com/a2mby/apixa.git
```

### Install Dependencies

Enable Corepack and install workspace dependencies:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

### Build the Project

```bash
corepack pnpm build
```

This builds the Core, Mocking, and TanStack Query packages in dependency order.

## 2. Project Architecture

Apixa is organized as a pnpm monorepo. Only the root `apixa` package is published.
Core, Mocking, React and shared helpers are private implementation modules; their package names
are source boundaries, not consumer installation dependencies. See [ADR 005](docs/decisions/005-single-package-distribution.md).

```text
apixa/
├── packages/
│   ├── core/
│   ├── mocking/
│   ├── react/
│   └── internal/shared/   # private, never published
├── datasets/
├── examples/
├── tests/
├── docs/
├── versions/
├── scripts/
├── README.md
└── CONTRIBUTING.md
```

### Core — `@apixa/core`

The foundation of Apixa.

Responsible for:

- API and resource definitions
- Type inference
- Built-in and custom operations
- HTTP execution
- Middleware and transformations
- Retry, cancellation, and error handling
- Core's client-scoped mock execution engine

**Architecture rule:** Core must remain framework-agnostic. Never introduce React, Next.js, or TanStack Query as Core dependencies.

### Mocking — `@apixa/mocking`

Provides:

- Standalone mock APIs
- Built-in datasets and dataset loading
- Integration with Core's mock engine
- Local, isolated mock data

Mock operations must never silently fall back to a real backend.

### React — `@apixa/react`

Provides the optional React integration for Apixa resources. TanStack Query is the engine inside it,
not its public name.

The architecture separates:

- `useResourceQuery` for reads
- `useResourceMutation` for writes
- `useResource` as a combined facade
- `ApixaProvider`, `QueryClient`, `ApixaHydrationBoundary` for setup and server rendering

Core must work independently of this package.

### Important Architecture Principles

When contributing, preserve these principles:

1. Prefer type inference over duplicated type declarations.
2. Keep resource operations independent.
3. Preserve native `Promise<T>` behavior in Core.
4. Keep optional integrations outside Core.
5. Preserve existing public APIs unless a breaking change is explicitly approved.
6. Require appropriate read/write classification for custom operations.
7. Keep mocking isolated from real network execution.
8. Avoid unnecessary dependencies and abstractions.
9. Do not assume generated routes exist on the user's backend.

Read [Architecture](docs/architecture.md) and [Conventions](docs/conventions.md) before making substantial architectural changes.

## 3. Development Workflow

### Run Tests

```bash
corepack pnpm test
```

Tests use Vitest and live primarily under `tests/`.

Contributions affecting functionality should include appropriate test coverage.

### Typecheck

```bash
corepack pnpm typecheck
```

TypeScript correctness is essential to Apixa's public API.

Changes involving API definitions, operations, hooks, or inference should include compile-time coverage where applicable.

### Formatting

Apixa uses Prettier.

To format the repository:

```bash
corepack pnpm format
```

To check formatting without modifying files:

```bash
corepack pnpm exec prettier --check .
```

Inspect changes after running repository-wide formatting to avoid unintentionally including unrelated edits.

### Run Examples

The primary Next.js playground can be started with:

```bash
corepack pnpm example:next
```

Other platform examples and their scripts are documented in [scripts/README.md](scripts/README.md).

Keep examples aligned with implemented behavior rather than proposed or unfinished APIs.

## 4. Graphify — Knowledge Graph Setup

Apixa supports [Graphify](https://github.com/Graphify-Labs/graphify) to make the codebase easier to explore.

Graphify generates a local knowledge graph that can help contributors and AI coding assistants understand code relationships, dependencies, and architecture.

**Graphify is optional.** It is not required to build, test, or contribute to Apixa.

### Install Graphify

Graphify requires Python 3.10 or newer.

The recommended installation uses `uv`:

```bash
uv tool install graphifyy
```

The PyPI package is called `graphifyy`, while the executable command is `graphify`.

### Configure Your AI Assistant

To register the Graphify skill:

```bash
graphify install
```

Alternatively, configure a specific assistant:

```bash
graphify claude install
```

Or:

```bash
graphify codex install
```

### Generate the Knowledge Graph

From the repository root, run:

```bash
graphify extract . --code-only
```

This performs local code extraction without model calls.

For a richer Graphify workflow, open a supported AI coding assistant and run:

```text
/graphify .
```

The generated output is stored under:

```text
graphify-out/
├── graph.json
├── graph.html
├── GRAPH_REPORT.md
└── ...
```

### Explore the Graph

Example commands:

```bash
graphify query "How are resource operations resolved?"
```

```bash
graphify explain "defineApi"
```

```bash
graphify path "Resource" "Transport"
```

### Update the Graph

After significant code changes:

```bash
graphify update .
```

The generated `graphify-out/` directory is intended to remain local and is excluded from version control.

Each developer can generate their own graph.

See the [official Graphify documentation](https://graphiffy.com/docs) for more information.

## 5. Coding Guidelines

### TypeScript

- Use strict TypeScript.
- Avoid `any` unless there is a justified reason.
- Preserve accurate type inference.
- Prefer reusable types over duplicated declarations.
- Make configuration errors explicit.
- Ensure runtime behavior and public types agree.

### API and Operations

- Keep all built-in operations independent.
- Preserve configuration precedence.
- Validate invalid configurations.
- Preserve resource-level customization.
- Ensure operation metadata accurately describes execution.
- Never change public operation behavior without tests.

### Mocking

- Keep datasets and stores isolated per client.
- Preserve typed mock data.
- Support custom operations according to the documented mocking contract.
- Never execute a real network request as a fallback for an unsupported mock operation.

### Dependencies

Avoid adding dependencies without a clear justification.

In particular, do not introduce framework-specific dependencies into Core.

## 6. Reporting Bugs

Before opening a bug report:

1. Check existing GitHub issues.
2. Verify the problem against the current code.
3. Prepare a minimal reproduction if possible.
4. Include relevant errors, versions, and environment details.

A useful report explains:

- What happened
- What you expected
- Steps to reproduce
- Relevant code or configuration
- Node.js and package versions

[Open a bug report](https://github.com/a2mby/apixa/issues).

## 7. Proposing Features

Feature requests are welcome.

Before implementing a substantial feature, open a GitHub issue to discuss:

- The problem being solved
- The proposed API or behavior
- Compatibility implications
- Affected packages
- Alternative approaches

Large architectural changes should be discussed before implementation.

Planned features are tracked separately from implemented functionality.

See [the roadmap](docs/roadmap.md).

## 8. Pull Request Workflow

### Create a Branch

Start from an updated main branch:

```bash
git checkout main
git pull upstream main
git checkout -b task/123-short-description
```

Replace `123` with the related issue number. For contributions without a numbered issue, use a descriptive feature or fix branch name.

Avoid making contributions directly on `main`.

### Implement Your Changes

Keep each pull request focused on one issue or closely related group of changes.

Update documentation and tests when the behavior or public API changes.

### Validate Your Changes

Before opening a pull request:

```bash
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm exec prettier --check .
```

### Pull Request Checklist

- [ ] Changes are focused and clearly explained.
- [ ] Existing public behavior remains compatible, or breaking changes are documented.
- [ ] Relevant tests are added or updated.
- [ ] The build passes.
- [ ] Typechecking passes.
- [ ] Tests pass.
- [ ] Formatting is correct.
- [ ] Documentation is updated where necessary.
- [ ] No generated caches, secrets, or unrelated files are included.

### Open a Pull Request

Push your branch to your fork:

```bash
git push -u origin task/123-short-description
```

Then open a pull request targeting Apixa's `main` branch.

In your description, explain:

- **Summary:** What changed?
- **Motivation:** Why was the change needed?
- **Testing:** How was it verified?
- **Breaking changes:** Are migrations necessary?
- **Related issues:** Which issues does it address?

Maintainers may request changes before merging.

## 9. Documentation and Versioning

Apixa maintains separate documentation for ongoing development and version-specific decisions.

- [`docs/context.md`](docs/context.md) — project principles
- [`docs/architecture.md`](docs/architecture.md) — technical architecture
- [`docs/conventions.md`](docs/conventions.md) — development rules
- [`docs/roadmap.md`](docs/roadmap.md) — future direction
- [`versions/`](versions/) — milestone-specific scope and acceptance criteria

Before implementing a milestone feature, consult the active milestone under `versions/`.

Do not introduce unrelated features into a release milestone or create speculative version folders.

Distinguish clearly between implemented, experimental, and planned functionality.

## 10. Licensing

By contributing, you agree that your contributions will be distributed under Apixa's [MIT License](LICENSE).

## 11. Community

We want Apixa to be a welcoming project for contributors of all experience levels.

Please be constructive and respectful when discussing ideas, reporting issues, and reviewing pull requests.

If you're unsure where to begin, explore the [GitHub issues](https://github.com/a2mby/apixa/issues) or propose an improvement.

---

Thank you for helping improve Apixa!

**Define your API once. Use it everywhere.**
