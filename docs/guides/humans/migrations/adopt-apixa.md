# Adopt Apixa in an existing frontend project

**For:** developers replacing Axios, direct Fetch and custom HTTP clients with Apixa while keeping an existing backend.  
**Agent companion:** [Migration protocol](../../agents/migrations/migrate-consumer-to-apixa.md) and [backend endpoint audit](../../agents/migrations/audit-backend-endpoints.md).

## The goal

The best migration does **not** copy every old request function into an Apixa configuration object. It analyses the backend HTTP contract, groups related endpoints into resources, uses verified built-ins and declarative custom operations, and removes proven duplication. The frontend becomes easier to read and more strongly typed without silently changing the server's behavior.

A high-quality migration should also tell you exactly what Apixa _cannot_ represent cleanly. Those findings are opportunities to improve Apixa itself, not invitations to hide everything behind elaborate wrappers.

## The default folder layout

```text
src/api/
  api.ts
  resources/
    users.ts
    products.ts
  schema/                 # optional; omit when unnecessary
    users.ts
```

- **`api.ts`:** one composed API and a small number of truly global settings.
- **`resources/`:** one focused file per meaningful domain resource, with relevant paths and operations.
- **`schema/`:** only if runtime validation and schema reuse deliver value. Existing TypeScript types and validators should be reused; validation is not automatically required for each route.

Use the project's existing naming and `src` layout where practical. Avoid extra layers for small codebases.

## Minimal starting point

```ts
// src/api/resources/users.ts
import { createResource } from "apixa";
import type { User } from "../../features/users/user.types";

export const users = createResource<User>()({ path: "/users" });

// src/api/api.ts
import { defineApi } from "apixa";
import { users } from "./resources/users";

export const api = defineApi({
  baseURL: "/api",
  resources: { users },
});
```

This is a **shape example**. Before making real calls, verify that the installed Apixa version generates the intended built-ins, that your backend actually implements those routes, and that output shapes match. Some APIs need explicit operation selection/overrides or custom operations instead. Consult [Apixa Core docs](../../../../packages/core/README.md) and the installed package's public typings.

## What the agent should inspect first

The backend's actual routes, controllers/handlers, validators, serializers/response resources, auth, pagination and error behavior; and the frontend's current API calls, interceptors, shared request logic and consumers. For each route you use, you should be able to answer: what method/path does it accept, which inputs, what response shape, what errors, and which frontend callers depend on it?

**No invented backend capabilities:** A TypeScript operation signature does not mean that the endpoint exists. Backend code and tests take precedence over assumptions based on resource names.

## Features you should _not_ configure without a reason

| Feature                          | When useful                                                   | When to omit                                                   |
| -------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Runtime `schema`                 | Validate/transform meaningful input or response contracts     | Entity TypeScript types are sufficient for the project's needs |
| `paginationConfig`               | Backend truly paginates and its strategy/envelope is verified | Plain unpaginated lists                                        |
| Middleware                       | Shared auth or request lifecycle behavior is real             | Each endpoint already works with normal defaults               |
| Retry/timeout/idempotency        | Observed reliability or contract requirement                  | Generic defaults are already suitable                          |
| Response unwrap/transforms       | Real backend envelope or casing mismatch                      | Response already has desired shape                             |
| File handling options            | Upload/download endpoint needs them                           | Normal JSON requests                                           |
| `apixa/react` and TanStack Query | Application already needs React Query integration             | Core-only API calls with native Promises                       |
| Zod / `apixa/validation`         | Existing or justified runtime validation                      | No actual validator requirement                                |

Do not use an Apixa option to make an unrelated part of the application feel 'more advanced'. An option is useful only if it removes real duplication or correctly expresses a real requirement.

## What may improve compared with the old client

- Fewer hand-written CRUD request functions and URL builders.
- Better typed callers from resource/entity definitions and genuinely needed operation schemas.
- Shared API-wide behavior configured once, instead of copied per endpoint.
- Clear custom operations for unusual actions that do not fit CRUD.
- Fewer redundant response wrappers and parsing layers.
- Accurate server-side pagination and errors—_if_ the backend actually supports them.
- An explicit list of inconsistent backend contracts and missing Apixa capabilities.

These are improvements to architecture, not permission to change HTTP behavior or server rules without review.

## Acceptance checklist

- [ ] Previously used endpoints inventoried; backend evidence captured for each.
- [ ] Every used endpoint mapped or intentionally excluded with explanation.
- [ ] Only real resource/operation configurations added; no ornamental schemas or pagination.
- [ ] Method, URL, query/body encoding, authentication, response and errors preserved.
- [ ] Existing consumers migrated; redundant wrappers removed after confirming no callers.
- [ ] Typecheck and relevant tests passed, or unavailable checks honestly listed.
- [ ] Any unavoidable workarounds and genuine Apixa gaps documented separately.
- [ ] No unrequested backend change, library release or extra dependency migration.

## The final report you should expect

The agent should give you a concise endpoint coverage summary, files changed, actual verification results, useful frontend cleanups, recommended backend improvements and a ranked set of **evidence-backed Apixa capability gaps**. Missing features are findings to investigate, not problems to hide.
