# Apixa capability-gap report — template and triage protocol

**Audience:** Agents and maintainers evaluating real consumer migrations.  
**Goal:** turn concrete backend/frontend friction into actionable Apixa engineering evidence—not more local workarounds.

Create a report in the _consumer repository_ (e.g. `docs/apixa-migration-report.md`, if requested), or include the report in your final migration summary. Do not write user-project secrets or production payloads to a public issue.

## Classification: every finding gets exactly one primary class

| Class           | Meaning                                                                              | Core issue?                     |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| `DIRECT`        | Supported by an existing built-in or declarative custom operation                    | No                              |
| `CONFIGURATION` | Supported by documented root/resource/operation config                               | No                              |
| `APPLICATION`   | Orchestration or state behavior outside Apixa's contract-definition scope            | No                              |
| `BACKEND`       | Inconsistent/underspecified server contract; backend change is the real solution     | No, unless generality justified |
| `APIXA_GAP`     | Relevant common contract cannot be represented cleanly with the installed public SDK | Candidate                       |
| `UNKNOWN`       | Evidence or API-version confirmation missing                                         | Investigate                     |

**Do not classify a custom declarative operation as a missing Apixa feature.** Custom routes are intentionally supported. Conversely, if many simple endpoints require imperative `ctx.request`, unsafe casts, hidden fetch wrappers or near-identical middleware workarounds due to one missing abstraction, investigate `APIXA_GAP`.

## Report summary

```text
Consumer repo / branch:
Backend repo / source:
Apixa installed version and entry point:
Date:
Scope:

Existing frontend API calls inventoried:
Relevant backend routes verified:
Routes mapped to Apixa:
Routes intentionally excluded (with reason):
Routes unresolved / evidence missing:
Custom declarative operations:
Function-operation workarounds:
Installed dependency changes:
Tests/checks actually executed:
Behavior parity risks:
```

Never claim 100% coverage without complete evidence. Counts are useful but do not replace endpoint-level proof.

## Per-finding evidence form

```markdown
### GAP-001 — [Concise observed limitation]

- Classification: APIXA_GAP | DIRECT | CONFIGURATION | APPLICATION | BACKEND | UNKNOWN
- Priority: P1 (blocking) | P2 (important) | P3 (nice-to-have)
- Backend route: METHOD /canonical/path
- Backend evidence: path/to/controller.ts:line; test path or contract doc
- Frontend caller evidence: path/to/service.ts:line
- Installed Apixa version/entry checked:
- Required contract: method, payload, response, error and typing behavior
- Existing Apixa capabilities checked: built-in / custom declarative / config / hooks
- Current result: what works, what fails, and exact why
- Minimal reproduction: small runnable snippet or precise steps
- Workaround: smallest safe local alternative, with trade-offs
- Recommended public API change (if a genuine SDK gap): proposed shape, default,
  type inference, runtime behavior, errors, scope/inheritance and compatibility
- Alternative: backend standardization or application-layer solution
- Regression scenarios required:
- Decision: document only / workaround / request core change / unknown
```

## Prioritization rules

**P1:** blocks important, otherwise normal backend contract; cannot migrate correctly without maintaining parallel HTTP plumbing or violating behavior.

**P2:** supported through significant duplication or fragile workarounds across multiple consumers; a clean SDK abstraction likely helps.

**P3:** convenience for a niche protocol or app-specific pattern with an already clean, safe solution.

Do not recommend adding a setting simply because a backend has an unusual option. Ask whether a stable primitive or a single declarative operation already solves it with fewer concepts.

## Final two-track recommendations

1. **Consumer changes now:** implement only proven, supported Apixa behavior, with minimal non-Apixa glue for real exceptions.
2. **Apixa/backend improvements later:** separately propose SDK/core enhancements or backend contract standardization with explicit compatibility/approval boundaries.

Do not modify core Apixa, publish a version, or change the backend during an authorized _frontend migration_ unless separately instructed. A limitation report is a valuable result, not a failed migration.
