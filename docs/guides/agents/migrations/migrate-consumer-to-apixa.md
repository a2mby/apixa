# Migrate an existing consumer project to Apixa (agent protocol)

**Audience:** AI coding agents adapting an existing application to Apixa.  
**Purpose:** preserve the real backend contract while replacing repetitive frontend API plumbing with the smallest accurate Apixa definition.  
**Companion:** [Backend endpoint contract audit](./audit-backend-endpoints.md), [Capability gap report](./capability-gap-report.md), [human guide](../../humans/migrations/adopt-apixa.md).

> **Primary rule:** Use as little Apixa configuration as the real backend needs. Never add features merely because Apixa offers them. The quality of an advanced migration is measured by contract coverage, correctness, useful type inference, and eliminated duplication—not the number of options configured.

## Scope, priority, and version gate

1. Identify the target consumer repository, backend repository or integrated backend, and installed version and supported entry points of `apixa` **before** writing code. Prefer installed typings/source and the public guide for that version to hypothetical ADR designs. If a capability exists only in an accepted _design_ ADR, treat it as not implemented until proven otherwise.
2. Work only on the requested API migration. Do not edit backend behavior, publish libraries, alter npm tags, upgrade Apixa itself, add a state-management framework, or replace unrelated frontend architecture without an explicit authorization.
3. Analyze **both backend and frontend**, using [audit-backend-endpoints.md](./audit-backend-endpoints.md). An existing frontend function is evidence of consumer behavior, not proof that its URL/method/shape is the backend's canonical contract.
4. If backend code is unavailable, use available OpenAPI/docs, mock fixtures, integration tests and network traces. Clearly mark unknowns and confidence. Do not invent endpoint support.
5. Keep the old API layer intact until consumers and verification are complete. Remove dead wrappers and dependencies only after proving no remaining uses.

## Required migration phases

### Phase A — Inventory, before implementation

- Enumerate all backend endpoints potentially used by this frontend, including controllers, request validators, serializers/DTOs, guards, middleware, versioned prefixes, and actual query/body/response handling. Resolve nested path placeholders and aliases. Follow routes to implementation; do not stop at URL lists.
- Inventory existing API entry points (`fetch`, Axios, SDKs, manually composed URLs), interceptors, authentication, cookies, retries, request/response transforms, error handlers, upload/download functions, and callers.
- Build a **backend ↔ frontend contract map**: method, full route, controller/action, resource, operation intent, request inputs, response and errors, auth, actual callers, evidence, compatibility risk. Use the backend audit guide.
- Identify duplicate code, unnecessary adapters, unused endpoints, missing types and inconsistent response handling. Record them; do not silently change semantics.

### Phase B — Design the smallest viable Apixa layer

Prefer the following structure, adapted to project conventions:

```text
src/
  api/
    api.ts               # single assembled API entry point
    resources/
      users.ts            # users resource definition
      products.ts         # products resource definition
      orders.ts           # orders resource definition
    schema/               # OPTIONAL — only real runtime validation needs
      users.ts
```

Rules:

- **`api.ts`** composes exported resources and minimal API-wide configuration. It is not a dumping ground for validators or business rules.
- **`resources/`** has focused resource definitions grouped by domain. Keep paths, operations, and genuinely necessary resource-level settings together. Prefer `createResource<Entity>()(...)` where compatible with the _installed_ Apixa version and existing domain types; otherwise use the supported `defineApi` style.
- **`schema/`** is optional. Keep only useful, reusable request/response schemas; use existing model types and validators where possible. Do not create schema files simply to make a resource typed.
- No mandatory `config/`, `definitions/`, `factories/`, `adapters/`, `services/`, `helpers/`, `types/` or extra layer merely to imitate an abstract framework. Add a file only for an actual cross-resource concern or a demonstrated maintainability benefit.
- Use a single API entry point for one actual backend/API boundary. Separate APIs only for distinct backend boundaries that justify independent configuration.
- Avoid introducing TanStack Query, `apixa/react`, Zod, mocking, generators, or extra dependencies if the application does not need them. Core-only consumers use `apixa`/`apixa/core` and native Promises.

