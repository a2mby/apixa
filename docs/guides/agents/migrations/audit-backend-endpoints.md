# Audit backend endpoints before an Apixa consumer migration

**Status:** Mandatory reconnaissance phase of [migrate-consumer-to-apixa.md](./migrate-consumer-to-apixa.md).  
**Objective:** derive the _actual_ backend HTTP contract, not one inferred from frontend wrappers or route names. This is a read-first, non-destructive audit.

## 1. Evidence order and confidence

Inspect available sources in this order, while recording conflicts:

1. **Route registration / compiled route inventory:** HTTP method, full path, route groups, prefixes and versioning.
2. **Controller/handler implementation:** real business behavior, route bindings, mutation semantics, status codes and branches.
3. **Request validators, DTOs, serializers and response resources:** accepted inputs, defaults, coercion, exact wire output.
4. **Authentication and middleware:** cookies/tokens, role/permission requirements, rate limits, error translation, pagination, CORS where relevant.
5. **Database model and relationships:** identify entity shape and path relationships but **do not equate DB models with public response DTOs**.
6. **OpenAPI/Swagger or formal documentation:** compare it with current code; note when stale.
7. **Backend integration tests and example requests:** concrete payload and failure cases.
8. **Frontend actual usage:** callers, request composition, post-processing, assumptions and unused routes.

Use confidence labels `verified-in-code`, `verified-by-test`, `documented-only`, `frontend-inferred`, and `unknown`. A route listing confirms a route exists; it does not prove what JSON it returns.

## 2. Framework-oriented discovery (examples, not mandatory commands)

| Backend              | Inspect                                                                                                                               | Notes                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laravel              | `routes/api.php`, route groups, `php artisan route:list --path=api`, controller methods, FormRequests, Resources, policies/middleware | Distinguish `paginate()`, `cursorPaginate()`, `simplePaginate()`, resource collections, and custom envelopes; inspect implicit bindings and Laravel 422 errors. Run CLI only in safe local/dev context. |
| Django + DRF         | project/app `urls.py`, routers, ViewSets, serializers, permissions, pagination classes, exception handlers                            | Check filter_backends, nested routers, per-action serializers and throttle settings.                                                                                                                    |
| Next.js handlers     | `app/**/route.ts`, `pages/api/**`, middleware, schema modules                                                                         | Check server vs edge runtime, method handlers, cookies and response types.                                                                                                                              |
| Express/Fastify/Nest | registered routers/controllers, prefixes, guards, pipes, serializers, interceptors                                                    | Check global base paths/versioning and actual handler configuration.                                                                                                                                    |
| Rails                | routes, controllers, strong parameters, serializers and responders                                                                    | Distinguish HTML/JSON responders and framework-generated errors.                                                                                                                                        |
| Any                  | OpenAPI/Swagger, integration tests and concrete HTTP fixtures                                                                         | Trust the implemented behavior over stale documentation; escalate contradictions.                                                                                                                       |

Do not automatically call production endpoints, run write requests, deploy changes, run migrations, seed data or inspect secret values. Reading local route inventory, source and tests is preferred.

## 3. Endpoint inventory fields — every relevant route

Fill these fields as applicable. `unknown` is valid and better than guessing.

| Field         | Questions                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Identity      | Method, canonical path, prefix/version, controller/handler, route name                                        |
| Domain        | Which resource/group owns it? Is it CRUD, list, search, action, aggregate, upload, download or workflow?      |
| Paths         | Required/optional path placeholders, constraints, nested resource relationships, identifier types             |
| Query         | Names, arrays/nesting, null/empty handling, booleans, defaults, filters, ordering, search, page/cursor/offset |
| Body          | Content type, optional/required fields, JSON/multipart/text/binary, coercion, form-field naming, max sizes    |
| Auth          | Token/cookie/CSRF, scopes/roles/permissions, token-refresh behavior, public vs restricted                     |
| Output        | Status, content type, shape, envelope, nullable/void/list/binary/stream, transformed fields, headers          |
| Pagination    | Does it paginate? Mode, input keys, response metadata, next/prev rules, unknown totals                        |
| Errors        | Validation, 401/403, 404, conflict, not-found-as-null, throttling, transient 5xx, rate-limit metadata         |
| Consistency   | Idempotency, ETags/If-Match, optimistic concurrency, retry-safe behavior                                      |
| Relationships | Nested routes, references, side effects, bulk operations                                                      |
| Frontend      | Existing function(s), call sites, old-side transformations, current type definitions                          |
| Evidence      | File/function/test citations, confidence, unresolved ambiguities                                              |

