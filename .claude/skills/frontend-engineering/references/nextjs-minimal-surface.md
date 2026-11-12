# Use Next.js only where it earns its server surface

**Why it exists:** Treats Next.js as a delivery layer so it does not grow into a second backend.
**Use when:** deciding Next.js versus SPA, selecting route rendering, or adding server endpoints, actions, or proxy behavior.
**Do not use when:** the framework and rendering mode are already fixed and unchanged; follow the existing choice.

Next.js is a delivery/rendering layer, not a second backend. Evaluate adoption or replacement as a one-way decision using [engineering decisions](decision-making.md); a routine feature request does not authorize a framework migration.

## Need test

| Need                                  | Default recommendation                            | Exception / condition                                                           |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| SEO / public pages / fast first paint | Next.js SSR/SSG/ISR                               | Existing static delivery already meets the requirement                          |
| Authenticated dashboard only, no SEO  | Vite + React SPA for greenfield browser-only work | Keep Next.js when already standardized and switching adds no demonstrated value |
| Hide API keys / aggregate calls (BFF) | Thin Next.js BFF if choosing Next.js for delivery | Existing API/BFF handles this; a BFF alone does not require Next.js             |
| Mixed marketing + app                 | Next.js; app routes mostly client-driven          | Existing split delivery already meets team/deployment needs                     |

## Rendering mode picker

Choose the cheapest mode satisfying the route, freshness, and security requirements:

1. **Static:** public marketing content that changes at deployment.
2. **ISR/revalidated:** public semi-static content with a bounded staleness requirement and invalidation owner.
3. **SSR:** personalized content whose initial HTML/SEO requirement warrants per-request work.
4. **Client:** private interactive app with no indexable data and an API-supported auth/session flow.

This is a requirements decision, not a universal performance ranking. Existing `no-store` freshness/integrity behavior wins until explicitly changed. Use the installed Next.js docs to choose the actual cache/revalidation APIs; defaults differ by version and Cache Components configuration.

## Minimize-surface rules

| Area                            | Rule                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Route handlers / Server Actions | Thin proxy/BFF only: attach secrets, forward to real API, shape errors; no business logic, DB access, or duplicated business validation   |
| Server Components               | Fetch via the same typed contract/client authority; no parallel data-access implementation or self-HTTP call through a Next route         |
| Rendering mode                  | Pick per route using the requirements above                                                                                               |
| Middleware / Proxy              | Auth redirects and locale routing only by default; retain established lightweight security-header policy; no data fetching or heavy logic |
| `"use client"`                  | Smallest interactive leaf; expand only for subtree-wide browser state                                                                     |
| Server state                    | One owner: server fetch or query cache; explicit hydration handoff rather than independent copies                                         |
| Env/secrets                     | Server-only env stays server-side; only truly public values use `NEXT_PUBLIC_*`                                                           |
| Caching                         | Explicit strategy per read: no-store or tags/time; name owner and invalidation trigger                                                    |
| Deploy coupling                 | Frontend is replaceable without changing API contracts; no Next-specific types/protocol in the API contract                               |

Next.js 16's installed docs rename `middleware` to **`proxy`** and deprecate the old convention. Read `01-app/03-api-reference/03-file-conventions/proxy.md` under the installed docs before editing it. Default to current file/API names; exception: preserve an older supported project version's conventions. Do not introduce an obsolete filename from this table's generic terminology.

Boundary input parsing, session checks, CSRF protection, and authorization forwarding are legitimate BFF work; they do not replace authoritative API authorization/business validation. A server action remains an exposed mutation entry and needs its own boundary protections.

**Red flags (reject):** Next API routes reimplementing backend CRUD; Prisma/DB access in the frontend when a backend exists; Server Actions containing business rules; independent server/client fetch stacks for the same resource. Runtime-specific entry points sharing one transport/contract are different from duplicate stacks.

For A Square, use the existing Express BFF for aggregation/secrets according to current repository rules. Do not add a parallel Next BFF to comply with this generic reference. Retain existing Next session redirect/forwarding routes where they are part of the established boundary.

## Tradeoffs and escape hatch

| Recommendation                | Problem solved                            | Cost                                           | When not to use                             | Misuse failure                                       |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Next.js for public routes     | Indexable initial HTML                    | Server/cache deployment and framework coupling | API + SPA already meets all delivery needs  | Rendering app becomes a second backend               |
| SPA for private greenfield UI | Browser interaction with simpler delivery | Client loading/auth and host rewrite setup     | Public indexed data needs server HTML       | Auth assumed secure merely because routes are hidden |
| Thin BFF                      | Secrets and controlled API adaptation     | Extra network hop and endpoint operation       | Existing BFF already owns the concern       | Duplicate rules diverge across backend layers        |
| Static/revalidated output     | Low-cost public delivery                  | Freshness policy and invalidation              | Personalized or immediately fresh responses | Stale or user-specific data cached publicly          |

If API plus plain SPA satisfies the actual requirement, say so and recommend it for the appropriate scope. Using fewer framework features is a valid preferred outcome; retaining an existing working framework is also valid.
