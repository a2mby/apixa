# Apixa AI configuration

Define shared instructions once, then run `pnpm ai:sync`. This system configures coding agents; it does not configure the Apixa SDK or authorize shipping work.

## Ownership and layout

```text
AGENTS.md                         generated common repository instructions
CLAUDE.md                         generated @AGENTS.md import
GEMINI.md                         generated @AGENTS.md import
.ai/
  config.json                     canonical source locations, adapters, native-file exclusions
  rules/*.md                      canonical engineering policies with activation metadata
  agents/*.md                     canonical architect/implementer/reviewer/tester roles
  adapters/{provider}.mjs          provider discovery contracts and renderers
  adapters/common.mjs              shared adapter rendering helpers
  scripts/sync.mjs                 validation, planning, ownership and synchronization
  generated.json                  generated file hashes and modes; do not hand-edit
  README.md                       this guide and migration/verification record
.agents/skills/{name}/SKILL.md     canonical, real Agent Skills directories
.cursor/rules/*.mdc               generated activation adapters
.cursor/commands/*.md             generated workflow wrappers
.claude/skills/{name}/             generated real copies, including supporting resources
.claude/agents/*.md                generated native subagents (also discovered by Cursor)
.claude/settings.json              native; preserved
.codex/agents/*.toml               generated native standalone agents
.codex/hooks.json                 native; preserved
.gemini/commands/*.toml            generated workflow and same-session role wrappers
.opencode/commands/*.md            generated workflow wrappers
.opencode/agents/*.md              generated native subagents
scripts/sync-agent-rules.sh        compatibility launcher for the new repository-local sync
tests/ai/                        migration, filesystem and consistency tests
```

Layout diagrams that show `.ai/config.yaml` or a `.ai/commands/` store describe an older sketch, not this implementation. `config.json` deliberately uses built-in JSON parsing rather than adding a YAML dependency for a single manifest; skill, role and rule metadata remains YAML frontmatter. There is no separate `.ai/commands/` workflow store: the full command instructions live in `.agents/skills/`, while thin command templates live in adapters. There is no `.codex/config.toml` unless the owner needs native runtime settings; standalone agent files and skills do not require one. Prefer the table above over any external diagram when they disagree.

Edit `.ai/rules/`, `.ai/agents/` or `.agents/skills/`. Generated provider files are checked-in compatibility artifacts, never authoritative copies. The manifest permits safe updates and removal of individual obsolete owned files; it does not replace directories. Preserve native runtime configuration in its provider's own format. Sync never installs tools, configures a model, changes permissions, copies MCP credentials or writes to a home directory. It reuses the repository's existing Prettier dependency for stable Markdown output; no dependency or lockfile change is needed.

## Compatibility matrix

N = native mechanism; G = generated adapter; P = partial equivalence; U = unsupported by this integration. “Preserved” means the sync does not author, translate or overwrite that runtime configuration; it does not imply that a runtime feature was exercised.

| Provider          | Rules                                                     | Skills                            | Commands                                      | Subagents                                                         | Settings     | Hooks                                           | MCP                                      |
| ----------------- | --------------------------------------------------------- | --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ------------ | ----------------------------------------------- | ---------------------------------------- |
| Cursor            | N/G: `AGENTS.md`, MDC activation                          | N: `.agents/skills`               | G: Markdown wrappers                          | N/G: `.claude/agents` compatibility                               | N, preserved | N, preserved                                    | N, preserved                             |
| Codex CLI 0.166.0 | N: `AGENTS.md`; P: explicit conditional references        | N: `.agents/skills`               | N: `$name`; U: matching custom slash commands | N/G: `.codex/agents/*.toml`                                       | N, preserved | N: existing `hooks.json` preserved              | N: native TOML preserved                 |
| Claude Code       | G: `CLAUDE.md` import; P: explicit conditional references | N/G: `.claude/skills` copies      | N: `/name` through skills                     | N/G: `.claude/agents/*.md`                                        | N, preserved | N: existing settings hooks preserved            | N: `.mcp.json`/native settings preserved |
| Gemini CLI        | G: `GEMINI.md` import; P: explicit conditional references | N: `.agents/skills` alias         | G: TOML wrappers                              | P: `/role-name` in current session; U: generated native subagents | N, preserved | N, preserved                                    | N: native settings preserved             |
| OpenCode V2       | N: `AGENTS.md`; P: explicit conditional references        | N: `.agents/skills` compatibility | G: Markdown wrappers                          | N/G: `.opencode/agents/*.md`                                      | N, preserved | P: plugin lifecycle; U: shared hook translation | N: native config preserved               |