Minimal, illustrative shape (confirm installed signatures):

```ts
// api/resources/users.ts
import { createResource } from "apixa";
import type { User } from "../../features/users/user.types";

export const users = createResource<User>()({ path: "/users" });

// api/api.ts
import { defineApi } from "apixa";
import { users } from "./resources/users";

export const api = defineApi({
  baseURL: "/api",
  resources: { users },
});
```

**This shape is illustrative, not a grant to expose every default operation.** Check which built-ins are actually created by the installed version and whether their backend routes exist. Restrict, override, or replace built-ins using supported operation-selection controls when required. Do not assert an operation is supported because its TypeScript method exists.

### Phase C — Endpoint-to-operation mapping

For each verified route:

1. Prefer an **accurate built-in operation** when its method, URL, parameters, inputs and output semantics match the backend. Do not force a REST-shaped builtin onto a different endpoint.
2. Otherwise prefer a **declarative custom operation**. This is normal Apixa support, not evidence that Apixa is missing a feature.
3. Use operation overrides only for genuine deviations (e.g. endpoint-specific method/path/response envelope).
4. Reserve **function operations or manual `ctx.request` composition** for behavior not expressible declaratively. If many are needed for the same structural reason, investigate a potential Apixa feature gap.
5. Use API-wide defaults only when they truly apply API-wide, and resource `settings` only for that resource. Operations do not accept a `settings` object. Override one operation with its own `timeout`, `retry`, `response`, `middleware`, or `schema` fields. Avoid copying inherited values onto every resource or operation. Confirm `settings` exists in the installed release before using it.
6. Add pagination only when actual endpoints paginate. Select the real strategy and real envelope. Never add `paginationConfig` by reflex; do not invent `total`, cursors, or navigation metadata. Verify preset compatibility before using it.
7. Add request/response schemas only for actual validation or inference value. Prefer existing validation libraries if already in the app. Do not generate Zod objects for every endpoint by habit. TypeScript entity types and runtime validation are separate concerns; choose consciously.
8. Add transforms, response unwrap, retry, timeout, idempotency, file rules, middleware or advanced settings only when required by an observed contract or cross-cutting operational policy. Keep unusual behavior explicit.
9. Do not replace a shared auth interceptor without tracing refresh, token storage, cookie credentials, retry order, SSR constraints and 401 handling. Never expose server-only secrets in browser code.
10. Preserve exactly: HTTP method, URL/path placeholders, query serialization, request encoding/body, headers/cookies, request cancellation, success response, error semantics and important caller-visible types.

### Phase D — Improve the original design _without_ breaking contracts

The new code should be **cleaner than both the old implementation and a mechanical translation**:

- Eliminate duplicated URL joining, repetitive CRUD functions, redundant serialization, and disconnected request/response types where Apixa already solves them.
- Prefer centralized, domain-aligned resource definitions rather than copies of each old service file.
- Replace repeated home-grown network mechanisms only after verifying equivalent behavior and fewer moving parts.
- Preserve business workflows at their appropriate application layer; a backend contract definition must not become a UI state container or business orchestration service.
- Use strong inference from existing entity contracts and necessary operation schemas; do not introduce `any`, unsafe casts, fabricated response types, or giant manual state interfaces just to quiet the compiler.
- Distinguish frontend-only computed values, backend-supported filters, and endpoint-specific parameters. Do not add fictitious filters or undocumented sorting.
- Respect intentional per-operation response formats: `void`, scalar, list, object, Blob, text, stream, etc. Do not force them into entity-shaped objects.
- Prefer deletion of proven redundant code over creating thin pass-through wrappers around Apixa methods.

### Phase E — Unsupported behavior / improvement discovery

Create the [capability gap report](./capability-gap-report.md) with **evidence for each finding**. Classify each need as:

