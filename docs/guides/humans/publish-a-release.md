# Publish Apixa to npm latest

Only the root package `apixa` is published. Core, Mocking, React and shared workspaces all have
`private: true`; recursive publication skips them. Release commands target the root explicitly.
No npm organization scope is needed. Release an approved, previously unpublished SemVer version (prereleases are allowed). ESM, Node.js >=22.

1. From the release checkout, run `pnpm install --frozen-lockfile && pnpm verify`.
   This checks source boundaries, the built graph and declaration closure, public API snapshots,
   unit/security tests, single-tarball consumers, React 18/19, TypeScript compatibility, Vite,
   Next Server Components, real Chromium hydration, workerd and Vercel Edge Runtime.
2. Run `pnpm verify:publish`. This reads the npm account and `apixa` permission, checks version
   availability, packs only root and runs `npm publish <tarball> --dry-run --tag latest --access public`.
   It never publishes and does not need an OTP for the dry-run.
3. After release authorization, publish **only root**, supplying an OTP if npm requires one:

   ```sh
   pnpm --dir . publish --tag latest --access public
   ```

   The account may require an OTP or a suitable granular token. Supply credentials through npm's
   secure flow. Root `publishConfig` defaults to `latest` and public access. This is a beta-stage library; `latest` intentionally points to the newest approved release, including prereleases. No other package needs publication or installation.

4. Confirm `npm view apixa dist-tags`: `latest` must point to the newly published version.
5. Smoke-test `npm install apixa@latest` in an empty project; for React add `react @tanstack/react-query`.

The migration and verification scripts do not publish, commit or push.
