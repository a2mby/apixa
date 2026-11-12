# Frontend system design

**Why it exists:** Separates workflows from non-functional constraints before structure is chosen.
**Use when:** proposing architecture or adding network edges, shared state, caching, heavy dependencies, or independently evolving sub-areas.
**Do not use when:** the change fits an existing owner and adds no edge, state, or dependency.

Before choosing structure, separate functional workflows from non-functional constraints. Write only constraints relevant to the request: latency/LCP, SEO, offline, i18n/RTL, accessibility, security, and team size. State unknowns as assumptions.

| Concern                 | Rule                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements first      | Identify functional and non-functional requirements before choosing structure                                                                   |
| Single source of truth  | Every datum has one authoritative owner: server, URL, query cache, or local state; no mirrored copies                                           |
| Boundaries              | Split what changes independently or belongs to a different team/service                                                                         |
| Coupling                | Depend on types/schemas and intentional interfaces, not module internals or database shape                                                      |
| Failure handling        | Every network edge specifies loading, empty, error, retry/backoff, timeout, and partial-failure behavior                                        |
| Idempotency and repeats | Mutations are safe to retry or guarded by pending state, an API-supported idempotency key, and explicit rollback/reconciliation                 |
| Caching                 | Name the owner and invalidation trigger for every cached read                                                                                   |
| Consistency             | Decide per workflow: strong (wait for server) or eventual (optimistic), and document it                                                         |
| Performance budget      | Set route bundle and LCP/INP budgets before adding heavy dependencies; justify each dependency                                                  |
| Scalability             | Split by capability and lazy-load; micro-frontends only for independent teams/deploys                                                           |
| Security                | Server validates; secrets stay out of bundles; default to httpOnly session cookies; sanitize rendered HTML and define CSRF/CORS at the API edge |
| Observability           | Report errors with route, action, and request ID through one logging boundary; redact user data and secrets                                     |
| Tradeoff statement      | Every structural choice states problem solved, cost, when not to use it, and failure under misuse                                               |

## Specify a network edge before implementing it

A compact note in the Module Map or implementation plan is enough:

```text
Read: <typed operation and contract>
Owner: <server fetch or client cache>; key: <identity/locale/filter>
Freshness: <TTL/event>; invalidation: <mutation/event and affected keys>
Consistency: <wait for acknowledgement or optimistic with reconciliation>
Failure: <loading/empty/error UI; timeout; retries/backoff; partial result>
Mutation: <duplicate guard; idempotency support; unknown-outcome recovery>
Telemetry: <error boundary/reporting path and safe correlation fields>
```

“No automatic retry” is an explicit policy, not missing handling. Default to bounded retries only for transient idempotent reads, honoring server retry guidance. Exception: an API-confirmed idempotent mutation supports the same retry key across attempts. A disabled button alone does not prevent network-level duplicate writes. For an unknown mutation outcome, reconcile status before offering a new submission.

Default to waiting for server acknowledgement for bookings, payments, publication, and permission changes. Use optimistic updates for reversible interactions only when conflicts and rollback/reconciliation are specified. Eventual UI does not weaken server authorization or validation.

## Cache and handoff discipline

Differentiate server authority from a cached client representation. A hydrated cache is one lifecycle after handoff; independently refreshing the same resource in two caches is duplicate ownership. Document URL/query-key inputs, tenant/user scope, invalidation after mutation, and session-change clearing. Never share personalized responses across users through an unscoped cache.

## Performance and security decisions

Use the repo's measured budget. If none exists, propose an explicit target and measurement context before selecting a heavy dependency (for example, p75 mobile LCP ≤ 2.5s and INP ≤ 200ms, plus a baseline-relative compressed route-JS limit). These are proposed targets until measured and accepted as project policy.

Default to httpOnly cookies for browser sessions. Exception: an established provider requires a different credential protocol; keep credentials at its documented boundary and record the XSS/CSRF tradeoff. UI redirects are navigation aids; the API authorizes every protected operation. Sanitize untrusted HTML with the existing vetted policy, not string replacement.

| Choice                  | Problem solved                    | Cost                                                          | When not to use                      | Misuse failure                          |
| ----------------------- | --------------------------------- | ------------------------------------------------------------- | ------------------------------------ | --------------------------------------- |
| Client query cache      | Repeated interactive server reads | Invalidation and session lifecycle                            | Static props with no browser refresh | Stale or cross-user data                |
| Optimistic update       | Perceived latency                 | Rollback/conflict handling                                    | Irreversible or high-stakes writes   | UI claims success for rejected changes  |
| Lazy capability loading | Route bundle pressure             | Loading/error boundary and chunk requests                     | Tiny code needed immediately         | Waterfall delays critical interaction   |
| Micro-frontends         | Independent team deployments      | Runtime contracts, duplicated tooling, integration operations | One team and one deployment          | Version drift and inconsistent sessions |

Architecture proposals must answer the four tradeoff questions in prose or a table, not merely name patterns.
