// Registry reads and a dry-run of ONE root tarball. Never publishes or reads/prints credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(manifest.name, "apixa");
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
assert.deepEqual(manifest.publishConfig, { access: "public", tag: "latest" });
for (const dir of ["core", "mocking", "react", "internal/shared"]) {
  assert.equal(
    JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")).private,
    true,
  );
}
const capture = (command, args) => {
  try {
    return {
      ok: true,
      out: execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe" }),
    };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
};
const blockers = [];
const who = capture("npm", ["whoami"]);
console.log(`npm account: ${who.ok ? who.out.trim() : "not authenticated"}`);
if (!who.ok) blockers.push("npm authentication is unavailable");
if (who.ok) {
  const access = capture("npm", ["access", "list", "packages", "--json"]);
  const permission = access.ok ? JSON.parse(access.out).apixa : "unknown";
  console.log(`apixa permission: ${permission}`);
  if (permission !== "read-write") blockers.push("read-write permission on apixa was not verified");
  const profile = capture("npm", ["profile", "get", "--json"]);
  const tfa = profile.ok ? JSON.parse(profile.out).tfa?.mode : "unknown";
  console.log(`2FA: ${tfa}; publication may require an OTP or a suitable granular token.`);
}
const version = capture("npm", ["view", `apixa@${manifest.version}`, "version", "--json"]);
if (version.ok && version.out.trim()) blockers.push(`apixa@${manifest.version} already exists`);
else if (!/E404|404/.test(version.out))
  blockers.push("registry version availability could not be verified");
else console.log(`apixa@${manifest.version}: available`);
const tags = capture("npm", ["view", "apixa", "dist-tags", "--json"]);
console.log(`Current dist-tags: ${tags.ok ? tags.out.trim() : "unavailable"}`);

const temporary = mkdtempSync(join(tmpdir(), "apixa-publish-check-"));
try {
  const pack = capture("pnpm", ["pack", "--pack-destination", temporary]);
  assert.ok(pack.ok, pack.out);
  const tarball = join(temporary, `apixa-${manifest.version}.tgz`);
  const packed = capture("tar", ["-xOzf", tarball, "package/package.json"]);
  assert.ok(packed.ok);
  const pkg = JSON.parse(packed.out);
  for (const group of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ]) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      assert.ok(
        !name.startsWith("@apixa/") && !/^(workspace:|link:|file:)/.test(range),
        `${group}.${name}`,
      );
    }
  }
  const args = ["publish", tarball, "--dry-run", "--tag", "latest", "--access", "public", "--json"];
  assert.ok(args.includes("--dry-run"));
  const dry = capture("npm", args);
  assert.ok(dry.ok, dry.out);
  const output = JSON.parse(dry.out);
  // npm 11 keys the report by package name; older npm returns the report directly.
  const info = output.apixa ?? output;
  assert.equal(info.name, "apixa");
  assert.equal(info.version, manifest.version);
  console.log(
    `npm publish --dry-run --tag latest: apixa@${info.version}, ${info.size} bytes compressed, ${info.unpackedSize} bytes unpacked, ${info.entryCount} files.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log(
  "Only apixa is publishable. No npm scope or coordinated package publication is required.",
);
console.log(
  "Nothing was published. Manual release command, after authorization: pnpm --dir . publish --tag latest --access public",
);
if (blockers.length) {
  console.error(`Publication blockers:\n${blockers.map((b) => `- ${b}`).join("\n")}`);
  process.exitCode = 1;
}
