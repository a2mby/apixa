// Read-only publication readiness check. It NEVER publishes:
//   - the only `publish` invocations are pnpm/npm `--dry-run` (asserted in code before running);
//   - every npm account command is a read (`whoami`, `profile get`, `org ls`, `access list`, `view`).
// It prints a dependency-safe publishing order, the account's actual permissions, and the exact
// manual commands a maintainer runs. Tokens and OTPs are never read or printed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = [
  ["apixa", "."],
  ["@apixa/core", "packages/core"],
  ["@apixa/mocking", "packages/mocking"],
  ["@apixa/react", "packages/react"],
];
const manifests = new Map(
  PACKAGES.map(([name, dir]) => [
    name,
    { dir, ...JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) },
  ]),
);

function capture(command, args, cwd = root) {
  try {
    return {
      ok: true,
      out: execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

// ---- 1. Dependency-safe order (dependencies and peers among the four packages) -----------------------------------------
const order = [];
const visiting = new Set();
const visit = (name) => {
  if (order.includes(name)) return;
  assert.ok(!visiting.has(name), `dependency cycle at ${name}`);
  visiting.add(name);
  const m = manifests.get(name);
  const needs = Object.keys({ ...m.dependencies, ...m.peerDependencies }).filter((d) =>
    manifests.has(d),
  );
  for (const dep of needs.sort()) visit(dep);
  visiting.delete(name);
  order.push(name);
};
for (const [name] of [...PACKAGES].sort(([a], [b]) => a.localeCompare(b))) visit(name);
assert.deepEqual(
  order,
  ["@apixa/core", "@apixa/mocking", "@apixa/react", "apixa"],
  "publishing order",
);
const version = manifests.get("apixa").version;
for (const [name, m] of manifests) {
  assert.equal(m.version, version, `${name} version`);
  assert.match(version, /^1\.0\.0-rc\.\d+$/, "a release candidate version");
  assert.deepEqual(
    m.publishConfig,
    { access: "public", tag: "next" },
    `${name} publishConfig (bare publish must not touch latest)`,
  );
}
console.log(
  `Publishing order (each package after everything it depends on): ${order.join(" -> ")}`,
);
console.log(`Version ${version}, dist-tag next, access public (from each package's publishConfig)`);

// ---- 2. Account, scope and package permissions (read-only) ------------------------------------------------------------------
const report = [];
const who = capture("npm", ["whoami"]);
const user = who.ok ? who.out.trim() : null;
report.push(["authenticated npm user", user ?? "NOT AUTHENTICATED (run `npm login`)"]);
if (user) {
  const profile = capture("npm", ["profile", "get", "--json"]);
  let tfa = "unknown";
  try {
    tfa = JSON.parse(profile.out).tfa?.mode ?? "disabled";
  } catch {
    /* leave unknown */
  }
  report.push(["two-factor mode", tfa]);
  const org = capture("npm", ["org", "ls", "apixa", "--json"]);
  let role = null;
  let members = {};
  try {
    members = JSON.parse(org.out);
    role = members[user] ?? null;
  } catch {
    /* no such org or no access */
  }
  report.scopeMembers =
    Object.entries(members)
      .map(([m, r]) => `${m} (${r})`)
      .join(", ") || "none visible";
  report.push(["members of the @apixa scope", report.scopeMembers]);
  report.push([
    "this account's role in the @apixa scope",
    role ?? "none: this account cannot publish @apixa/* packages",
  ]);
  const access = capture("npm", ["access", "list", "packages", "--json"]);
  let packages = {};
  try {
    packages = JSON.parse(access.out);
  } catch {
    /* ignore */
  }
  report.push(["permission on the unscoped `apixa` package", packages.apixa ?? "none"]);
  const scoped = Object.keys(packages).filter((p) => p.startsWith("@apixa/"));
  report.push([
    "existing @apixa/* packages",
    scoped.length ? scoped.join(", ") : "none yet (first publish creates them)",
  ]);
  const maintainers = capture("npm", ["view", "apixa", "maintainers", "--json"]);
  report.push([
    "maintainers of `apixa`",
    maintainers.ok ? maintainers.out.trim().replace(/\s+/g, " ") : "unreadable",
  ]);
  report.canPublishScope = role === "owner" || role === "admin";
  report.canPublishApixa = packages.apixa === "read-write";
  report.tfa = tfa;
}
for (const [name] of PACKAGES) {
  const view = capture("npm", ["view", `${name}@${version}`, "version"]);
  report.push([
    `${name}@${version} already on the registry`,
    view.ok && view.out.trim() ? "YES (cannot republish)" : "no (free to publish)",
  ]);
}
const tags = capture("npm", ["view", "apixa", "dist-tags", "--json"]);
report.push(["current `apixa` dist-tags", tags.ok ? tags.out.trim().replace(/\s+/g, " ") : "none"]);

console.log("\nnpm account and registry state:");
for (const [key, value] of report) console.log(`  ${key.padEnd(46)} ${value}`);

// ---- 3. Dry runs only ------------------------------------------------------------------------------------------------------------
console.log("\nDry-run publish (nothing is uploaded):");
for (const name of order) {
  const { dir } = manifests.get(name);
  const args = ["publish", "--dry-run", "--no-git-checks", "--tag", "next", "--access", "public"];
  assert.ok(args.includes("--dry-run"), "refusing to run a publish command without --dry-run");
  const result = capture("pnpm", args, join(root, dir));
  assert.ok(result.ok, `${name}: pnpm publish --dry-run failed:\n${result.out}`);
  assert.match(
    result.out,
    new RegExp(`${name.replace("/", "\\/")}@${version.replace(/\./g, "\\.")}`),
    `${name}: dry run did not name the release`,
  );
  assert.ok(
    !/workspace:/.test(result.out),
    `${name}: dry-run output mentions an unresolved workspace range`,
  );
  console.log(`  ${name}@${version}: ok (tag next, access public)`);
}

// ---- 4. What a maintainer must do -------------------------------------------------------------------------------------------------
console.log(
  "\nManual publication steps (NOT run by this script), from a clean checkout of the release commit:",
);
console.log("  pnpm install --frozen-lockfile && pnpm verify");
for (const name of order) {
  console.log(
    `  pnpm --dir ${manifests.get(name).dir} publish --tag next --access public --otp=<code>   # ${name}`,
  );
}
console.log(
  "  # then confirm: npm view <name> dist-tags  (next -> " + version + "; latest untouched)",
);

const blockers = [];
if (!user) blockers.push("npm is not authenticated: run `npm login`.");
else {
  if (!report.canPublishScope) {
    blockers.push(
      `the @apixa npm scope belongs to ${report.scopeMembers}, not to ${user}: publish as that owner, have them add ${user} (a user scope must be converted to an org first), or choose a scope this account controls.`,
    );
  }
  if (!report.canPublishApixa)
    blockers.push("this account has no read-write permission on `apixa`.");
  if (report.tfa === "auth-and-writes")
    blockers.push(
      "2FA requires a one-time password (--otp) or a granular token with 2FA bypass for every publish; this script cannot supply either.",
    );
}
console.log(
  blockers.length
    ? `\nAction required before publishing:\n${blockers.map((b) => `  - ${b}`).join("\n")}`
    : "\nNo publication prerequisite is missing.",
);
console.log("\npublish readiness check complete (nothing was published)");