No runtime sandbox is implemented by role prose. Roles inherit native permissions, approval rules and available tools. Experimental Gemini subagents are intentionally not enabled. OpenCode V1 configuration and singular legacy directories are not generated; install a documented V2 release or adapt its renderer after verifying that version's official contract.

## Discovery and invocation

All eight shared skills are canonical directories under `.agents/skills/`: `apixa-workflow`, `check-structure`, `git-push`, `implement-version`, `plan-change`, `publish-library`, `ship-changes`, `start-version`. `publish-library` is the only release-authorizing workflow; it publishes the root `apixa` package to the `latest` dist-tag and is separate from `git-push`.

| Provider    | Skill discovery                                                 | Exact invocation of git-push                                                      |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cursor      | `.agents/skills`; command wrappers under `.cursor/commands`     | `/git-push`                                                                       |
| Codex       | `.agents/skills` from working directory up to repository root   | `$git-push`                                                                       |
| Claude Code | generated `.claude/skills/git-push/SKILL.md`                    | `/git-push`                                                                       |
| Gemini CLI  | `.agents/skills` workspace alias; command in `.gemini/commands` | `/git-push` (generated command); natural-language requests can activate the skill |
| OpenCode V2 | `.agents/skills` compatibility; command in `.opencode/commands` | `/git-push` (generated command)                                                   |

The original workflows use slash names in their prose. On Codex, the same named workflow is invoked with `$name`; all arguments, stop conditions and operational steps still apply. Native skill activation alone does not grant permission to commit, push, merge or publish: those steps require the explicit workflow request described by the skill. A configuration audit is not a shipping invocation.

Gemini forwards `{{args}}`; OpenCode forwards `$ARGUMENTS`; Cursor and Claude use their invocation's request/arguments. Wrappers ask the agent to read the complete canonical skill. The legacy full instructions no longer reside in Cursor commands. Claude has no generated duplicate command files because its native skills already expose `/name`.

Cursor can also discover Claude's skill and role directories. Its compatibility precedence handles same-named skill copies; this integration avoids another `.cursor/skills` or `.cursor/agents` copy. Codex uses only the real canonical root. Gemini prefers `.agents/skills` over its `.gemini/skills` alias. OpenCode gives the shared compatibility location precedence over Claude copies unless an explicitly configured provider skill overrides it. Sync rejects known shadow definitions under alternative project discovery roots for managed workflow/role names. Global and organizational configuration remains outside its control.

## Rule activation

Original rule descriptions, glob strings and `alwaysApply` flags are retained in `.ai/rules/*.md` and generated MDC metadata.

| Canonical rule          | Original activation                                                         | Integration                                                                   |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apixa-core`            | `alwaysApply: true`, no globs                                               | Body in `AGENTS.md`                                                           |
| `apixa-examples`        | `alwaysApply: true`, `examples/**/*`                                        | Body in `AGENTS.md`; still always-on (Cursor ignores globs when true)         |
| `apixa-git-push-format` | `alwaysApply: true`, no globs                                               | Body in `AGENTS.md`; its instructions apply when running git-push             |
| `apixa-architecture`    | false; `packages/**/*,scripts/**/*,docs/architecture.md,docs/public-api.md` | Conditional table in `AGENTS.md`; full body in matching MDC adapter           |
| `apixa-docs`            | false; `docs/**/*,versions/**/*`                                            | Conditional table and full MDC body                                           |
| `apixa-packages`        | false; `packages/**/*,examples/**/*,tests/**/*`                             | Conditional table and full MDC body                                           |
| `graphify`              | Existing repository-wide `AGENTS.md` section                                | Body in `AGENTS.md`; preserves its superset of the former CLAUDE instructions |

For always-on Cursor rules, MDC keeps activation metadata but points to the common instructions already loaded through `AGENTS.md`, avoiding a second body injection. Conditional rules are referenced by exact repository-relative file patterns in `AGENTS.md`: read the rule before reading, editing or reviewing matching files. This is an explicit instruction mechanism, not an automatic glob engine outside Cursor. Nested `AGENTS.md` files would not accurately represent the original cross-directory/exact-file patterns, so this integration does not generate approximate scopes or turn conditional policies into unconditional text. Claude and Gemini import only `AGENTS.md`, avoiding recursive imports and the former duplicate graphify block.

## Create a skill

Create a real `.agents/skills/<name>/` directory and a complete `SKILL.md`:

```markdown
---
name: audit-fixtures
description: "Audit fixture coverage when the user requests a fixture review"
---

