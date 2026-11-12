---
name: frontend-engineering
description: Architect and implement frontend features with explicit ownership, dependency direction, and functional decomposition. Use when adding a feature, deciding where code lives, splitting a complex module, fixing circular imports, reviewing frontend structure, or refactoring boundaries (React, Next.js, Vue, Svelte, Angular). Not for pure styling tweaks or single-component bug fixes.
---

# Frontend Engineering

## Mission

Build the smallest coherent change whose behavior, state, and dependencies have identifiable owners. Preserve functional cohesion: split responsibilities that change independently; keep things that always change together together. Folder tidiness alone is not architecture.

The structures below are defaults, not mandatory layers or folder names. Create only roles the task needs; follow existing healthy conventions instead of adding ceremony. Pure styling tweaks and isolated component fixes do not trigger this skill automatically; an explicit invocation or repository instruction still applies.

## Architectural stance

Goal: the best architecture with the fewest tradeoffs, not the most structure.

1. **Boundaries follow business capabilities.** A frontend feature mirrors a backend bounded context or user-facing capability. Organize by capability first, technical role second. This is the same cut that makes a modular monolith clean and lets a capability be extracted later (separate package, micro-frontend, or service-aligned team) without a rewrite.
2. **Start as a modular monolith.** One deployable app with enforced internal boundaries. Extract to packages or micro-frontends only when a trigger exists: independent team, independent deploy cadence, or divergent stack. Never pre-split. Splitting into internal modules inside the one app (Complex level) is not pre-splitting; extraction out of the app is.
3. **Every boundary is a contract.** A capability exposes one public interface (types, functions, components); everything else is private. The contract is what stays stable when internals change or the capability is extracted.
4. **Prefer reversible decisions.** When two options fit equally, choose the one cheaper to undo. Defer costly decisions until the trigger forces them; record the trigger.
5. **Make boundaries enforceable by tooling**, not by documentation (import rules, cycle checks, path aliases to public entry points).
6. **Structure expresses boundaries; it does not replace them.**

## Workflow — mandatory order

1. **Locate:** read applicable `AGENTS.md`, current architecture decisions, and package scripts. Find the capability owning the request; read its public entry point and 2–3 representative implementation files, including a consumer and state/data path. Trace imports; never infer ownership from folder names alone. If no entry point exists, read the component and its caller. For a new project, state that there is no existing owner and identify the proposed one.
2. **Classify:** use the observable triggers below; state the level and evidence.
3. **Decide:** apply the Ownership Ladder top-down. Load the references whose triggers match the task before making the associated decision. For architecture recommendations, state **problem solved, cost, when not to use it, and what breaks under misuse**; use the decision procedure for costly choices. Check the choice against the Architectural stance: boundary follows a capability, exposes one public contract, is the more reversible option, and can be enforced by tooling.
4. **Plan (Complex only):** write the Module Map before creating any implementation file. For refactors, also complete the smell/target-ownership steps in the refactoring reference before moving files.
5. **Implement:** make the smallest coherent change within the chosen owner. For advisory requests, give the decision or proposed placement; do not modify the app merely to demonstrate it.
6. **Enforce:** follow the enforcement reference; inspect available scripts and run the repo's lint, typecheck, tests, build, and existing cycle check. For advice without edits, report `not run: advisory task`. Unavailable or failed checks remain explicit.
7. **Report:** complete the self-review and finish with the Output Contract. For Complex work, prepend the Module Map.

## Complexity triggers

Evaluate Complex first, then Moderate, then Simple. Count user workflows, not components or helper functions.

| Level    | Signals                                                                                                                                                                                                                                                     | Default structure                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Simple   | 1 workflow, local state, ≤ ~5 files                                                                                                                                                                                                                         | Flat folder, colocated files, no index barrel needed                            |
| Moderate | 2–3 workflows OR server data + local UI state OR reused in 2+ routes                                                                                                                                                                                        | Feature folder with `components/`, one data hook/service, one public `index.ts` |
| Complex  | Any 2: ≥ 4 distinct workflows; shared state across sub-areas; own domain rules/validation; multiple integrations; sub-areas that change independently; one file/module people avoid touching (cite a reported maintenance blockage or repeated regressions) | Internal functional modules + Module Map + enforced boundaries                  |

Server data here means a managed read lifecycle, not merely a form POST. “Own rules” includes UI/editor rules; server business authority remains governed by the API-first reference. If file count alone exceeds the Simple guide, keep it flat and state why no higher trigger applies.

**Split by responsibility change-rate, not by size.**

## Ownership & Dependencies

### Ownership Ladder

Use top-down; stop at the first match. For wiring/routing/provider/bootstrap code, use rung 5; it is application composition rather than reusable feature behavior.

1. Used by one component → colocate beside it.
2. Used by one functional module → inside that module, private.
3. Used by several modules of one capability → `capability/_shared/`, internal and not exported outside the capability.
4. Used by 2+ unrelated capabilities AND has no business/domain knowledge → app-level `shared/`.
5. Wiring, routing, providers, bootstrapping → app level only.

Promote only when a **second real consumer exists** and both consumers share a responsibility, not just a visual resemblance. Never promote speculatively. Domain-aware code stays with its capability; cross-capability consumers use that owner's public contract rather than moving its rules into `shared/`.

### Dependency and state ownership

