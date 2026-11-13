# v1.9.0 — Scope

Core-only. No new package; React/mocking packages change only if a bug fix requires it.

## In scope

| Area                     | Included work                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live pagination: default | `pagination: "page" \| "cursor"` (string) keeps meaning apixa's own shape; for live resources `getAll` reads and validates that shape at runtime                                                                                                                         |
| Live pagination: preset  | `pagination: { type, preset }` maps a known backend shape: `laravel`, `laravel-paginator` (page and cursor), `strapi`, `payload`, `nestjs`. Only pure 1-based field mappings; presets that need offsets, headers or request-derived values (Django REST, Spring) are out |
| Live pagination: object  | `pagination: { type, fields: { data, total, page, pageSize \| nextCursor }, params: { page, pageSize, cursor } }` using dot paths for response fields and query parameter names                                                                                          |
| Live pagination: escape  | `parseList(body, ctx)` function for shapes the object cannot describe                                                                                                                                                                                                    |
| Errors                   | Missing or wrong-typed mapped field throws `ParseError` naming the resource and path                                                                                                                                                                                     |
| Types                    | `PaginatedListOf` and `PaginationQueryOf` infer from the new config; query type exposes apixa's `page`/`pageSize`/`cursor`                                                                                                                                               |
| Mock parity              | Mock engine output is unchanged and still satisfies the same contract                                                                                                                                                                                                    |
| DX/bug backlog           | Further DX and bug fixes discovered after the first item, each recorded in the plan with a test before it is added                                                                                                                                                       |
| Example                  | `examples/frontends/nextjs-products` consumes the Laravel preset instead of reading the raw envelope                                                                                                                                                                     |
| Docs                     | `docs/conventions.md`, `docs/public-api.md`, roadmap and story updated                                                                                                                                                                                                   |

## Out of scope

| Item                                         | Reason                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| Auto-detecting pagination fields             | Guessing yields silently wrong data                   |
| Hard-coding any backend inside Core logic    | Presets are declarative data only                     |
| Schema validation hooks, auth, cache helpers | Separate planned milestones                           |
| New packages, OpenAPI, Vue/Angular adapters  | Not part of a DX/bug release                          |
| Version bump or npm publish                  | Owner-requested release step, separate from this      |
| Changes to the Laravel backend example       | It already behaves correctly; the SDK is what changes |
| Changes to frozen milestone folders          | Preserve history                                      |
