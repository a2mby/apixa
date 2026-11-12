# Engineering decisions

**Why it exists:** Gives a repeatable procedure for costly or hard-to-reverse choices.
**Use when:** choosing a framework or rendering mode, state/data library, auth model, API contract, monorepo split, or costly module boundary.
**Do not use when:** the choice is cheap to reverse; decide it inline and move on.

Use for framework/rendering choices, state/data libraries, auth, API contracts, monorepo splits, and module boundaries costly to reverse.

## 1. Classify reversibility

| Type         | Definition                                                                                       | Process                                  |
| ------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Two-way door | Cheap to undo: local component API, folder layout, a hook                                        | Decide fast, state the tradeoff, move on |
| One-way door | Costly to undo: rendering strategy, auth model, API contract, data ownership, public package API | Run the full procedure below             |

A module boundary is two-way when callers are local and migration is cheap; it is one-way when independently deployed consumers depend on it. Judge migration cost, not the noun “architecture.”

## 2. Procedure for one-way doors

1. State the **problem** and **constraint** (deadline, team size, traffic, SEO, offline, security) in two lines. No problem, no decision.
2. List **2–3 real options**, including “do nothing / keep current.” For a greenfield task, keeping current means deferring the commitment until a stated trigger.
3. Score each option on the fixed rubric. Use 1 = poor, 2 = acceptable, 3 = strong and one line of evidence per cell. Treat hard requirements as gates: a failed auth/security/SEO requirement cannot be averaged away. Mark unknown scores as assumptions, not measurements.
4. Name the winner's **failure mode** at misuse or 10× scale and a measurable tripwire for revisiting it.
5. Pick and recommend one option directly. State problem solved, cost, when **not** to use it, and what breaks under misuse.
6. Record a five-line ADR using [the decision-record template](refactoring.md). Keep a proposed ADR inline for advice-only tasks; write it when introducing the pattern in code.

| Criterion     | Question                                               |
| ------------- | ------------------------------------------------------ |
| Fit           | Does it solve the stated problem, not an imagined one? |
| Cost          | Build + run + learning cost, in team-days              |
| Reversibility | How expensive is the exit?                             |
| Coupling      | What dependency edges and lock-in does it create?      |
| Failure mode  | What breaks when misused or at scale?                  |
| Team fit      | Can the current team operate it?                       |

Use estimates/ranges for team-days when workload data is incomplete; name the assumptions. Never present invented precision as measured cost.

## Decision rules

- Prefer the boring, existing, already-in-repo option unless it is the root cause.
- Hype, benchmarks without a workload, and “industry standard” alone are insufficient evidence.
- Defer a decision that need not be made yet; record the event that forces it.
- State assumptions and which decision flips if an assumption is wrong.
- If traffic, SEO needs, or auth-provider facts are missing, recommend on stated assumptions and flag them. Do not stall; a recommendation does not authorize an unrelated migration.

## Example: authenticated internal dashboard

Problem: ship a private reporting UI against an existing API.
Constraint: assume two React engineers, no indexable routes, no offline mode, and an API-supported browser session.

| Criterion     | Keep current Next.js                         | Separate Vite SPA                                           | Defer UI choice                       |
| ------------- | -------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Fit           | 3 — supports the private routes              | 3 — browser rendering covers requirements                   | 1 — blocks shipping                   |
| Cost          | 3 — estimated 1–2 team-days for route wiring | 2 — estimated 3–5 team-days for scaffold/deploy/auth wiring | 1 — no build cost now, deadline slips |
| Reversibility | 2 — keep transport framework-neutral         | 2 — migration requires routing/auth integration             | 3 — no committed code                 |
| Coupling      | 2 — existing framework runtime               | 2 — additional deployment boundary                          | 3 — none yet                          |
| Failure mode  | 2 — accidental second backend/cache          | 2 — deep links/session setup fail without hosting support   | 1 — users retain manual reporting     |
| Team fit      | 3 — existing operational knowledge           | 2 — React familiar, hosting unproven                        | 1 — no delivered workflow             |

Recommendation: keep Next.js **for this existing app**. It solves shipping without a deployment migration; cost is retaining its runtime; do not apply this recommendation to a greenfield browser-only app with proven SPA hosting. Misuse creates business logic in Server Actions. Revisit if frontend hosting/runtime cost exceeds the agreed budget or independent deployment becomes necessary. These estimates are illustrative, not facts about A Square's team or traffic.

```md
# Keep existing delivery for private reporting

Context: Private reporting needs no SEO; assume the team already operates Next.js.
Decision: Keep Next.js routes with a framework-neutral typed API client.
Alternatives rejected: SPA migration adds deployment work; deferral misses the delivery constraint.
Consequences: Retain the server runtime; business logic in actions would duplicate API authority; revisit on hosting-budget breach.
```

For a greenfield SPA recommendation, use the same rubric rather than reversing the conclusion solely because the app is private. Check auth, hosting rewrites, and team capability first.