- Application composition coordinates capabilities; shared infrastructure never imports feature behavior. Name each new dependency edge and why its direction is allowed.
- External consumers use a capability's intentional entry point. Internal functional modules expose narrow APIs to siblings; private implementation stays private. Use direct calls or props/callbacks by default; use events only for an existing event contract or independently timed producers/consumers.
- Give each datum one authoritative owner: server, URL, query cache, or local/module state. Derive counts, flags, and filtered views instead of synchronizing copies. An editable draft is separate state with explicit reset/commit semantics, not a second server authority.
- State transitions go through the owning module. Default to state near its consumers; lift only to their nearest coordinator when multiple consumers require it. Shared access alone is not a reason for a global store.
- Components own focused interaction/presentation. Extract behavior only when it changes independently, has a real second consumer, or needs an independently testable boundary; preserve semantic and accessible composition.

## Module Map — required for Complex work

Copy [the template](assets/module-map.template.md) or this block before coding; fill every column. Place the architecture tradeoff in the final line rather than adding another document for an existing pattern.

```md
## Capability: <name>

Purpose: <one sentence, what problem it solves>

| Module | Owns (state/rules) | Exposes (public API) | Depends on | Private details |
| ------ | ------------------ | -------------------- | ---------- | --------------- |
| ...    | ...                | ...                  | ...        | ...             |

Dependency rules:

- <module> -> <module> allowed; reverse forbidden
- Nothing outside the capability imports below its `index.ts`

Cross-capability contracts: <what crosses, via which mechanism>
Tradeoff: <problem solved; cost; when not to use; what breaks under misuse>
```

## Conflict handling and ambiguity

- Existing repo convention beats these defaults unless it causes the problem; flag the cause and proposed deviation instead of silently diverging. Follow explicit current architecture decisions over historical documentation.
- If patterns compete, use the one in the most recently modified, actively used area; verify its callers and history, and state which you chose. Recency does not override an enforced boundary or explicit decision.
- When the repo has no clear convention and the user has not stated one, use the recommended pattern in [Feature-based pattern](references/feature-based.md) for Moderate and Complex work; Simple work stays flat beside its consumer with no new feature folder or barrel. If the user names their own convention, it overrides the pattern entirely.
- If ownership is ambiguous, make the call, state the assumption under **Owner** or **Placement**, and proceed. Do not turn a routine placement decision into an approval gate.

## References — read only when the trigger applies

- [Examples](references/examples.md) — read when classifying a new capability or deciding whether a split earns its cost.
- [Feature-based pattern](references/feature-based.md) — read when starting a project with no convention, creating a feature, or mapping features to modular-monolith / micro-frontend / service boundaries.
- [Next.js / React](references/nextjs-react.md) — read when implementing React/App Router code or translating the ownership model to Vue, Svelte, or Angular; includes this repo's compatibility notes.
- [Anti-patterns](references/anti-patterns.md) — read when reviewing structure, tracing a cycle, or naming a refactoring smell.
- [Enforcement](references/enforcement.md) — read at the Enforce step or before adding import/cycle rules; the procedure and the limits of each tool.
- [Enforcement configs](references/enforcement-configs.md) — read when writing ESLint, dependency-cruiser, or Madge rules after the Enforce step.
- [Refactoring and decision records](references/refactoring.md) — read before moving boundaries, consolidating duplicated rules, or introducing a new pattern.
- [Engineering decisions](references/decision-making.md) — read when choosing a framework/rendering mode, state/data library, auth model, API contract, monorepo split, or costly module boundary.
- [System design](references/system-design.md) — read when proposing architecture or adding network edges, shared state, caching, heavy dependencies, or independently evolving sub-areas.
- [API-first](references/api-first.md) — read when introducing/changing API consumption, validation ownership, errors, pagination, auth, or contract mocks.
- [Minimal Next.js surface](references/nextjs-minimal-surface.md) — read when deciding Next.js versus SPA, selecting route rendering, or adding server endpoints, actions, or proxy behavior.
- [Forms, UI, and styling](references/forms-ui-styling.md) — read when implementing interaction, forms, or visual changes inside an in-scope feature.
- [Testing](references/testing.md) — read when choosing behavioral coverage or verifying changed module/integration boundaries.

## Self-review

- [ ] Every new piece of state has one named owner
- [ ] No new import into another module's internals
- [ ] No cycles introduced
- [ ] Nothing promoted to shared without a second real consumer
- [ ] Structure is no heavier than the complexity level justifies
- [ ] Existing behavior unchanged unless requested
- [ ] Checks actually run, results reported honestly
- [ ] Boundaries match capabilities, expose one contract, and are enforceable by tooling
- [ ] A new engineer could say where the next change goes

## Output Contract

Required for non-trivial tasks (new feature, placement or architecture decision, refactor, review). For a one-line question or trivial edit, answer directly with no contract. When used, end with exactly these fields in this order. Use `none` for inapplicable fields; omit **Risks / follow-ups** if none are real. For Complex work, prepend the completed Module Map. Put complexity/evidence and convention assumptions in **Placement**; put advice tradeoffs in **Boundaries**. Do not add a second conclusion after the contract.

Copy [the output template](assets/output-contract.template.md):

```md
**Owner:** <capability/module that owns the change>
**Placement:** <files created/changed + ownership-ladder rung for each new shared thing>
**Boundaries:** <public interfaces touched; any new dependency edge and why it is allowed>
**State:** <authoritative owner for each new state; anything derived>
**Verified:** <commands run + results; or "not run: reason">
**Risks / follow-ups:**

- <max 3 bullets, only if real>
```
