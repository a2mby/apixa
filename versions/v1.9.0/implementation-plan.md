# v1.9.0 — Implementation plan

## Design decisions to lock

1. `pagination` accepts the existing string or an object `{ type: "page" | "cursor", preset?, fields?, params? }`; `preset` and `fields` are mutually exclusive (`ConfigError`).
2. String form on a live resource stays a type-only declaration: the body is passed through untouched (an existing test and current consumers rely on this). Validation applies only to the object forms. Decided during implementation.
3. `fields` values are dot paths into the response body; `params` renames apixa's `page`/`pageSize`/`cursor` query keys (Laravel: `pageSize` → `per_page`).
4. Presets live in one data table (`laravel`, `laravel-paginator`, `strapi`, `payload`, `nestjs`). A preset is added only for a pure 1-based field mapping, checked against the documented shape; the Laravel ones were also checked against real output of the playground backend. Django REST (no page or page size in the body) and Spring (0-based) are deliberately not presets.
5. `parseList(body, { query, status })` is the single escape hatch and wins over `fields`/`preset`.
6. The mapping runs in the live request pipeline after the body is parsed and before response key transforms; mocks bypass it.
7. `getAll` with `full: true` returns the mapped page in `response.data`; the raw body is not exposed. Decided during implementation (mapping runs before response middleware).
8. Mapping applies to live `getAll` only (the only operation typed as paginated); `search` is not changed.

## Ordered steps

1. Add a failing test that a live `getAll` against a Laravel-shaped body returns apixa's page contract.
2. Extend `pagination` in `types/definition.ts` and `api/validate.ts`; keep string-form validation messages.
3. Add the pagination mapper (dot-path reader, preset table, `parseList`) in `api/pagination.ts` and wire it into `request/pipeline.ts` for live `getAll`.
4. Map `pageSize`/`page`/`cursor` query keys on the way out.
5. Update `PaginatedListOf` / `PaginationQueryOf` inference for object config.
6. Switch the `nextjs-products` example to the Laravel preset. Blocked until a release: the example resolves the published `apixa@2.0.0`, not this checkout.
7. Update docs; then triage further DX/bug items one at a time, each with a test.

## File touch list

- `packages/core/src/types/definition.ts`, `types/inference.ts`, `api/validate.ts`, `api/resource-client.ts`
- `packages/core/src/request/pipeline.ts` plus one new pagination module under `packages/core/src/`
- `packages/core/src/**/*.test.ts` and `tests/`
- `examples/frontends/nextjs-products/src/shared/lib/api/api.ts`
- `docs/conventions.md`, `docs/public-api.md`, `docs/roadmap.md`, `docs/story.md`, `docs/context.md`
- `versions/README.md`, `versions/v1.9.0/*`

## Explicit non-steps

No auto-detection, no backend-specific branches in the pipeline, no new package, no version bump, no npm publish, no changes to the Laravel example or frozen milestones.