**Protocol and semantics matter.** Two endpoints both named `list` can have incompatible envelopes; two endpoints both named `update` can differ in HTTP method and body semantics.

## 4. Backend mapping: choose the right Apixa capability

- Matching conventional resource behavior → consider an Apixa built-in; confirm the actual URL/method/response contract.
- A distinct action, search endpoint, metric or otherwise non-CRUD route → prefer a declarative custom operation.
- A shared cross-resource concern observed in code → minimal API-wide configuration.
- A concern shared only within one resource → resource configuration; a one-off concern → operation configuration.
- No server-side pagination → **no pagination config**. Server-side pagination → map real request names and actual envelope, never fabricate `total` or cursors.
- Real runtime validation requirement → use existing validators where possible; response schemas should describe the final value after any documented normalization. No validator requirement → typed entities may suffice.
- Complex protocol or behavior not expressible via public Apixa declaration → document as workaround or candidate gap; don't make the resource unreadable.

The installed Apixa version is the source of truth for available options and signatures. Beware outdated examples and proposed features in ADRs that have not shipped.

## 5. Improve the contract design (advisory; don't modify backend)

During the audit, record useful **backend improvement suggestions** separately from required frontend compatibility:

- Inconsistent naming or serialization across comparable routes.
- Duplicated endpoints providing equivalent data with different envelopes.
- Unclear pagination (missing end-of-list semantics, mixed cursor/page names, contradictory metadata).
- Ambiguous success/error responses, nonstandard status codes, undocumented `204`/null behavior.
- Validation mismatches (server accepts fields that API docs disallow or vice versa).
- Unsafe or missing auth and permission controls, idempotency issues on retried writes.
- Hidden N+1/list performance problems, missing server-side filtering when the frontend currently downloads everything.
- Unstable identifiers and inconsistent nested route patterns.
- Unnecessary backend complexity that would be simpler to standardize than to hardcode into every client.

Recommendations must say whether they require a **breaking backend change**, whether the current frontend can remain compatible, and what tests/migration would be needed. Never implement backend recommendations automatically.

## 6. Backend contract table template

| ID    | Method + path                 | Handler/evidence                          | Input/query/auth       | Success/error behavior | Existing frontend caller | Apixa mapping                                  | Confidence      | Notes            |
| ----- | ----------------------------- | ----------------------------------------- | ---------------------- | ---------------------- | ------------------------ | ---------------------------------------------- | --------------- | ---------------- |
| E-001 | `GET /api/users`              | `routes/api...` → `UsersController@index` | `role?`, auth required | JSON array (verify)    | `usersService.list`      | `users.getAll` **only if exact shape matches** | documented-only | confirm response |
| E-002 | `POST /api/users/:id/suspend` | handler/test path                         | no body? verify        | `204`? verify          | `suspendUser`            | declarative `suspend`                          | unknown         | inspect handler  |

These example rows are **hypothetical**. Replace every claim with actual project evidence and remove unverified examples from the final project report.

## 7. Analysis beyond endpoint translation

Check whether the backend enables a better Apixa design than the old frontend captured:

1. A true resource boundary (one resource may include several related operations, even if old client split them into multiple service files).
2. Shared serialization/auth/response rules that can be inherited, reducing duplication.
3. Correct built-in selection or override based on endpoint semantics, not naming convention.
4. Contract-accurate inference for list, action, aggregate, void and binary responses.
5. Existing backend validation/schema sources that can be reused _without duplicating schemas_.
6. Actual pagination strategy/preset, only where supported.
7. Server capabilities that make old client-side filtering, sorting, retries or manual transforms redundant.
8. Gaps in Apixa abstractions discovered through repeated, evidence-backed awkward definitions.

**Deliverables:** endpoint inventory, verified mappings, unresolved unknowns, backend improvement suggestions and evidence-linked Apixa capability gaps. Continue to implementation only after required formerly-used routes have a known mapping or a documented exception.
