// Local package testing: build Apixa, pack the real npm tarball, install exactly its contents into a
// separate consumer project, and verify the consumer runs the packaged distribution.
//
// Never publishes, never reads or prints credentials, never edits the consumer's package.json or
// lockfiles. The tarball is produced by `pnpm pack`, the same command (and `prepack` build) used for
// a release, and its contents are unpacked into `<consumer>/node_modules/apixa` as a real directory,
// which is what a registry install produces. No dependency spec or integrity is involved, so a
// repeated install of the same version can never reuse stale package contents.
//
//   node scripts/local-package-consumer.mjs [--consumer <dir>] [--skip-build] [--build-consumer]
//                                           [--no-typecheck] [--verify-only]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  utimesSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packDir = join(root, ".local-pack");
const DEFAULT_CONSUMER = "examples/frontends/nextjs-products";
const LOCKFILES = ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", ".npmrc"];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};
const known = new Set([
  "--consumer",
  "--skip-build",
  "--build-consumer",
  "--no-typecheck",
  "--verify-only",
]);
for (const arg of argv) {
  if (arg.startsWith("--") && !known.has(arg)) {
    console.error(`Unknown option ${arg}. Known: ${[...known].join(", ")}`);
    process.exit(2);
  }
}

const consumer = resolve(
  root,
  option("--consumer") ?? process.env.APIXA_CONSUMER ?? DEFAULT_CONSUMER,
);
const target = join(consumer, "node_modules", "apixa");
const stampPath = join(consumer, "node_modules", ".apixa-local-pack.json");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const log = (message) => console.log(message);
const step = (message) => console.log(`\n==> ${message}`);

function run(command, args, cwd = root) {
  console.log(`$ ${command} ${args.join(" ")}`);
  try {
    execFileSync(command, args, { cwd, stdio: "inherit" });
  } catch (error) {
    console.error(`\nFAILED (exit ${error.status ?? "?"}): ${command} ${args.join(" ")}`);
    process.exit(error.status || 1);
  }
}

process.on("uncaughtException", (error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});

function capture(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Every file under `dir` (relative, sorted) with its hash; throws on any symlink. */
function manifestOf(dir) {
  const entries = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = lstatSync(full);
      assert.ok(!stat.isSymbolicLink(), `symlink inside package: ${relative(dir, full)}`);
      if (stat.isDirectory()) walk(full);
      else {
        assert.ok(stat.isFile(), `unexpected file type: ${relative(dir, full)}`);
        entries.push(`${relative(dir, full).split(sep).join("/")} ${sha256(readFileSync(full))}`);
      }
    }
  };
  walk(dir);
  return entries;
}

/** Dependency declarations the install must not touch (consumer, plus the workspace root if inside it). */
function dependencySnapshot() {
  const dirs = [consumer];
  if (consumer.startsWith(root + sep)) dirs.push(root);
  const snapshot = {};
  for (const dir of dirs) {
    for (const name of LOCKFILES) {
      const file = join(dir, name);
      if (existsSync(file)) snapshot[file] = sha256(readFileSync(file));
    }
  }
  return snapshot;
}

function gitState() {
  try {
    const sha = capture("git", ["rev-parse", "--short", "HEAD"]).trim();
    const dirty = capture("git", ["status", "--porcelain", "--", "packages", "src"]).trim() !== "";
    return `${sha}${dirty ? "+uncommitted" : ""}`;
  } catch {
    return "unknown";
  }
}

// --- consumer preconditions ---------------------------------------------------------------------
assert.ok(existsSync(join(consumer, "package.json")), `No package.json in consumer: ${consumer}`);
const consumerManifest = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
assert.ok(
  consumerManifest.dependencies?.apixa || consumerManifest.devDependencies?.apixa,
  `${consumerManifest.name} does not depend on apixa; nothing to replace.`,
);
assert.ok(
  existsSync(join(consumer, "node_modules")),
  `${consumer} has no node_modules. Install its dependencies first (for example \`pnpm install\`).`,
);