Read the applicable repository instructions and fixture contract. Inspect the
requested fixtures and report missing coverage with evidence. Do not alter data
unless the request includes corrections.
```

Names must match the directory, use lowercase letters/digits separated by single hyphens, and be at most 64 characters. Descriptions are required, nonempty and at most 1024 characters. Put real instructions in the body. Add scripts, references or assets inside the skill when needed; real files and executable modes are propagated to Claude. Other providers load those supporting resources directly from the canonical directory. Use repository-relative paths for shared project references and skill-relative paths for bundled resources.

The validator deliberately supports a portable YAML subset: flat scalar fields and literal/folded multiline strings. Skill fields are `name`, `description`, `license`, `compatibility` (1–500 characters), `allowed-tools`, and an optional two-space-indented `metadata` string map; provider-specific UI/invocation metadata can live in supporting files and is copied intact. Mappings other than `metadata`, arrays, anchors and implicit numeric/null scalars are not a portable configuration interface here. Unsupported syntax fails clearly; use double-quoted JSON-compatible strings for punctuation. Do not assume every provider enforces `allowed-tools` or other optional skill fields identically. Runtime permissions remain native.

Run `pnpm ai:sync && pnpm ai:check && pnpm ai:test`. No per-provider edit is needed. Adding `apixa-workflow` routing is optional only when the new workflow belongs in that existing router.

## Create a role

Create `.ai/agents/<role>.md` with `name`, `description` and a complete Markdown body. Derive responsibilities, allowed operations, expected output, engineering practices and verification from the project contract. Reference relevant canonical skills; do not invent SDK policies. Run sync.

Claude and OpenCode receive native Markdown subagent definitions; Cursor discovers the Claude-compatible definitions. Codex receives standalone TOML agents with `name`, `description` and `developer_instructions`, without model or permission overrides. Ask these agents to use the requested role through their native agent selector/delegation mechanism. Gemini's `/role-architect <request>` (and the other role names) reads the role in the current session. Codex or any future provider without compatible role discovery can always be asked to “read `.ai/agents/reviewer.md` and review this change in that role”; that fallback does not provide context isolation.

## Add a provider

Create `.ai/adapters/<provider>.mjs`, then add its name to `config.json`'s `adapters` list. Export:

- `capabilities`: explicit `discovery`, `skills`, `commands`, `rules`, `roles`, `settings`, `hooks`, `mcp`, `limitations` entries based on official documentation.
- `render({ skills, rules, roles, emit })`: emit deterministic repository-relative files. Definitions include metadata, complete body, canonical path and (for skills) supporting file bytes/modes. Use existing helper functions where useful.

No canonical rule or skill needs to change. Add provider-owned runtime filenames to `nativeFiles` when appropriate; renderers cannot emit into those paths, canonical sources or the manifest. Provider modules are trusted repository build code, not sandboxed plugins. Prefer native shared discovery to copies, avoid multiple same-named native definitions, and document unsupported features. Add integration tests and record runtime evidence or its absence. A new adapter test proves this path without editing the sync engine.

## Sync, check and safety

Prerequisites: the repository's documented Node >=22 and pnpm 9.15 tooling, with development dependencies installed. No global utility is required to run sync or its tests.

```sh
pnpm ai:sync     # validate, preflight, then create/update/remove owned artifacts
pnpm ai:check    # read-only: fail if generated files or manifest are stale
pnpm ai:test     # Node test runner; temporary fixtures, no agents/network required
pnpm test        # AI tests followed by the existing Vitest suite
pnpm verify      # AI consistency check plus all existing project checks
```

`scripts/sync-agent-rules.sh` remains a compatibility launcher and accepts `--check`. It no longer installs files under `~/.codex/prompts`. Old user-level `apixa-*` prompts previously installed by that script are not removed or refreshed; the owner may retire them manually and use `$name` skills.

Sync reports created, updated, unchanged, skipped native files, and removed obsolete owned files. The complete output plan is validated before writes. Paths cannot escape the repo. Canonical directories, supporting files, output files and all their in-repo parents must not be symlinks, including broken links. The one-time migration checked the exact three old link targets before unlinking them, after retaining originals and verifying the copied contents. Future sync refuses unexpected links rather than following or deleting them. Missing output directories are created; missing canonical sources fail.

Unowned files and modified generated files cause a conflict rather than being overwritten. Preserve the changes, move the intended shared content to the canonical source, then remove/reconcile the conflicting generated copy and rerun sync. Do not erase the manifest to bypass conflict detection. Removing a canonical skill removes only its hash-matching generated files; unrelated neighbors remain, and empty directories may remain. There is no destructive directory replacement. Native JSON is syntax-validated if present; native TOML/JSONC is preserved without reserialization and should be validated with its provider. Unrelated files are never formatting targets of sync.

The immutable `tests/ai/fixtures/legacy.json` records the original six rules, six commands, skill, root instructions and two native runtime files as migration evidence, not active instructions. Tests compare entire migrated bodies after only documented path relocations and Markdown formatting, as well as original activation metadata. Config's `adopt` hashes permit only the exact audited legacy generated files to be replaced on first sync. Do not add changed files to that list to bypass ownership checks.

## Migration audit and mapping

Original audit: all six MDC files, all six complete command files, the workflow skill, root `AGENTS.md`/`CLAUDE.md`, the old sync script, package scripts, ignore rules, the active milestone, native settings/hooks, symlinks and repository path references were inspected before replacement. There were no other `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` or repository MCP files in the discovered configuration inventory (excluding dependencies/generated graphs and local ignored playgrounds).

| Original                                     | Canonical source now                        | Generated compatibility                             |
| -------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `.cursor/rules/apixa-architecture.mdc`       | `.ai/rules/apixa-architecture.md`           | same MDC path, conditional table                    |
| `.cursor/rules/apixa-core.mdc`               | `.ai/rules/apixa-core.md`                   | same MDC path, `AGENTS.md` body                     |
| `.cursor/rules/apixa-docs.mdc`               | `.ai/rules/apixa-docs.md`                   | same MDC path, conditional table                    |
| `.cursor/rules/apixa-examples.mdc`           | `.ai/rules/apixa-examples.md`               | same MDC path, `AGENTS.md` body                     |
| `.cursor/rules/apixa-git-push-format.mdc`    | `.ai/rules/apixa-git-push-format.md`        | same MDC path, `AGENTS.md` body                     |
| `.cursor/rules/apixa-packages.mdc`           | `.ai/rules/apixa-packages.md`               | same MDC path, conditional table                    |
| `.cursor/commands/check-structure.md`        | `.agents/skills/check-structure/SKILL.md`   | Cursor/OpenCode/Gemini wrappers; Claude skill copy  |
| `.cursor/commands/git-push.md`               | `.agents/skills/git-push/SKILL.md`          | same provider mechanisms                            |
| `.cursor/commands/implement-version.md`      | `.agents/skills/implement-version/SKILL.md` | same provider mechanisms                            |
| `.cursor/commands/plan-change.md`            | `.agents/skills/plan-change/SKILL.md`       | same provider mechanisms                            |
| `.cursor/commands/ship-changes.md`           | `.agents/skills/ship-changes/SKILL.md`      | same provider mechanisms                            |
| `.cursor/commands/start-version.md`          | `.agents/skills/start-version/SKILL.md`     | same provider mechanisms                            |
| `.cursor/skills/apixa-workflow/SKILL.md`     | `.agents/skills/apixa-workflow/SKILL.md`    | Claude copy and provider command wrappers           |
| Root graphify sections                       | `.ai/rules/graphify.md`                     | common `AGENTS.md`; imported by Claude/Gemini       |
| `.agents/skills -> ../.cursor/skills`        | actual canonical directory                  | parent link removed                                 |
| `.claude/skills -> ../.cursor/skills`        | generated actual directory                  | parent link removed                                 |
| `.claude/commands -> ../.cursor/commands`    | native skills supply commands               | link removed; no duplicate command directory needed |
| `scripts/sync-agent-rules.sh`                | `.ai/scripts/sync.mjs`                      | old shell path forwards to Node                     |
| `.claude/settings.json`, `.codex/hooks.json` | unchanged native files                      | never generated or overwritten                      |

Only workflow source-path relocations, the moved `plan-change` relative tests link, and formatting changed within the migrated instructions. The architecture rule's generated-source pointer now names `.ai/rules/*.md` and `pnpm ai:sync`. The new shared entry point explains provider invocation and explicit conditional loading.

Living references in `docs/conventions.md` and `docs/guides/agents/README.md` point here. Historical story entries and frozen v1.6.0 references were retained: they describe the prior layout; existing Cursor rule/command paths still resolve as compatibility adapters. The old `.cursor/skills/apixa-workflow` location is retired, with its replacement documented above. The stale v0.10-era study guide was removed on 2026-11-12; its historical configuration inventory is not a current reference.

The owner-provided `docs/apixa-publish-library/` bundle (a Cursor command/skill plus a one-time migration script) was adopted on 2026-11-12 instead of left untracked. Its real workflow is now `.agents/skills/publish-library/`; its policy changes were reviewed and applied: the root `apixa` package publishes to the npm `latest` dist-tag, `scripts/verify-publish-readiness.mjs` accepts any valid SemVer, and the owner-facing guide is `docs/guides/humans/publish-a-release.md`. Cursor is not a source of truth for release work.

Pre-existing policy tensions are preserved rather than silently resolved: `implement-version` mentions updating `examples/frontends/basic`, and `check-structure` checks its existence, while the always-on example policy restricts edits to the maintained Next apps unless explicitly requested. Follow the existing restriction; an audit can check existence without editing it. The shipping workflow also excludes local `.codex/` tool state and separately allows deliberately authored config; review intentional adapters explicitly when later shipping. Apart from the reviewed npm dist-tag policy above, this migration does not alter release policy, start a new SDK milestone or modify the active Laravel contract.

## Changed file inventory

- Created: `.ai/config.json`, `.ai/generated.json`, this guide, `.ai/scripts/sync.mjs`, five provider adapters plus `common.mjs`, seven canonical rule files (six migrated plus graphify), and four canonical role files.
- Moved: the complete six Cursor command workflows and `apixa-workflow` into seven real `.agents/skills/<name>/SKILL.md` files; the old workflow skill path and three audited parent links are retired.
- Added later (2026-11-12): `publish-library` as the eighth shared skill, with generated command copies for every adapter.
- Generated: the Cursor commands/rules, Claude skill copies, four Claude roles, four Codex roles, Gemini commands, OpenCode commands/roles, and root `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. These comprise the generated files plus the ownership manifest.
- Created tests: `tests/ai/sync.test.mjs` and immutable `tests/ai/fixtures/legacy.json`.
- Modified integration: `package.json` adds `ai:sync`, `ai:check`, `ai:test`, includes AI tests before existing Vitest tests, and adds consistency checking before the existing verify pipeline. `scripts/sync-agent-rules.sh` forwards to the new sync.
- Modified living documentation: `docs/conventions.md`, `docs/guides/agents/README.md`, and a new entry at the top of `docs/story.md`.
- Preserved: native settings/hooks, lockfiles, SDK implementation, public API snapshots, frozen milestones, unrelated Laravel changes, and the untracked publishing bundle. Nothing was committed or pushed.

## Diagnose discovery

1. Run `pnpm ai:check`; resolve stale artifacts and ownership conflicts first. Confirm `.agents/skills` is a real directory and every skill has its own valid `SKILL.md`.
2. Launch the CLI from this checkout or a supported descendant. Confirm workspace trust without changing global trust/approval settings automatically.
3. Restart provider sessions after adding skills. In Codex use `/skills` or its app-server `skills/list` API; confirm the returned path is this checkout's canonical skill. In Claude inspect the skill selector/slash commands and `/agents`; its stream-JSON initialization lists discovered `skills`, `slash_commands` and `agents`.
4. In Cursor inspect skills under Agent settings and type `/`; check rules under project settings. Its CLI `agent --mode ask` may require an interactive workspace-trust decision before discovery.
5. In Gemini run `gemini skills list --all`, `/skills reload` and `/memory show`; verify `GEMINI.md` imports the common instructions. Skill activation may require consent.
6. In OpenCode V2 inspect the skill tool and command/agent selectors; confirm the version uses the documented V2 paths. Native/global overrides can change discovery precedence.
7. If a hook fails, inspect its native file and executable independently. Existing graphify hooks use `/Users/asstorer/.local/bin/graphify`; that host-specific installation must exist on another machine. Sync preserves these commands rather than silently changing security boundaries. It does not install graphify globally.

## Verification record — 2026-11-12

| Provider         | Local version         | Observed evidence                                                                                                                                                                                  | Limits                                                                                                                                          |
| ---------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI        | 0.166.0               | Actual app-server `initialize` + `skills/list` with this cwd and `forceReload: true`: all eight canonical skill paths enabled; no discovery errors                                                 | No shipping workflow or subagent executed; role TOML follows official standalone schema                                                         |
| Claude Code      | 2.1.316               | Actual stream-JSON initialization lists all eight shared skills in both `skills` and `slash_commands`, and all four shared roles in `agents`; native `claude doctor` reports no installation issue | Model reply is not used as discovery evidence; no tools, workflows or subagents invoked in probe                                                |
| Cursor Agent CLI | 2026.05.01-eea359f    | Read-only discovery probe attempted with `--mode ask`                                                                                                                                              | Refused with “Workspace Trust Required”; no trust bypass or user-setting change performed. Structurally validated; runtime discovery unverified |
| Gemini CLI       | not installed/on PATH | Generated imports/TOML wrappers, canonical discovery structure and automated tests                                                                                                                 | Structurally validated; runtime-unverified                                                                                                      |
| OpenCode         | not installed/on PATH | Documented V2 paths, wrapper/role metadata and automated tests                                                                                                                                     | Structurally validated; runtime-unverified                                                                                                      |

The native Claude settings and Codex hooks remain byte-for-byte equal to their audit snapshots. Installed native hook executable paths exist; end-to-end hook execution/security enforcement is not asserted by a skill-discovery check. Runtime model behavior, automatic conditional-rule compliance, every optional provider setting and future CLI versions are not proven by structural tests.

Automated checks cover complete instruction preservation, valid metadata, expected provider paths, canonical edits, new skills and resources, modes, idempotence/mtimes, stale checks, native settings/hooks/MCP preservation, missing files, broken/valid symlink refusal, no partial writes on preflight failures, activation metadata, manual conflicts, legacy adoption, safe retirement and adding a provider. Observed results: `pnpm verify` exited 0 (build, architecture/API checks, typecheck, 151 Vitest files / 1,600 tests, packed consumers including React 18/19, 62/62 type-consumer checks, 5 Chromium checks, Vercel Edge and workerd). The final `pnpm ai:test` run passed 21/21 cases after the last validator/test additions; `pnpm ai:check` reported zero changes, 55 unchanged entries and 11 skipped native paths. Skill Creator's validator passed all eight canonical skills using the already-installed graphify Python environment (the default Python lacks PyYAML; no installation was performed). An independent Python `tomllib` parse accepted all 15 generated TOML files. Scoped Prettier and `git diff --check` passed, and `graphify update .` completed (generated graph output remains ignored). Whole-tree `git diff --check` also reported a pre-existing/concurrently edited trailing blank line in unrelated `examples/backends/laravel-backend/routes/api.php`; that file was not changed by this task. Rerun the commands above after changes.

## Official contracts consulted

Consulted 2026-11-12; versions and support can change independently of this repository.

- [Agent Skills specification](https://agentskills.io/specification)
- [Cursor skills](https://cursor.com/docs/skills), [rules](https://cursor.com/docs/rules), [subagents](https://cursor.com/docs/subagents)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills), [custom subagents](https://developers.openai.com/codex/subagents) (current documentation redirects to ChatGPT Learn)
- [Claude Code skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents)
- [Gemini skills](https://geminicli.com/docs/cli/skills/), [custom commands](https://geminicli.com/docs/cli/custom-commands/), [context imports](https://geminicli.com/docs/cli/gemini-md/)
- [OpenCode V2 skills](https://opencode.ai/docs/skills/), [commands](https://opencode.ai/docs/commands/), [agents](https://opencode.ai/docs/agents/), [instructions](https://opencode.ai/docs/instructions/)
