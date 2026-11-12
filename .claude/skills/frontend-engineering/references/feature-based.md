# Feature-based pattern (recommended default, not a rule)

**Why it exists:** group code by capability so a feature can be understood, changed, tested, owned by a team, and extracted without touching unrelated code.
**Use when:** no repo convention exists, or the user asks for it.
**Do not use when:** the repo already has a healthy different convention (follow it), or the change is Simple (one workflow, local state, ≤ ~5 files): colocate beside the consumer, with no `features/` folder or barrel. Example: a footer newsletter form is a component plus one API call next to the footer, not `features/newsletter/`. The app as a whole being tiny is also enough reason to stay flat.

## Shape

| Scope                    | Holds                                                                                                 | Rule                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `features/<capability>/` | Everything owned by that capability                                                                   | May use `shared/`. Never imports another feature's internals |
| `shared/`                | Cross-capability code with no business knowledge, site-level pages, centralized `lib/` (incl. `api/`) | Never imports features                                       |
| App/route layer          | Composes features                                                                                     | Thin; no business logic                                      |

Inside a scope, group by role (components, types, config, hooks, data, content, utils, stores, providers, ...). Role folders are chosen by need; add only what the capability uses. Conventions the user may adopt (all optional, follow the repo/user if different):

- First layer folders only; a barrel `index.ts` per folder as the public entry.
- `name.kind.ts` file names (`products.types.ts`) for fast search.
- `Parent.Child.tsx` subcomponents; promote to `Parent/Child/` only when a part has multiple children of its own.
- Centralized `lib/api` in `shared/`; features call it through hooks.
- Inside a feature use relative imports between siblings; barrels are for access from outside.
- Do not mix `"use client"` and server-only exports in one barrel (Next.js).

## Why it maps to modular monolith and microservices

| Architecture                            | How the pattern fits                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modular monolith                        | One app, each feature a module with a public barrel and enforced import rules. Features align 1:1 with backend modules/bounded contexts                                                                                       |
| Service-aligned (microservices backend) | A feature consumes one service's contract through the centralized API client; contract types live with the feature. Backend ownership boundaries equal frontend feature boundaries                                            |
| Micro-frontends / packages (later)      | A feature already has a single public interface and no inbound deep imports, so it can move to its own package or remote with its barrel as the package entry. Extract only on a real trigger (independent team/deploy/stack) |

## Extraction triggers (otherwise stay a monolith)

- Separate team needs independent release cadence
- Different runtime/framework or deployment target
- Build/test time or blast radius is hurting delivery measurably
- Contractual or security isolation

Cost of extracting early: versioned contracts, duplicated infra, slower local dev, cross-app UX inconsistency. Cost of never being extractable: a rewrite. The pattern pays only the cheap half up front (clean boundaries) and defers the expensive half.

## Tradeoffs of the pattern (state them when recommending)

| Cost                                     | Mitigation                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Duplication across features              | Promote to `shared/` only on a second real consumer with the same responsibility |
| `shared/` becomes a dump                 | Domain-aware code never goes in; review promotions                               |
| Barrel pitfalls (cycles, bundle leakage) | Relative imports inside a feature; split client/server barrels; lint rules       |
| Cross-feature workflows                  | Compose at the page/app layer; use public contracts, not deep imports            |
| Empty-folder ceremony for tiny features  | Create only needed role folders; keep flat for Simple                            |