const before = dependencySnapshot();

// --- verification ---------------------------------------------------------------------------------
function verifyInstall({ expectedManifest, expectedStamp }) {
  step("Verifying the installed package");
  const stat = lstatSync(target);
  assert.ok(!stat.isSymbolicLink(), "node_modules/apixa is a symlink, not an installed package.");
  assert.ok(stat.isDirectory(), "node_modules/apixa is not a directory.");
  const real = realpathSync(target);
  assert.equal(real, join(realpathSync(consumer), "node_modules", "apixa"));
  assert.ok(!real.startsWith(join(realpathSync(root), "packages") + sep));
  const installed = manifestOf(target);
  const installedHash = sha256(installed.join("\n"));
  if (expectedManifest) {
    assert.deepEqual(installed, expectedManifest, "Installed files differ from the tarball.");
  }
  const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  assert.equal(
    stamp.manifestSha256,
    installedHash,
    "Installed files differ from the recorded pack.",
  );
  if (expectedStamp) assert.equal(stamp.tarballSha256, expectedStamp.tarballSha256);
  const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
  assert.equal(pkg.name, "apixa");
  for (const group of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      assert.ok(
        !name.startsWith("@apixa/") && !/^(workspace:|link:|file:)/.test(range),
        `${group}.${name}`,
      );
    }
  }
  log(`  real directory, ${installed.length} files, no symlinks, matches the packed tarball`);

  // Every public entry resolves inside node_modules/apixa and loads under the consumer's Node.
  const specifiers = Object.keys(pkg.exports).map((key) =>
    key === "." ? "apixa" : `apixa${key.slice(1)}`,
  );
  const probe = `
    const out = {};
    for (const spec of ${JSON.stringify(specifiers)}) {
      const url = import.meta.resolve(spec);
      await import(spec);
      out[spec] = new URL(url).pathname;
    }
    console.log(JSON.stringify(out));`;
  const resolved = JSON.parse(
    capture(process.execPath, ["--input-type=module", "-e", probe], consumer).trim(),
  );
  for (const [spec, file] of Object.entries(resolved)) {
    const realFile = realpathSync(file);
    assert.ok(realFile.startsWith(real + sep), `${spec} resolved outside the package: ${realFile}`);
    assert.ok(!realFile.includes(`${sep}.pnpm${sep}`), `${spec} resolved into the pnpm store`);
  }
  log(`  ${specifiers.length} public entries resolve inside node_modules/apixa and import`);

  // Peers must be the consumer's own single copies (one React, one QueryClient context).
  const fromPackage = (name) => {
    try {
      return realpathSync(
        capture(
          process.execPath,
          ["-p", `require.resolve(${JSON.stringify(name + "/package.json")})`],
          target,
        ).trim(),
      );
    } catch {
      return undefined;
    }
  };
  const fromConsumer = (name) => {
    try {
      return realpathSync(
        capture(
          process.execPath,
          ["-p", `require.resolve(${JSON.stringify(name + "/package.json")})`],
          consumer,
        ).trim(),
      );
    } catch {
      return undefined;
    }
  };
  for (const peer of ["react", "@tanstack/react-query"]) {
    if (!consumerManifest.dependencies?.[peer] && !consumerManifest.devDependencies?.[peer])
      continue;
    const a = fromPackage(peer);
    const b = fromConsumer(peer);
    assert.ok(b, `${peer} is declared by the consumer but does not resolve from it.`);
    assert.equal(a, b, `${peer} resolves to a different copy from apixa than from the consumer.`);
    log(`  ${peer}: one shared copy`);
  }

  const after = dependencySnapshot();
  assert.deepEqual(after, before, "The consumer's package.json or a lockfile changed.");
  log("  consumer package.json and lockfiles unchanged");
  return pkg;
}

