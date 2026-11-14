# Scripts

Build, verification, dataset, and AI-sync scripts for the Apixa repository.

Starter templates under `templates/` are postponed until the Apixa API stabilizes (see
[`templates/README.md`](../templates/README.md)), and local playground apps live in `manual-testing/`
(gitignored).

## Layout

```text
scripts/
  lib/        JavaScript helpers imported by the verification scripts
  datasets/   dataset collection builder (`pnpm datasets:build`)
  *.mjs       build, architecture, API, consumer, browser, and Edge verification scripts
  *.sh        repository sync helpers (`sync-agent-rules.sh`)
```

## Verification scripts

| Command                   | Script                               | Purpose                                                                 |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `pnpm check:architecture` | `scripts/check-architecture.mjs`     | Package boundaries, cycles, leakage, and facade parity                  |
| `pnpm check:api`          | `scripts/verify-public-api.mjs`      | Export parity, declarations, snapshot, and doc import checks            |
| `pnpm verify:consumers`   | `scripts/verify-*`                   | Packed-tarball Node, React 18/19, Vite/Next, and type checks            |
| `pnpm verify:browser`     | `scripts/verify-browser.mjs`         | Chromium SSR/hydration/transfer checks on `tests/fixtures/browser-next` |
| `pnpm verify:edge`        | `scripts/verify-edge.mjs`            | Cloudflare `workerd` and Vercel Edge Runtime packed checks              |
| `pnpm consumer:local`     | `scripts/local-package-consumer.mjs` | Unpack local `apixa` tarball into a local consumer project              |