- **DIRECT:** existing built-in operation or ordinary declarative custom operation already covers it.
- **CONFIGURATION:** built-in Apixa feature covers it with necessary configuration.
- **APP-LEVEL:** business logic belongs outside an API-definition SDK; not an Apixa gap.
- **BACKEND ISSUE:** the backend contract itself is inconsistent, insecure, ambiguous or needlessly difficult.
- **APiXA GAP:** a genuine recurring, relevant contract cannot be represented cleanly with supported public features.
- **UNKNOWN:** insufficient evidence to decide; never fake a solution.

**No fake support.** If an endpoint requires a workaround, name the workaround, why it is necessary and the trade-off. Don't add ten helper files that conceal a missing capability. A declarative custom operation by itself is NOT a defect; a structural inability to express a common contract may be.

For a genuine Apixa gap, provide an isolated reproduction, backend example, current limitation, public API design suggestion, expected type/runtime behavior, alternatives, compatibility implications, and priority. Do not implement unapproved core features as part of a consumer migration.

### Phase F — Verification and completion

- Map **every previously used endpoint** to an Apixa equivalent or an explicit documented exception. Do not silently drop a rarely used call.
- Verify representative request/response parity using available tests, mock fixtures or a safely configured local/dev backend: method, path, path/query values, headers, cookies, body, form data, pagination, status handling, errors, files and cancellation as applicable.
- Run relevant typecheck, lint and tests. Do not contact production APIs, make destructive backend changes, or run production migrations as an accidental part of verification. If tests cannot run, state what remains unverified.
- Check client call sites and runtime consumers, not only API definitions.
- Remove old API wrappers, interceptors and imports only when unused and behaviorally replaced; avoid massive unrelated cleanup.
- Finish with a compact migration report: changed files, endpoints mapped / deliberately excluded, improvements, tests actually run, behavior differences if any, unknowns, backend suggestions and Apixa gaps.

## Anti-patterns: reject these reviews

| Anti-pattern                                                          | Preferred response                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Generate `schema/` and 50 schemas solely because Zod is available     | Use existing types; add only valuable runtime validation       |
| Add `paginationConfig` to every resource                              | Add only on real paginated routes with verified envelope       |
| Put every Apixa setting in `api.ts`                                   | Configure minimal true API-wide defaults and scoped exceptions |
| Define custom operations for basic matching CRUD with no reason       | Use verified built-ins                                         |
| Rely on default CRUD methods for endpoints backend does not implement | Restrict or replace unsupported operations                     |
| Create generic SDK factories before migrating two resources           | Use direct `createResource` or supported definitions           |
| Keep Axios/FETCH wrappers that only call equivalent Apixa methods     | Update callers and delete proven redundancy                    |
| Force an odd endpoint into a built-in and alter client expectations   | Declare it as a custom operation                               |
| Hide unsupported behavior inside brittle hooks or unsafe casts        | Name the limitation and report it                              |
| Add mock handlers to production resources without need                | Keep production definitions minimal                            |
| Rewrite backend behavior to make Apixa look compatible                | Preserve backend; propose change separately                    |
| Claim a feature is absent after checking only the README              | Inspect installed version, public types and implementation     |
| Create a separate resource for each HTTP verb/action                  | Group related domain endpoints under meaningful resources      |

## Required output format

1. **Backend map:** evidence-based route and contract inventory.
2. **Proposed layout:** minimal files and resource boundaries, with justification for optional directories.
3. **Migration:** code changes and caller updates.
4. **Coverage:** mapped, intentionally excluded and unknown endpoint counts (no fabricated percentages).
5. **Apixa gap report:** direct/config/app/backend/core gap classification, with reproducible cases.
6. **Verification:** executed checks and honest limitations.

**Done** means a smaller, clearer frontend API layer that accurately covers all previously supported consumer behavior, plus a useful list of genuine Apixa improvement opportunities.
