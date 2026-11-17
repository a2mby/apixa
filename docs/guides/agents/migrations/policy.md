# Consumer migrations: evidence before configuration

Use this when migrating an existing frontend API layer to Apixa, or when changing these migration guides. It is the checklist for that work. It is not an instruction to migrate or modify other projects on your own.

1. Read [migrate-consumer-to-apixa.md](./migrate-consumer-to-apixa.md) and [audit-backend-endpoints.md](./audit-backend-endpoints.md). The shorter copy-paste entry for a consumer repository is [consumer-migration-prompt.md](./consumer-migration-prompt.md).
2. Audit the real backend endpoint contract and the current frontend consumers before choosing resources, operations, or settings. Do not invent backend endpoints, pagination envelopes, or response shapes.
3. Prefer `api.ts` plus domain files under `resources/`. `schema/` is optional and should exist only when validation earns its place. Skip ornamental Zod schemas, `paginationConfig`, middleware, and other advanced settings that the backend does not require.
4. Prefer a matching built-in, then a declarative custom operation. Keep imperative workarounds small. Verify the Apixa version installed in the consumer project. An ADR describes a decision; it is not proof that the installed release implements that design.
5. Preserve existing network and caller behavior. A cleaner structure does not authorize backend changes, unrelated framework changes, or a library release.
6. Record any SDK limitation in a [capability-gap report](./capability-gap-report.md). A declarative custom operation is supported behavior, not a gap by itself.
7. Keep the human guide [adopt-apixa.md](../../humans/migrations/adopt-apixa.md) and the guide indexes aligned when this policy changes.

Installing this text as `.ai/rules/apixa-consumer-migration.md` is a separate repository change. After that file is edited, run `pnpm ai:sync`. Do not hand-edit generated `AGENTS.md` or provider adapters.
