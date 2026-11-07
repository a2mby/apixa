# Publish a release candidate

How `1.0.0-rc.N` reaches npm. Nothing in the repository publishes on its own.

1. **Verify a clean checkout of the release commit.**
   `pnpm install --frozen-lockfile && pnpm verify`. This builds the four packages, checks the module
   graph and the public API snapshot, runs the tests, installs the packed tarballs into clean projects
   (React 18/19, Vite, Next.js), runs real Chromium against the Next.js example, and runs the facade in
   `workerd` and the Vercel Edge Runtime.
2. **Check the account.** `pnpm verify:publish` is read-only. It prints who is logged in, who owns the
   `@apixa` scope, the 2FA mode, the publishing order, and dry-runs each publish. Fix anything under
   "Action required" first.
3. **Publish in dependency order**, each with the prerelease tag and a one-time password (the account
   uses 2FA for writes). Always use `pnpm publish`, never `npm publish`: pnpm rewrites the `workspace:`
   ranges in the manifests.

   ```bash
   pnpm --dir packages/core    publish --tag next --access public --otp=<code>
   pnpm --dir packages/mocking publish --tag next --access public --otp=<code>
   pnpm --dir packages/react   publish --tag next --access public --otp=<code>
   pnpm --dir .                publish --tag next --access public --otp=<code>
   ```

   `publishConfig` in each manifest already says `tag: next` and `access: public`, so a forgotten flag
   cannot move `latest`.

4. **Confirm.** `npm view <name> dist-tags` shows `next` at the new version and `latest` untouched
   (`apixa` currently has a `0.1.0` placeholder on `latest`).
5. **Smoke-test from the registry** in an empty project: `npm install apixa@next`, then import `apixa`.

Do not remove `publishConfig.tag` or move `latest` until the stable `1.0.0` decision is made.
