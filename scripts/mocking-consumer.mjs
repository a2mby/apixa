// Installs one packed apixa and checks Mocking behavior, registration, lazy datasets,
// browser bundles, framework independence, declarations and Node utilities.
// Run: pnpm build && node scripts/mocking-consumer.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// A direct root dev dependency: pnpm does not link transitive CLIs into every package.
const esbuild = join(root, "node_modules/.bin/esbuild");
const work = mkdtempSync(join(tmpdir(), "apixa-mocking-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });

try {
  // The public build moved the Node helper. Its checkout fallback must still find the same
  // fixtures as the private module even when the caller's cwd is unrelated to the repository.
  run(
    "node",
    [
      "--input-type=module",
      "-e",
      `
import assert from "node:assert/strict";
import { listDatasets as distributed } from ${JSON.stringify(pathToFileURL(join(root, "dist/mocking/node.js")).href)};
import { listDatasets as workspace } from ${JSON.stringify(pathToFileURL(join(root, "packages/mocking/dist/node.js")).href)};
const expected = await workspace();
assert.ok(expected.length > 0, "checkout has datasets");
assert.deepEqual(await distributed(), expected, "distribution preserves checkout fallback");
`,
    ],
    work,
  );
  const packs = join(work, "packs");
  mkdirSync(packs);
  run("pnpm", ["pack", "--pack-destination", packs], root);
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
import { defineMockApi, MockApiError, MockingErrors, InvalidSliceError, listDatasetIds } from "apixa/mocking";
import { loadDataset, users, products, loadDatasetRecords } from "apixa/mocking/datasets";
import { users as usersOnly } from "apixa/mocking/datasets/users";
import { products as productsOnly } from "apixa/mocking/datasets/products";
import { loadDataset as rootLoad } from "apixa/mocking";
import * as node from "apixa/mocking/node";
import { defineApi } from "apixa/core";

assert.equal(typeof MockApiError, "function");
assert.ok(MockingErrors);
assert.equal(typeof InvalidSliceError, "function");
assert.ok(listDatasetIds().includes("users-mock"));

assert.ok(Array.isArray(users) && users.length > 0 && products.length > 0);
assert.equal((await loadDataset("users-mock")).length, users.length);
assert.equal(usersOnly, users, "subpath and barrel share one array");
assert.equal(productsOnly, products);
assert.equal(await rootLoad("users-mock"), users);
assert.equal((await loadDatasetRecords("users-mock")).length, users.length);
await assert.rejects(() => loadDataset("nope"), (e) => e instanceof MockApiError && e.code === "UNKNOWN_DATASET");
for (const name of ["loadDataset", "listDatasets", "getDataset", "findDatasetDirs", "resolveDatasetDir"]) {
  assert.equal(typeof node[name], "function", name);
}

const api = defineMockApi({
  resources: { users: { type: "users-mock", slice: 5, operations: "read" }, products: "products-mock" },
});
assert.equal((await api.users.getAll()).length, 5);
assert.equal(await api.users.count(), users.length); // slice caps the list result only
assert.equal(typeof api.users.create, "undefined");
assert.equal(typeof api.products.create, "function");

// Core without Mocking registration: named datasets fail clearly; inline data works.
const core = defineApi({ baseURL: "https://x.test", resources: { a: { path: "/a", mock: "users-mock" }, b: { path: "/b", mock: [{ id: "1" }] } } });
assert.deepEqual(await core.b.getAll(), [{ id: "1" }]);
await assert.rejects(() => core.a.getAll(), /apixa\\/mocking\\/register/);
await import("apixa/mocking/register");
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
    ["index", 'import { defineMockApi } from "apixa/mocking"; console.log(defineMockApi);'],
    ["register", 'import "apixa/mocking/register";'],
    [
      "datasets",
      'import { loadDataset, users } from "apixa/mocking/datasets"; console.log(loadDataset, users);',
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
    'import { loadDataset } from "apixa/mocking/datasets"; loadDataset("countries-csc").then(console.log);',
  );
  const chunks = files(lazy);
  const entryText = chunks.find(([f]) => f === "lazy.entry.js")[1];
  assert.ok(!entryText.includes("Afghanistan"), "countries data must not be in the entry chunk");
  assert.ok(
    chunks.some(([, t]) => t.includes("Afghanistan")),
    "countries data must be in a separate chunk",
  );

  // register must not pull in the eager records.
  const regFiles = files(bundle("reg2", 'import "apixa/mocking/register";'));
  const regEntry = regFiles.find(([f]) => f === "reg2.entry.js")[1];
  assert.ok(
    !regEntry.includes("jeremiah11@yahoo.com"),
    "register must not inline users-mock records",
  );

  // The installed artifact needs no private workspace package or framework.
  const manifest = JSON.parse(readFileSync(join(app, "node_modules/apixa/package.json"), "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
  for (const group of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    assert.ok(!Object.keys(manifest[group] ?? {}).some((name) => name.startsWith("@apixa/")));
  }
  assert.ok(
    !readdirSync(join(app, "node_modules")).some((name) =>
      ["@apixa", "react", "@tanstack"].includes(name),
    ),
  );
  const coreTarball = tarballs[0];
  for (const name of ["users", "products", "companies", "orders", "posts", "comments"]) {
    const entry = manifest.exports[`./mocking/datasets/${name}`];
    assert.ok(entry?.import && entry?.types);
    readFileSync(join(app, "node_modules/apixa", entry.import), "utf8");
    readFileSync(join(app, "node_modules/apixa", entry.types), "utf8");
  }

  // Core alone: no Mocking installed, inline mocks work, named datasets say what is missing.
  const coreOnly = join(work, "core-only");
  mkdirSync(coreOnly);
  writeFileSync(
    join(coreOnly, "package.json"),
    JSON.stringify({ name: "core-only", type: "module" }),
  );
  run("npm", ["install", "--no-audit", "--no-fund", coreTarball], coreOnly);
  writeFileSync(
    join(coreOnly, "check.mjs"),
    `import { defineApi } from "apixa/core";
const api = defineApi({ baseURL: "https://x.test", resources: { a: { path: "/a", mock: [{ id: "1" }] }, b: { path: "/b", mock: "users-mock" } } });
console.log("inline:" + (await api.a.getAll()).length);
await api.b.getAll().catch((e) => console.log("named:" + e.code));`,
  );
  const coreOut = run("node", ["check.mjs"], coreOnly);
  assert.match(coreOut, /inline:1/);
  assert.match(coreOut, /named:MOCK_LOAD/);
  assert.ok(!readdirSync(join(coreOnly, "node_modules")).includes("@apixa"));

  // Custom declarative `mock` handlers: no Mocking installed, and types resolve from the packed d.ts.
  writeFileSync(
    join(coreOnly, "handler.mjs"),
    `import { defineApi } from "apixa/core";
const api = defineApi({ baseURL: "https://x.test", resources: { u: { path: "/u", mock: [{ id: "1", active: true }, { id: "2", active: false }], operations: {
  getActive: { kind: "read", method: "GET", path: "/active", mock: ({ records }) => records.filter((r) => r.active) },
  archive: { kind: "write", method: "POST", path: "/:id/archive", hasBody: false, mock: ({ store, params }) => store.patch(params.id, { active: false }) },
  stats: { kind: "read", method: "GET", path: "/stats" },
} } } });
await api.u.archive({ params: { id: "1" } });
console.log("handler:" + (await api.u.getActive()).length + ":" + (await api.u.getById("1")).active);
await api.u.stats().catch((e) => console.log("unsupported:" + e.code));`,
  );
  const handlerOut = run("node", ["handler.mjs"], coreOnly);
  assert.match(handlerOut, /handler:0:false/);
  assert.match(handlerOut, /unsupported:MOCK_UNSUPPORTED/);
  writeFileSync(
    join(coreOnly, "handler.ts"),
    `import { defineApi } from "apixa/core";
const api = defineApi({ baseURL: "https://x.test", resources: { u: { path: "/u", mock: [{ id: "1", name: "A", active: true }], operations: {
  getActive: { kind: "read", method: "GET", path: "/active", mock: ({ records }) => records.filter((r) => r.active).map((r) => r.name.toUpperCase()) },
  archive: { kind: "write", method: "POST", path: "/:id/archive", hasBody: false, mock: async ({ store, params }) => store.patch(params.id, { active: false }) },
} } } });
export const run = async () => [await api.u.getActive(), await api.u.archive({ params: { id: "1" } })];
`,
  );
  writeFileSync(
    join(coreOnly, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        skipLibCheck: false,
        types: [],
        noUncheckedIndexedAccess: true,
      },
      include: ["handler.ts"],
    }),
  );
  run(join(root, "node_modules/.bin/tsc"), ["-p", "."], coreOnly);

  // Node utilities from the installed package need a caller-supplied root.
  const fixtures = join(work, "datasets");
  mkdirSync(join(fixtures, "demo/pets-demo"), { recursive: true });
  writeFileSync(
    join(fixtures, "demo/pets-demo/meta.json"),
    JSON.stringify({
      id: "pets-demo",
      title: "Pets",
      license: "MIT",
      version: "1.0.0",
      resource: { path: "/pets" },
      schema: { fields: [{ name: "id", type: "string" }] },
      records: 1,
    }),
  );
  writeFileSync(join(fixtures, "demo/pets-demo/data.json"), JSON.stringify([{ id: "1" }]));
  writeFileSync(
    join(app, "node-utils.mjs"),
    `import assert from "node:assert/strict";
import { loadDataset, listDatasets, getDataset, findDatasetDirs, resolveDatasetDir } from "apixa/mocking/node";
const basePath = ${JSON.stringify(fixtures)};
assert.deepEqual((await listDatasets({ basePath })).map((d) => d.id), ["pets-demo"]);
assert.equal((await loadDataset("pets-demo", { basePath })).records.length, 1);
assert.equal((await getDataset("pets-demo", { basePath })).meta.id, "pets-demo");
assert.equal((await findDatasetDirs(basePath)).length, 1);
assert.ok(await resolveDatasetDir(basePath, "pets-demo"));
assert.deepEqual(await listDatasets(), []);
await assert.rejects(() => loadDataset("states-csc"), /basePath|APIXA_DATASETS_DIR/);
console.log("node utils ok");`,
  );
  assert.match(run("node", ["node-utils.mjs"], app), /node utils ok/);

  // Native Node ESM: which Mocking modules does each import evaluate?
  writeFileSync(
    join(app, "trace-hooks.mjs"),
    'export async function load(url, ctx, next) { if (url.includes("/apixa/dist/")) process.stderr.write("LOAD " + url + "\\n"); return next(url, ctx); }',
  );
  writeFileSync(
    join(app, "trace-reg.mjs"),
    'import { register } from "node:module"; register("./trace-hooks.mjs", import.meta.url);',
  );
  const evaluated = (code) =>
    spawnSync("node", ["--import", "./trace-reg.mjs", "--input-type=module", "-e", code], {
      cwd: app,
      encoding: "utf8",
    })
      .stderr.split("\n")
      .filter((l) => l.startsWith("LOAD "))
      .map((l) => l.replace(/^.*\/dist\//, ""));
  const one = evaluated('import { users } from "apixa/mocking/datasets/users"; users.length;');
  assert.ok(one.some((f) => f === "mocking/datasets/users.js"));
  assert.ok(
    !one.some((f) => /mocking\/datasets\/(?!users)/.test(f)),
    "one subpath loads one dataset",
  );
  assert.ok(
    !one.some((f) => f === "mocking/datasets/index.js"),
    "subpath does not load the barrel",
  );
  const rootOnly = evaluated(
    'import { loadDataset } from "apixa/mocking"; await loadDataset("countries-csc");',
  );
  assert.ok(
    !rootOnly.some((f) => f.startsWith("mocking/datasets/")),
    "root loads no eager dataset",
  );
  assert.ok(
    rootOnly.filter((f) => f.startsWith("chunks/data-")).length === 1,
    "loadDataset loads one data module",
  );
  const registerOnly = evaluated('import "apixa/mocking/register";');
  assert.ok(
    !registerOnly.some((f) => f.startsWith("chunks/data-") || f.startsWith("mocking/datasets/")),
  );

  // Bundles: one subpath ships one dataset, in esbuild's split mode too.
  const markerOf = (out) =>
    files(out)
      .map(([, t]) => t)
      .join("");
  const sub = markerOf(
    bundle("sub", 'import { users } from "apixa/mocking/datasets/users"; console.log(users);'),
  );
  assert.ok(sub.includes("jeremiah11@yahoo.com"), "users records present");
  assert.ok(!sub.includes("Kunze LLC"), "companies not pulled in by the users subpath");
  assert.ok(!sub.includes("Licensed Wooden Cheese"), "products not pulled in by the users subpath");

  console.log("mocking consumer ok");
} finally {
  rmSync(work, { recursive: true, force: true });
}
