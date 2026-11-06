// Packs @apixa/core + @apixa/mocking, installs the tarballs into a clean project, then checks
// every entry point at runtime and with a browser bundle (esbuild, platform=browser).
// Run: pnpm build && node scripts/mocking-consumer.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const esbuild = join(root, "packages/mocking/node_modules/.bin/esbuild");
const work = mkdtempSync(join(tmpdir(), "apixa-mocking-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });

try {
  const packs = join(work, "packs");
  mkdirSync(packs);
  for (const pkg of ["core", "mocking"]) {
    run("pnpm", ["pack", "--pack-destination", packs], join(root, "packages", pkg));
  }
  const app = join(work, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "consumer", type: "module" }));
  const tarballs = readdirSync(packs).map((f) => join(packs, f));
  run("npm", ["install", "--no-audit", "--no-fund", ...tarballs], app);

  // ---- runtime: every entry point imports and behaves ----
  writeFileSync(
    join(app, "check.mjs"),
    `
import assert from "node:assert/strict";
import { defineMockApi, MockApiError, MockingErrors, InvalidSliceError, listDatasetIds } from "@apixa/mocking";
import { loadDataset, users, products, loadDatasetRecords } from "@apixa/mocking/datasets";
import * as node from "@apixa/mocking/node";
import { defineApi } from "@apixa/core";

assert.equal(typeof MockApiError, "function");
assert.ok(MockingErrors);
assert.equal(typeof InvalidSliceError, "function");
assert.ok(listDatasetIds().includes("users-mock"));

assert.ok(Array.isArray(users) && users.length > 0 && products.length > 0);
assert.equal((await loadDataset("users-mock")).length, users.length);
assert.equal((await loadDatasetRecords("users-mock")).length, users.length);
await assert.rejects(() => loadDataset("nope"), (e) => e instanceof MockApiError && e.code === "UNKNOWN_DATASET");
for (const name of ["loadDataset", "listDatasets", "getDataset", "findDatasetDirs", "resolveDatasetDir"]) {
  assert.equal(typeof node[name], "function", name);
}

const api = defineMockApi({
  resources: { users: { type: "users-mock", slice: 5, readOnly: true }, products: "products-mock" },
});
assert.equal((await api.users.getAll()).length, 5);
assert.equal(typeof api.users.create, "undefined");
assert.equal(typeof api.products.create, "function");

// Core without Mocking registration: named datasets fail clearly; inline data works.
const core = defineApi({ baseURL: "https://x.test", resources: { a: { path: "/a", mock: "users-mock" }, b: { path: "/b", mock: [{ id: "1" }] } } });
assert.deepEqual(await core.b.getAll(), [{ id: "1" }]);
await assert.rejects(() => core.a.getAll(), /@apixa\\/mocking\\/register/);
await import("@apixa/mocking/register");
const named = defineApi({ baseURL: "https://x.test", resources: { a: { path: "/a", mock: "users-mock" } } });
assert.equal((await named.a.getAll()).length, users.length);
console.log("runtime ok");
`,
  );
  assert.match(run("node", ["check.mjs"], app), /runtime ok/);

  // ---- browser bundles: no node:fs, loadDataset stays lazy ----
  const bundle = (name, source) => {
    const entry = join(app, `${name}.entry.mjs`);
    const out = join(app, `out-${name}`);
    writeFileSync(entry, source);
    run(
      esbuild,
      [
        entry,
        "--bundle",
        "--splitting",
        "--format=esm",
        "--platform=browser",
        "--outdir=" + out,
        "--log-level=error",
      ],
      app,
    );
    return out;
  };
  const files = (dir) => readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]);

  for (const [name, source] of [
    ["index", 'import { defineMockApi } from "@apixa/mocking"; console.log(defineMockApi);'],
    ["register", 'import "@apixa/mocking/register";'],
    [
      "datasets",
      'import { loadDataset, users } from "@apixa/mocking/datasets"; console.log(loadDataset, users);',
    ],
  ]) {
    const out = bundle(name, source);
    for (const [file, text] of files(out)) {
      assert.ok(!/node:(fs|path|url)/.test(text), `${name}: ${file} leaks node:*`);
    }
  }

  // Lazy: a dynamic loadDataset of a reference set lives in its own chunk, not the entry.
  const lazy = bundle(
    "lazy",
    'import { loadDataset } from "@apixa/mocking/datasets"; loadDataset("countries-csc").then(console.log);',
  );
  const chunks = files(lazy);
  const entryText = chunks.find(([f]) => f === "lazy.entry.js")[1];
  assert.ok(!entryText.includes("Afghanistan"), "countries data must not be in the entry chunk");
  assert.ok(
    chunks.some(([, t]) => t.includes("Afghanistan")),
    "countries data must be in a separate chunk",
  );

  // register must not pull in the eager records.
  const regFiles = files(bundle("reg2", 'import "@apixa/mocking/register";'));
  const regEntry = regFiles.find(([f]) => f === "reg2.entry.js")[1];
  assert.ok(
    !regEntry.includes("jeremiah11@yahoo.com"),
    "register must not inline users-mock records",
  );

  console.log("mocking consumer ok");
} finally {
  rmSync(work, { recursive: true, force: true });
}
