# Refactoring protocol

**Why it exists:** Makes boundary moves deliberate: name the smell and target owner before moving files.
**Use when:** moving boundaries, consolidating duplicated rules, or introducing a new pattern.
**Do not use when:** the task is a behavior change with no boundary movement; do not refactor opportunistically.

1. Name the **specific smell** using [anti-patterns](anti-patterns.md), with the offending import/state/consumer as evidence. No smell, no refactor.
2. Write target ownership in one paragraph before moving files: who owns the responsibility, who consumes it, which public interface crosses the boundary, and which edge disappears. Include problem solved, cost, when not to use the target, and failure under misuse. For Complex work, also write the Module Map.
3. Move in small, behavior-preserving steps; keep the app buildable after each. Establish a baseline check result so pre-existing failures are distinguishable from regressions.
4. Update imports through the public API; delete dead barrels after checking all consumers. Keep intentional server/client entry points separate when runtime isolation requires them.
5. Add the boundary rule preventing regression, using [enforcement](enforcement.md). If configuring enforcement is outside the authorized scope, recommend the exact rule and report that it is not installed; do not claim an enforced boundary.
6. Never mix a refactor with a feature change in the same step. Finish the move/import verification before changing behavior.

Do not repair unrelated debt discovered while tracing the requested boundary. Record it under Risks / follow-ups only when it affects the change or leaves a real regression risk.

## Lightweight decision records

When introducing a new pattern, write a five-line ADR in `docs/adr/` or the repo's existing equivalent. Skip the ADR when following an existing pattern. For advisory work without permission to change files, include the proposed five-line record in the recommendation instead.

```md
# <decision>

Context: <problem>
Decision: <what>
Alternatives rejected: <why>
Consequences: <cost / what breaks if misused>
```

A Square has `docs/architecture/decisions/` and a decision tracker in `docs/RULES.md`; inspect current conventions there instead of starting a competing register. Historical backend deployment decisions do not change current ASquare-System ownership. Link an applicable existing decision instead of rewriting it.

The record solves loss of decision context at the cost of five maintained lines. Skip it for a move that follows established ownership. Recording a guess as an approved architecture fact misleads future work; label assumptions and proposed decisions clearly.
