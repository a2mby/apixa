# Copy-paste prompt — migrate this project to Apixa

Use this prompt in the **consumer repository**. If you have access to the Apixa documentation, read the companion [migration protocol](./migrate-consumer-to-apixa.md), [backend audit](./audit-backend-endpoints.md) and [capability gap protocol](./capability-gap-report.md). Where those files are unavailable, follow this prompt as a self-contained minimum.

---

## Prompt

You are migrating **this frontend's existing API layer** to Apixa. First inspect the installed Apixa version and its real exported public API/types. Do not code against unimplemented ADR proposals or stale guides.

**Primary objective:** Create the smallest, cleanest, strongly typed, contract-accurate Apixa definition, substantially simpler than the original handwritten API code. More options and more schemas are not a better migration.

**MANDATORY: analyze the backend before choosing Apixa operations.** Identify available backend source, route registrations, controllers/handlers, validators/DTOs/serializers, authentication/permissions/middleware, actual query/body formats, responses/status codes, errors, pagination, file transfers and special routes. Trace each formerly used frontend API function to its real backend endpoint. Record method/path, contract, source evidence and confidence. If backend source is absent, use trustworthy API specifications and existing tests, explicitly label assumptions, and do not invent backend capabilities. Do not make destructive calls or contact production services during discovery.

**Target layout by default:**

```text
src/api/
  api.ts
  resources/
    users.ts
    products.ts
    ...
  schema/       # ONLY if real schemas are warranted
```

- Keep `api.ts` for one composed API plus minimal genuinely global settings.
- Create separate resource modules organized by backend/domain boundaries.
- Use current `createResource`/`defineApi` patterns supported by the installed Apixa version.
- Reuse current entity types; make new runtime schemas only when needed for validation/transformation or meaningful inference. Do not generate Zod or response schemas for every operation by habit; do not add Zod unless justified.
- Do not add `paginationConfig` unless that backend endpoint actually uses pagination with verified input names and envelope. Do not invent total counts/cursors.
- Use actual matching built-ins first, declarative custom operations second, imperative function operations only for truly exceptional needs. Never expose fake CRUD routes just because the SDK generates methods; use supported selection/override mechanisms.
- Configure only real requirements: auth, errors, transforms, serialization, retry, timeout, file transfer, middleware and advanced settings as needed; apply shared config at the highest **correct** scope without gratuitous duplication.
- Do not add unnecessary `adapters`, `factories`, `services`, `config` or other abstraction layers. Avoid wrapping Apixa calls with pass-through helpers.
- Core-only by default. Do not introduce React Query, framework integration, mocking or new dependencies unless already used or clearly required.
- Preserve request methods, paths, parameters, query encoding, payloads, headers, credentials, error handling, response formats, cancellation and caller-visible behavior. Fix needless duplication without changing backend contracts.
- Check existing frontend consumers and migrate them; do not stop after declaring resources.

**Most important discovery goal:** Identify missing Apixa capabilities based on real backend requirements. Classify all difficult cases as one of `DIRECT`, `CONFIGURATION`, `APPLICATION`, `BACKEND`, `APIXA_GAP` or `UNKNOWN`. Do not label an ordinary custom declarative endpoint as unsupported. Before calling something an `APIXA_GAP`, verify installed public typings/docs/source and provide route evidence, a small reproduction, why existing features are insufficient, the smallest workaround, and a proposed clean public API improvement. Do not hide gaps behind complex wrappers or unsafe casts. Keep backend improvement suggestions separate; do not modify backend code without authorization.

**Implementation:** Inspect and design, then make the migration in the current repo. Run relevant typechecks and existing tests. For verification compare old/new method, URL/query, body encoding, auth, response and error behavior on representative routes; do not hit production or mutate backend data. Remove obsolete code only after all callers are migrated.

**Final response:** Give (1) backend endpoint inventory / frontend use map with evidence and unresolved unknowns; (2) final minimal file structure and why each optional file exists; (3) converted resources and caller changes; (4) endpoint coverage and actual verification performed; (5) significant improvements over the original API layer; (6) ranked, reproducible Apixa capability gaps; and (7) separately ranked backend improvement suggestions. Be explicit about what has **not** been verified. Do not publish Apixa, alter backend contracts or make unrelated architectural changes.