if (flag("--verify-only")) {
  assert.ok(existsSync(stampPath), "No local pack is installed here; run without --verify-only.");
  const pkg = verifyInstall({});
  log(`\nOK: ${consumerManifest.name} runs the locally packed apixa@${pkg.version}.`);
  process.exit(0);
}

// --- build and pack ---------------------------------------------------------------------------------
if (flag("--skip-build"))
  step("Skipping workspace build (--skip-build); `pnpm pack` still runs prepack");
else {
  step("Building Apixa (workspace packages and the single-package distribution)");
  run("pnpm", ["build"]);
}

step("Packing the npm tarball (same command and prepack build as a release)");
rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
run("pnpm", ["pack", "--pack-destination", packDir]);
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tarball = join(packDir, `apixa-${rootManifest.version}.tgz`);
assert.ok(existsSync(tarball), `Expected ${tarball}`);
const tarballBytes = readFileSync(tarball);
const tarballSha256 = sha256(tarballBytes);
log(
  `${relative(root, tarball)}  ${tarballBytes.length} bytes  sha256 ${tarballSha256.slice(0, 16)}…`,
);

const entries = capture("tar", ["-tzf", tarball]).split("\n").filter(Boolean);
for (const entry of entries) {
  assert.ok(entry.startsWith("package/") && !entry.split("/").includes(".."), `bad entry ${entry}`);
}
const extractRoot = mkdtempSync(join(tmpdir(), "apixa-local-pack-"));
try {
  run("tar", ["-xzf", tarball, "-C", extractRoot]);
  const unpacked = join(extractRoot, "package");
  const manifest = manifestOf(unpacked);
  const packed = JSON.parse(readFileSync(join(unpacked, "package.json"), "utf8"));
  assert.equal(packed.name, "apixa");
  assert.equal(packed.version, rootManifest.version);
  assert.notEqual(packed.private, true);

  // --- install: replace whatever is there with a real copy of the tarball's files ------------------
  step(`Installing into ${relative(root, consumer) || consumer}/node_modules/apixa`);
  rmSync(target, { recursive: true, force: true }); // removes a symlink without touching its target
  cpSync(unpacked, target, { recursive: true, dereference: false });
  const stamp = {
    version: packed.version,
    tarballSha256,
    manifestSha256: sha256(manifest.join("\n")),
    git: gitState(),
    installedAt: new Date().toISOString(),
  };
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);

  // Bundler and compiler caches may hold the previous package contents under the same version.
  for (const stale of [".next", join("node_modules", ".cache")]) {
    rmSync(join(consumer, stale), { recursive: true, force: true });
  }
  log("  cleared .next and node_modules/.cache");
  // Editors cache module resolution and do not watch node_modules. Touching tsconfig.json (mtime only,
  // content unchanged) makes the TypeScript server reload the project and read the new declarations.
  const tsconfig = join(consumer, "tsconfig.json");
  if (existsSync(tsconfig)) {
    const now = new Date();
    utimesSync(tsconfig, now, now);
    log("  touched tsconfig.json so editors reload the new types");
  }

  verifyInstall({ expectedManifest: manifest, expectedStamp: stamp });
} finally {
  rmSync(extractRoot, { recursive: true, force: true });
}

// --- consumer checks --------------------------------------------------------------------------------
if (!flag("--no-typecheck") && consumerManifest.devDependencies?.typescript) {
  step("Typechecking the consumer against the packaged declarations");
  run("pnpm", ["--dir", consumer, "exec", "tsc", "--noEmit", "--incremental", "false"]);
}
if (flag("--build-consumer")) {
  step("Building the consumer (next build)");
  run("pnpm", ["--dir", consumer, "run", "build"]);
}

const final = JSON.parse(readFileSync(stampPath, "utf8"));
log(
  `\nOK: ${consumerManifest.name} now runs the packaged apixa@${final.version} ` +
    `(tarball ${final.tarballSha256.slice(0, 12)}, source ${final.git}). ` +
    `Restart any running dev server; re-run after \`pnpm install\`, which restores the registry copy.`,
);
