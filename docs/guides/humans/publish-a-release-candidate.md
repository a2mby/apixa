# Publish a release candidate

Only the root package `apixa` is published. Core, Mocking, React and shared workspaces all have
`private: true`; recursive publication skips them. Release commands target the root explicitly.
No npm organization scope is needed. The RC version is `1.0.0-rc.0`, ESM, Node.js >=22.

1. From the release checkout, run `pnpm install --frozen-lockfile && pnpm verify`.
   This checks source boundaries, the built graph and declaration closure, public API snapshots,
   unit/security tests, single-tarball consumers, React 18/19, TypeScript compatibility, Vite,
   Next Server Components, real Chromium hydration, workerd and Vercel Edge Runtime.
2. Run `pnpm verify:publish`. This reads the npm account and `apixa` permission, checks version
   availability, packs only root and runs `npm publish <tarball> --dry-run --tag next --access public`.
   It never publishes and does not need an OTP for the dry-run.
3. After release authorization, publish **only root**, supplying an OTP if npm requires one:

   ```sh
   pnpm --dir . publish --tag next --access public
   ```

   The account may require an OTP or a suitable granular token. Supply credentials through npm's
   secure flow. Root `publishConfig` defaults to `next` and public access. Do not move `latest`
   until the stable 1.0.0 release decision. No other package needs publication or installation.

4. Confirm `npm view apixa dist-tags`: `next` should point to the RC and `latest` remain unchanged.
5. Smoke-test `npm install apixa@next` in an empty project; for React add `react @tanstack/react-query`.

The migration and verification scripts do not publish, commit or push.
