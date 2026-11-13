# Test a local build in a consumer app

Use this for every fix you want to try in a real app. Publishing to npm (including the
`experimental` dist-tag) is **not** part of routine development; keep it for testing by people outside
this checkout.

```sh
pnpm consumer:local
```

By default the consumer is `examples/frontends/nextjs-products`. Point at another project with
`--consumer <dir>` or `APIXA_CONSUMER=<dir>`. The consumer must already have its own dependencies
installed (`react`, `@tanstack/react-query`, …) and declare `apixa`.

## What it does

1. **Builds** with `pnpm build`.
2. **Packs** with `pnpm pack`, the command and `prepack` build a release uses, into
   `.local-pack/apixa-<version>.tgz` (git-ignored, replaced every run).
3. **Installs** the tarball's files as a real directory at `<consumer>/node_modules/apixa`,
   replacing whatever was there (the registry copy, a symlink, or a previous local build).
4. **Clears** `.next` and `node_modules/.cache` in the consumer, and touches its `tsconfig.json` (mtime only)
   so editors reload the new types. If an editor still shows old types, run "TypeScript: Restart TS Server".
5. **Verifies**:
   - `node_modules/apixa` is a real directory with no symlinks, and its files are byte-identical to
     the tarball;
   - all 14 public entries (`apixa`, `apixa/react`, `apixa/mocking/…`) resolve inside it, not into the
     repository or the pnpm store, and import under the consumer's Node;
   - `react` and `@tanstack/react-query` resolve to the consumer's single copy from both places;
   - the consumer's `package.json` and lockfiles are unchanged;
   - the consumer typechecks (`tsc --noEmit`, no incremental cache) against the packaged `.d.ts`.

Nothing is published, and the consumer's `package.json` and lockfiles are never edited.

## Options

| Option             | Effect                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `--skip-build`     | Skip `pnpm build`. `pnpm pack` still rebuilds the package, but workspace builds may be stale |
| `--no-typecheck`   | Skip the consumer typecheck                                                                  |
| `--build-consumer` | Also run the consumer's `build` (`next build`)                                               |
| `--verify-only`    | Re-check the installed copy against the last recorded pack; builds and installs nothing      |

## Why files are unpacked instead of `pnpm add file:…`

A `file:` dependency rewrites the consumer's `package.json` and lockfile, and a repeated install of the
same version can reuse a stored copy by name and integrity. Unpacking the tarball produces exactly
the directory a registry install produces, with no resolution step, no cache and no edits. `apixa`
has no runtime `dependencies`; its peers are the consumer's own.

## Things to know

- Restart a running `next dev`; the script deletes `.next`.
- If the consumer is a pnpm workspace member, `pnpm install` restores the registry copy. Re-run
  `pnpm consumer:local` afterwards (`--verify-only` tells you which one is installed).
- The local build has the same version number as `package.json`. The record of what is installed
  (tarball hash, git state) is in `<consumer>/node_modules/.apixa-local-pack.json`.
- This does not replace `pnpm verify`, `pnpm verify:consumers` or the release steps in
  [Publish Apixa to npm latest](./publish-a-release.md).

## When to publish to `experimental` instead

Only when someone without this checkout needs the build. Pick a fresh patch version, publish the
packed tarball with `npm publish <tarball> --tag experimental --access public`, and leave `latest`
alone. Never needed for your own testing.
