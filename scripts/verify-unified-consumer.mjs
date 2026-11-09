// Packed-consumer verification for the single published `apixa` distribution.
//
// Every package is packed exactly as npm would publish it and installed into clean projects:
//   A. Root-only Node consumer (no React): curated root, every subpath, runtime identity,
//      lazy datasets, TypeScript 5.5 and latest declarations, bundle-size and edge-runtime checks.
//   B. React 18 and 19 consumers through `apixa/react`: declarations (TypeScript 5.5 and latest),
//      a Vite build, server rendering with hydration, identity across entry points, no duplicates.
//   C. A Next.js App Router consumer (production and development): a Server Component builds a
//      request-scoped QueryClient from `apixa/react/advanced`, prefetches, and hands the dehydrated
//      state to a client boundary.
// Nothing is published. Temporary projects are removed at the end.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "apixa-unified-"));
const packs = join(temporary, "packs");
mkdirSync(packs);
const curated = JSON.parse(
  readFileSync(join(root, "tests/facade/curated-root-exports.json"), "utf8"),
);
const PACKAGES = [["apixa", "."]];
const SUBPATHS = [
  "apixa",
  "apixa/core",
  "apixa/mocking",
  "apixa/mocking/register",
  "apixa/mocking/datasets",
  ...["users", "products", "companies", "orders", "posts", "comments"].map(
    (n) => `apixa/mocking/datasets/${n}`,
  ),
  "apixa/mocking/node",
  "apixa/react",
  "apixa/react/advanced",
];

function run(command, args, cwd, options = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: options.capture ? "pipe" : ["ignore", "inherit", "inherit"],
    });
  } catch (error) {
    process.stderr.write(error.stdout?.toString() ?? "");
    process.stderr.write(error.stderr?.toString() ?? "");
    throw error;
  }
}
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const write = (dir, name, contents) => {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), contents);
};

try {
  // ---- 1. Pack the root distribution ----------------------------------------------------------
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const tarballs = {};
  for (const [name, dir] of PACKAGES) {
    run("pnpm", ["--dir", dir, "pack", "--pack-destination", packs], root);
    const file = join(packs, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`);
    assert.ok(existsSync(file), `missing tarball ${file}`);
    tarballs[name] = file;
  }

  // ---- 2. Manifests and tarball contents ---------------------------------------------------------------
  const exportEntries = (manifest) =>
    Object.values(manifest.exports ?? {}).flatMap((e) => [e.import, e.types]);
  for (const [name, dir] of PACKAGES) {
    const manifest = JSON.parse(
      run("tar", ["-xOzf", tarballs[name], "package/package.json"], root, { capture: true }),
    );
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version, `${name} version is coordinated`);
    assert.equal(manifest.engines?.node, ">=22", `${name} engines`);
    assert.equal(manifest.type, "module", `${name} is ESM only`);
    assert.notEqual(manifest.private, true);
    // A bare `npm publish` must never move `latest` or hide a scoped package.
    assert.deepEqual(
      manifest.publishConfig,
      { access: "public", tag: "next" },
      `${name} publishConfig`,
    );
    assert.equal(manifest.license, "MIT");
    assert.match(
      String(manifest.repository?.url),
      /github\.com\/a2mby\/apixa\.git$/,
      `${name} repository`,
    );
    for (const hook of ["preinstall", "install", "postinstall"]) {
      assert.ok(!manifest.scripts?.[hook], `${name} must not run an install-time ${hook} script`);
    }
    assert.ok(!manifest.exports?.["./tanstack-query"], `${name} has no legacy alias`);
    const raw = JSON.stringify(manifest);
    assert.ok(!raw.includes("workspace:"), `${name} manifest still has workspace: ranges`);
    for (const group of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
      "devDependencies",
    ]) {
      assert.ok(
        !Object.keys(manifest[group] ?? {}).some((dep) => dep.startsWith("@apixa/")),
        `${name} must not require the private shared package at runtime`,
      );
    }
    const listing = run("tar", ["-tzf", tarballs[name]], root, { capture: true })
      .split("\n")
      .filter(Boolean);
    assert.ok(
      listing.every((f) => /^package\/(dist\/|package\.json$|README|LICENSE|CHANGELOG)/i.test(f)),
      `${name} tarball contains only dist and metadata:\n${listing.filter((f) => !/^package\/(dist\/|package\.json$|README|LICENSE|CHANGELOG)/i.test(f)).join("\n")}`,
    );
    for (const entry of exportEntries(manifest)) {
      assert.ok(listing.includes(`package/${entry.replace("./", "")}`), `${name}: ${entry} packed`);
    }
    assert.ok(listing.includes("package/LICENSE"), `${name} ships its LICENSE`);
    assert.ok(listing.includes("package/README.md"), `${name} ships its README`);
    // Tarball contents: no source maps, secrets, local paths or environment files.
    const unpacked = join(temporary, `unpacked-${name.replace(/\W/g, "-")}`);
    mkdirSync(unpacked);
    run("tar", ["-xzf", tarballs[name], "-C", unpacked], root);
    const walk = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
        item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)],
      );
    for (const file of walk(unpacked)) {
      assert.ok(!/\.map$|(^|\/)\.env|\.npmrc$|\.pem$/i.test(file), `${name} packs ${file}`);
      if (!/\.(js|ts|json|md)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/\.(js|ts)$/.test(file))
        assert.ok(
          !/(?:from\s*|import\s*\(?\s*)["']@apixa\//.test(text),
          `${file}: unresolved private import`,
        );
      assert.ok(!/sourceMappingURL/.test(text), `${name}: ${file} references a source map`);
      assert.ok(
        !/\/Users\/|\/home\/[a-z]+\/|[A-Z]:\\Users\\/.test(text),
        `${name}: ${file} embeds a local path`,
      );
      assert.ok(
        !/npm_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}/.test(
          text,
        ),
        `${name}: ${file} looks like it contains a credential`,
      );
    }
    // `npm pack --dry-run` must agree with what pnpm packed.
    const dry = JSON.parse(
      run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], join(root, dir), {
        capture: true,
      }),
    )[0];
    for (const entry of exportEntries(manifest)) {
      assert.ok(
        dry.files.some((f) => f.path === entry.replace("./", "")),
        `${name}: npm pack --dry-run omits ${entry}`,
      );
    }
    assert.ok(
      dry.files.every((f) => !/^(src|tests|scripts)\//.test(f.path)),
      `${name}: npm pack --dry-run includes source files`,
    );
    if (name === "apixa") {
      assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
      for (const dep of ["react", "@tanstack/react-query"]) {
        assert.equal(manifest.peerDependenciesMeta?.[dep]?.optional, true, `${dep} optional peer`);
      }
      assert.deepEqual(
        Object.keys(manifest.exports),
        [
          ".",
          "./core",
          "./mocking",
          "./mocking/register",
          "./mocking/datasets",
          ...["users", "products", "companies", "orders", "posts", "comments"].map(
            (n) => `./mocking/datasets/${n}`,
          ),
          "./mocking/node",
          "./react",
          "./react/advanced",
        ],
        "facade export map is exactly the approved subpaths",
      );
    }
    console.log(`${name}: manifest and tarball contents verified (${listing.length} files)`);
  }

  // ---- A. Root-only Node consumer (npm, no React) -------------------------------------------------------------
  const consumer = join(temporary, "root-only");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballs.apixa], consumer);
  for (const absent of ["react", "react-dom", "@tanstack", "@apixa"]) {
    assert.ok(
      !existsSync(join(consumer, "node_modules", absent)),
      `${absent} must not be installed`,
    );
  }
  assert.ok(
    !existsSync(join(consumer, "node_modules/apixa/node_modules")),
    "apixa must not nest its own copy of Core or Mocking",
  );
  write(consumer, "expected.json", JSON.stringify(curated));
  write(
    consumer,
    "runtime.mjs",
    `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as root from "apixa";
import * as coreFacade from "apixa/core";
import * as mockingFacade from "apixa/mocking";
import "apixa/mocking/register";
import * as datasetsFacade from "apixa/mocking/datasets";
import * as usersFacade from "apixa/mocking/datasets/users";
import * as nodeFacade from "apixa/mocking/node";
const core = coreFacade;
const mocking = mockingFacade;
const datasets = datasetsFacade;
const node = nodeFacade;
const expected = JSON.parse(readFileSync("expected.json", "utf8"));
const keys = (m) => Object.keys(m).sort();
assert.deepEqual(keys(root), expected, "curated root exports");
for (const name of expected) {
  assert.equal(root[name], (core[name] ?? mocking[name]), "root re-exports the canonical " + name);
}
for (const hidden of ["MockStore", "resetMock", "registerMockDatasetLoader", "useResource", "QueryClient", "loadDataset"]) {
  assert.ok(!(hidden in root), hidden + " is not on the curated root");
}
assert.equal(usersFacade.users, datasetsFacade.users);

// One Core: errors thrown by an API built through the facade are the apixa/core classes.
const api = root.defineApi({
  baseURL: "https://example.test",
  transport: { request: async () => ({ status: 404, headers: new Headers(), raw: new Response(null), body: "{}" }) },
  resources: { users: { path: "/users" } },
});
const failure = await api.users.getAll().catch((e) => e);
assert.ok(failure instanceof root.HttpError && failure instanceof core.HttpError && failure instanceof coreFacade.HttpError, "HttpError identity");
assert.ok(failure instanceof core.ApiError && failure instanceof root.ApiError);
assert.equal(root.getOperationMetadata(api.users), core.getOperationMetadata(api.users));

// Registration through the facade reaches the Core the app runs; datasets load lazily.
const mocked = root.defineApi({ baseURL: "https://example.test", resources: { users: { path: "/users", mock: "users-mock" } } });
assert.ok((await mocked.users.getAll()).length > 0, "registered named dataset");
const mockApi = root.defineMockApi({ resources: { users: { type: "users-mock", readOnly: true } } });
assert.ok((await mockApi.users.getAll()).length > 0, "defineMockApi from the root");
assert.ok((await mocking.loadDataset("users-mock")).length > 0);

// File handling: automatic multipart, the SerializationError, and the virtual file store.
assert.equal(typeof root.SerializationError, "function");
assert.equal(root.mockFiles, mocking.mockFiles, "mockFiles is one canonical function");
const sent = [];
const uploads = root.defineApi({
  baseURL: "https://example.test",
  transport: { request: async (input) => { sent.push(input); return { status: 200, headers: new Headers(), raw: new Response(null), body: { id: "1" } }; } },
  resources: { users: { path: "/users", fileFields: ["avatar"] } },
});
await uploads.users.create({ name: "Ada", avatar: new File(["x"], "a.txt") });
assert.ok(sent[0].body instanceof FormData && !sent[0].headers.has("content-type"), "automatic multipart");
const jsonOnly = root.defineApi({
  baseURL: "https://example.test",
  transport: { request: async () => ({ status: 200, headers: new Headers(), raw: new Response(null), body: {} }) },
  resources: { u: { path: "/u", operations: { create: { dataFormat: "json" } } } },
});
await assert.rejects(() => jsonOnly.u.create({ f: new File(["x"], "f") }), (e) => e instanceof root.SerializationError, "binary under dataFormat json");
const filed = root.defineApi({ baseURL: "https://example.test", resources: { pets: { path: "/pets", mock: [{ id: "1", name: "Rex" }], fileFields: ["photo"] } } });
const pet = await filed.pets.create({ id: "2", name: "Mia", photo: new File(["bytes"], "p.png") });
assert.equal(root.mockFiles(filed).get(pet.photo).text(), "bytes", "mock file store");

// Binary downloads: operation-level responseType, metadata, error bodies, mock downloads.
assert.equal(typeof root.parseContentDisposition, "function");
const bytes = new Uint8Array([0, 255, 128, 10]);
const fetchStub = async (url) =>
  String(url).includes("/missing/")
    ? new Response('{"message":"gone"}', { status: 404, headers: { "content-type": "application/json" } })
    : new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf" } });
const downloads = root.defineApi({
  baseURL: "https://example.test",
  transport: root.createFetchTransport(fetchStub),
  resources: { docs: { path: "/docs", operations: { file: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" } } } },
});
const full = await downloads.docs.file("1", { full: true });
assert.ok(full.data instanceof Blob && full.data.type === "application/pdf", "operation-level responseType yields a Blob");
assert.deepEqual(new Uint8Array(await full.data.arrayBuffer()), bytes, "byte-exact download");
assert.equal(root.parseContentDisposition(full.headers).filename, "résumé.pdf", "Content-Disposition filename*");
assert.ok((await downloads.docs.getById("1", { responseType: "arrayBuffer" })) instanceof ArrayBuffer, "per-call responseType");
const gone = await downloads.docs.file("missing").catch((e) => e);
assert.ok(gone instanceof root.HttpError && gone.status === 404 && gone.data.message === "gone", "failed download keeps a readable body");
const served = root.defineApi({
  baseURL: "https://example.test",
  resources: { docs: { path: "/docs", mock: [{ id: "1", name: "Doc", file: null }], fileFields: ["file"], operations: {
    download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob", mock: ({ params, store, files }) => files.get(store.get(params.id).file).blob() },
  } } },
});
const stored = await served.docs.create({ id: "2", name: "Up", file: new File([bytes], "up.bin", { type: "application/octet-stream" }) });
const mockRes = await served.docs.download(stored.id, { full: true });
assert.deepEqual(new Uint8Array(await mockRes.data.arrayBuffer()), bytes, "mock download serves the uploaded bytes");
assert.equal(root.parseContentDisposition(mockRes.headers).filename, "up.bin", "mock Content-Disposition");
root.mockFiles(served).clear();
await assert.rejects(() => served.docs.download(stored.id), (e) => e.code === "MOCK_NOT_FOUND", "reset removes the bytes");

// React is an optional peer: the React entries fail clearly, and only when imported.
for (const entry of ["apixa/react", "apixa/react/advanced"]) {
  const error = await import(entry).then(() => null, (e) => e);
  assert.ok(error && /react|@tanstack/.test(String(error.message)), entry + " names the missing peer: " + error?.message);
}
console.log("root-only runtime ok (Node " + process.versions.node + ")");
`,
  );
  run("node", ["runtime.mjs"], consumer);

  // Facade packaging without the shared dataset chunks leaking into a Core-only import.
  const staticClosure = async (code) => {
    const result = await build({
      stdin: { contents: code, resolveDir: consumer, loader: "js" },
      bundle: true,
      format: "esm",
      splitting: true,
      platform: "browser",
      minify: true,
      outdir: join(temporary, "out"),
      write: false,
      metafile: true,
      logLevel: "error",
    });
    const outputs = result.metafile.outputs;
    const entry = Object.keys(outputs).find((o) => outputs[o].inputs["<stdin>"]);
    const initial = new Set();
    const queue = [entry];
    while (queue.length) {
      const file = queue.pop();
      if (initial.has(file)) continue;
      initial.add(file);
      for (const imp of outputs[file].imports)
        if (imp.kind === "import-statement") queue.push(imp.path);
    }
    const sum = (set) => [...set].reduce((n, f) => n + outputs[f].bytes, 0);
    // Chunks reachable through a dynamic import from the initial graph are real lazy chunks. esbuild
    // also writes chunks that nothing references (tree-shaken `import()` targets); they are never loaded.
    const reachable = new Set(initial);
    const frontier = [...initial];
    while (frontier.length) {
      const file = frontier.pop();
      for (const imp of outputs[file].imports) {
        if (!reachable.has(imp.path) && outputs[imp.path]) {
          reachable.add(imp.path);
          frontier.push(imp.path);
        }
      }
    }
    const lazy = new Set([...reachable].filter((f) => !initial.has(f)));
    const orphan = new Set(Object.keys(outputs).filter((f) => !reachable.has(f)));
    return {
      initial: sum(initial),
      lazyBytes: sum(lazy),
      lazyChunks: lazy.size,
      orphanChunks: orphan.size,
      orphanBytes: sum(orphan),
    };
  };
  const coreOnly = await staticClosure(
    'import { defineApi } from "apixa/core"; console.log(defineApi);',
  );
  const facadeOnly = await staticClosure(
    'import { defineApi } from "apixa"; console.log(defineApi);',
  );
  const facadeMock = await staticClosure(
    'import { defineApi, defineMockApi } from "apixa"; console.log(defineApi, defineMockApi);',
  );
  const mockingOnly = await staticClosure(
    'import { defineMockApi } from "apixa/mocking"; console.log(defineMockApi);',
  );
  console.log("\nBundle impact (esbuild, browser, minified, code-split):");
  for (const [label, m] of [
    ["apixa/core only", coreOnly],
    ["apixa: defineApi only", facadeOnly],
    ["apixa: defineApi + defineMockApi", facadeMock],
    ["apixa/mocking: defineMockApi", mockingOnly],
  ]) {
    console.log(
      `  ${label.padEnd(36)} initial ${kb(m.initial).padStart(9)}   lazy ${String(m.lazyChunks).padStart(2)} chunks ${kb(m.lazyBytes).padStart(9)}   unreferenced ${String(m.orphanChunks).padStart(2)} chunks ${kb(m.orphanBytes).padStart(9)}`,
    );
  }
  assert.ok(
    facadeOnly.initial <= coreOnly.initial * 1.1 + 2048,
    "importing only defineApi from apixa must stay close to Core's own size",
  );
  assert.ok(
    facadeMock.initial < 400 * 1024,
    "initial JavaScript for the root must not contain dataset contents",
  );
  assert.equal(coreOnly.lazyChunks, 0, "a Core-only import reaches no dataset chunk");
  assert.equal(
    facadeOnly.lazyChunks,
    0,
    "importing defineApi from apixa must not make any dataset chunk loadable (an unused defineMockApi is tree-shaken)",
  );
  assert.equal(
    facadeMock.lazyChunks,
    15,
    "defineMockApi keeps every built-in dataset lazily loadable",
  );
  // The mock engine is included once: mocking with the facade is not larger than mocking directly.
  assert.ok(facadeMock.initial <= mockingOnly.initial + coreOnly.initial + 8192);

  // Edge-style bundle: no Node built-ins, single file (dynamic imports inlined), run without
  // process/require/Buffer in a bare context.
  const edge = await build({
    stdin: {
      contents: `import { defineApi, defineMockApi, HttpError } from "apixa";
globalThis.__done = (async () => {
  const api = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: [{ id: "1", name: "Ada" }] } } });
  const users = await api.users.getAll();
  const http = defineApi({ baseURL: "https://edge.test", transport: { request: async () => ({ status: 500, headers: new Headers(), raw: new Response(null), body: "{}" }) }, resources: { users: { path: "/users" } } });
  const error = await http.users.getAll().catch((e) => e);
  const mock = defineMockApi({ resources: { users: { type: "users-mock", readOnly: true } } });
  return JSON.stringify({ users, http: error instanceof HttpError, named: (await mock.users.getAll()).length > 0 });
})();`,
      resolveDir: consumer,
      loader: "js",
    },
    bundle: true,
    format: "iife",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    write: false,
    metafile: true,
    logLevel: "error",
  });
  const edgeCode = edge.outputFiles[0].text;
  const edgeWithout = await build({
    stdin: {
      contents: 'import { defineApi } from "apixa"; console.log(defineApi);',
      resolveDir: consumer,
      loader: "js",
    },
    bundle: true,
    format: "iife",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    minify: true,
    write: false,
    logLevel: "error",
  });
  const edgeWithoutBytes = edgeWithout.outputFiles[0].text.length;
  assert.ok(
    edgeWithoutBytes <= coreOnly.initial * 1.1 + 2048,
    "a single-file bundle that never calls defineMockApi contains no dataset contents",
  );
  console.log(`Worker-style single-file bundle without defineMockApi: ${kb(edgeWithoutBytes)}`);
  assert.ok(
    !/require\(["']node:|from ["']node:/.test(edgeCode),
    "no node: imports in the edge bundle",
  );
  const vm = await import("node:vm");
  const sandbox = {
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    structuredClone,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    console,
    DOMException,
    Promise,
    fetch: () => {
      throw new Error("no network in the edge simulation");
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(edgeCode, sandbox);
  const edgeResult = JSON.parse(await sandbox.__done);
  assert.deepEqual(edgeResult.users, [{ id: "1", name: "Ada" }]);
  assert.equal(edgeResult.http, true);
  assert.equal(edgeResult.named, true);
  console.log(
    `Edge-style bundle (single file, platform=neutral, executed without process/require): ${kb(edgeCode.length)} ` +
      "(a vm simulation; the real workerd and Vercel Edge Runtime run in verify-edge.mjs)",
  );

  // TypeScript declarations: 5.5 (the floor) and the latest 5.x, all strict and without skipLibCheck.
  write(
    consumer,
    "consumer.ts",
    `import { defineApi, defineApis, defineMockApi, ApiError, HttpError, getOperationMetadata, createFetchTransport, type ApiClient, type OperationMetadata, type Transport } from "apixa";
import { MockStore, resetMock, createIdempotencyKey } from "apixa/core";
import { listDatasetIds, loadDataset } from "apixa/mocking";
import { users, type User } from "apixa/mocking/datasets";
import { users as usersOnly } from "apixa/mocking/datasets/users";
import { listDatasets } from "apixa/mocking/node";
import "apixa/mocking/register";
import { OPERATION_METADATA as rootMetadata } from "apixa";
import { OPERATION_METADATA as coreMetadata, type ApiRequest as CoreRequest } from "apixa/core";
import type { ApiRequest as RootRequest } from "apixa";
import * as products from "apixa/mocking/datasets/products";
import * as companies from "apixa/mocking/datasets/companies";
import * as orders from "apixa/mocking/datasets/orders";
import * as posts from "apixa/mocking/datasets/posts";
import * as comments from "apixa/mocking/datasets/comments";
const sameSymbol: typeof coreMetadata = rootMetadata;
const requestIdentity = (request: RootRequest): CoreRequest => request;
void [sameSymbol, requestIdentity, products, companies, orders, posts, comments];
type Account = { id: string; name: string };
const api = defineApi<{ accounts: { entity: Account } }>()({
  baseURL: "/api",
  resources: { accounts: { path: "/accounts", operations: { stats: { kind: "read", method: "GET", path: "/stats" } } } },
});
const all: Promise<Account[]> = api.accounts.getAll();
const one: Promise<Account> = api.accounts.getById("1");
// @ts-expect-error getById takes an id
api.accounts.getById();
const apis = defineApis({ backend: { baseURL: "/api", resources: { accounts: { path: "/accounts", mock: [{ id: "1", name: "Ada" }] } } } });
void apis.backend.accounts.getAll();
const transport: Transport = createFetchTransport();
const metadata: Readonly<Record<string, OperationMetadata>> | undefined = getOperationMetadata(api.accounts);
const client: ApiClient<any, any> | undefined = undefined;
const failure = (e: unknown) => e instanceof HttpError && e instanceof ApiError;
const first: User | undefined = users[0];
const custom = defineApi<{ accounts: { entity: Account } }>()({
  baseURL: "/api",
  resources: {
    accounts: {
      path: "/accounts",
      operations: {
        archive: { kind: "write", run: async (ctx, id: string) => ctx.request<Account>({ method: "POST", path: \`/\${id}/archive\` }) },
        stats: { kind: "read", method: "GET", path: "/stats" },
      },
    },
  },
});
const archived: Promise<Account> = custom.accounts.archive("1");
// @ts-expect-error the custom operation takes a string id
custom.accounts.archive(1);
// @ts-expect-error unknown operations do not exist on the client
custom.accounts.destroyEverything();
void archived;
void [all, one, transport, metadata, client, failure, first, usersOnly, MockStore, resetMock, createIdempotencyKey, defineMockApi, listDatasetIds, loadDataset, listDatasets];
`,
  );
  const versions = ["5.5.4", "latest"];
  for (const ts of versions) {
    run("npm", ["install", "--no-save", "--no-audit", "--no-fund", `typescript@${ts}`], consumer);
    const tsc = join(consumer, "node_modules/.bin/tsc");
    const tsVersion = run(tsc, ["--version"], consumer, { capture: true }).trim();
    for (const [module, resolution] of [
      ["ESNext", "Bundler"],
      ["NodeNext", "NodeNext"],
    ]) {
      write(
        consumer,
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module,
            moduleResolution: resolution,
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
          },
          include: ["consumer.ts"],
        }),
      );
      run(tsc, ["-p", "."], consumer);
      console.log(
        `apixa declarations compile with ${tsVersion} (${resolution}, skipLibCheck: false)`,
      );
    }
  }

  for (const absent of ["react", "react-dom", "@tanstack", "@apixa"]) {
    assert.ok(
      !existsSync(join(consumer, "node_modules", absent)),
      `${absent} absent after declaration checks`,
    );
  }

  // ---- B. React 18 and 19 through the facade (pnpm) -------------------------------------------------------------
  const react = {
    18: { react: "18.3.1", dom: "18.3.1", types: "^18.3.0", domTypes: "^18.3.0", query: "5.90.1" },
    19: {
      react: "19.1.1",
      dom: "19.1.1",
      types: "^19.1.13",
      domTypes: "^19.1.9",
      query: "5.104.4",
    },
  };
  const reactProject = (major) => {
    const dir = join(temporary, `react-${major}`);
    mkdirSync(dir);
    const v = react[major];
    write(
      dir,
      "package.json",
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          apixa: `file:${tarballs.apixa}`,
          "@tanstack/react-query": v.query,
          react: v.react,
          "react-dom": v.dom,
          ...(major === 19 ? { next: "15.5.27" } : {}),
        },
        devDependencies: {
          "@types/react": v.types,
          "@types/react-dom": v.domTypes,
          "@types/node": "^22.13.10",
          typescript: "5.5.4",
          vite: "^6.3.5",
        },
      }),
    );
    return dir;
  };
  for (const major of [18, 19]) {
    const dir = reactProject(major);
    write(
      dir,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          jsx: "react-jsx",
          skipLibCheck: false,
          types: [],
        },
        include: ["src.tsx"],
      }),
    );
    write(dir, "index.html", '<div id="root"></div><script type="module" src="/src.tsx"></script>');
    write(
      dir,
      "src.tsx",
      `import { defineApi } from "apixa";
import {
  ApixaHydrationBoundary,
  ApixaProvider,
  QueryClient,
  useResource,
  useResourceMutation,
  useResourceQuery,
  type QueryClientConfig,
} from "apixa/react";
import { QueryClient as ServerQueryClient, createResourceQueryOptions, dehydrate } from "apixa/react/advanced";
import { QueryClient as TanStackQueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
type User = { id: string; name: string };
const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://example.test",
  resources: { users: { path: "/users", operations: { archive: { kind: "write", run: async (ctx, id: string) => ctx.request<User>({ method: "POST", path: \`/\${id}/archive\` }) } } } },
});
const config: QueryClientConfig = { staleTime: 60_000, gcTime: 300_000, retry: 1, networkMode: "online", meta: { app: "x" } };
const client = new QueryClient(config);
const same: TanStackQueryClient = client;
const server = new ServerQueryClient();
const state = dehydrate(server);
const options = createResourceQueryOptions(api.users, { queryKey: ["users"] });
const optionalArgs = { getAll: async (org?: string) => [org] };
const parameterized = { getAll: async (org: string) => [{ id: org }], getById: async (id: string) => ({ id }) };
function App() {
  // @ts-expect-error required default-query argument
  useResource(parameterized, { queryKey: ["parameterized"] });
  useResource(optionalArgs, { queryKey: ["optional"] });
  const users = useResourceQuery(api.users, { queryKey: ["users"], enabled: false, select: (data) => data.map((user) => user.name) });
  const names: string[] | undefined = users.data;
  const writes = useResourceMutation(api.users, { queryKey: ["users"] });
  const all = useResource(api.users, { queryKey: ["users"], query: { enabled: false } });
  const archived: Promise<User> = all.archive("1");
  void archived.catch(() => undefined);
  void writes;
  return <p>{names?.join(",") ?? String(options.queryKey.length)}</p>;
}
createRoot(document.getElementById("root")!).render(
  <ApixaProvider client={client}><ApixaHydrationBoundary state={state}><App /></ApixaHydrationBoundary></ApixaProvider>,
);
void same;
`,
    );
    write(
      dir,
      "runtime.mjs",
      `import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { useQueryClient } from "@tanstack/react-query";
import * as facade from "apixa/react";
import * as facadeAdvanced from "apixa/react/advanced";
const pkg = facade;

import { defineApi } from "apixa";
import { defineApi as coreDefineApi } from "apixa/core";

// Identity: every path to the React API is the same module instance.
assert.equal(facade.QueryClient, facadeAdvanced.QueryClient, "client and server entries share one QueryClient");
assert.equal(defineApi, coreDefineApi);

// Server: request-scoped client, prefetch, dehydrate; client: provider + boundary, render once.
let calls = 0;
const api = defineApi({
  baseURL: "https://example.test",
  transport: { request: async () => { calls++; return { status: 200, headers: new Headers({ "content-type": "application/json" }), raw: new Response(null), body: [{ id: "1", name: "Ada" }] }; } },
  resources: { users: { path: "/users" } },
});
const serverClient = new facadeAdvanced.QueryClient();
await facadeAdvanced.prefetchResourceQuery(serverClient, api.users, { queryKey: ["users"] });
const state = facadeAdvanced.dehydrate(serverClient);
assert.equal(calls, 1);
const otherServerClient = new facadeAdvanced.QueryClient();
assert.equal(facadeAdvanced.dehydrate(otherServerClient).queries.length, 0, "server caches are request scoped");

let seenClient;
function Users() {
  seenClient = useQueryClient();
  const query = pkg.useResourceQuery(api.users, { queryKey: ["users"] });
  return h("ul", null, (query.data ?? []).map((u) => h("li", { key: u.id }, u.name)));
}
const html = renderToString(
  h(facade.ApixaProvider, { config: { staleTime: 60_000, retry: false } },
    h(facade.ApixaHydrationBoundary, { state }, h(Users))),
);
assert.match(html, /<li>Ada<\\/li>/, "hydrated data is in the server-rendered HTML: " + html);
assert.equal(calls, 1, "no second request for prefetched data");
assert.ok(seenClient instanceof facade.QueryClient, "the provider supplies an Apixa QueryClient to TanStack's context");
console.log("React ${major}: identity, SSR hydration and single-request prefetch ok");
`,
    );
    run("pnpm", ["install", "--no-frozen-lockfile"], dir);
    const tscBin = join(dir, "node_modules/.bin/tsc");
    for (const [moduleKind, resolution] of [
      ["ESNext", "Bundler"],
      ["NodeNext", "NodeNext"],
    ]) {
      const config = JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"));
      config.compilerOptions.module = moduleKind;
      config.compilerOptions.moduleResolution = resolution;
      write(dir, "tsconfig.json", JSON.stringify(config));
      const version = run(tscBin, ["--version"], dir, { capture: true }).trim();
      run(tscBin, ["--noEmit"], dir);
      console.log(
        `React ${major}: facade declarations compile with ${version} (${resolution}, skipLibCheck: false)`,
      );
    }
    {
      // The latest TypeScript against the same project (Bundler).
      const config = JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"));
      config.compilerOptions.module = "ESNext";
      config.compilerOptions.moduleResolution = "Bundler";
      write(dir, "tsconfig.json", JSON.stringify(config));
      run("npx", ["--yes", "-p", "typescript@latest", "tsc", "--noEmit"], dir);
      console.log(
        `React ${major}: facade declarations compile with the latest TypeScript (Bundler)`,
      );
    }
    run("node", ["runtime.mjs"], dir);
    run(join(dir, "node_modules/.bin/vite"), ["build"], dir);
    write(dir, "probe-a.js", 'import { defineApi } from "apixa"; console.log(defineApi);\n');
    write(
      dir,
      "probe-b.js",
      'import { defineApi, defineMockApi } from "apixa"; console.log(defineApi, defineMockApi);\n',
    );
    write(
      dir,
      "probe.mjs",
      `import { build } from "vite";
const measure = async (input) => {
  const out = await build({ configFile: false, root: process.cwd(), logLevel: "silent", build: { write: false, minify: true, rollupOptions: { input } } });
  const files = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
  return { chunks: files.length, bytes: files.reduce((n, f) => n + (f.code?.length ?? f.source?.length ?? 0), 0) };
};
const a = await measure("probe-a.js");
const b = await measure("probe-b.js");
console.log("Vite/Rollup: defineApi only", JSON.stringify(a), "| with defineMockApi", JSON.stringify(b));
if (a.chunks !== 1) { console.error("Rollup emitted dataset chunks for an unused defineMockApi"); process.exit(1); }
if (b.chunks < 16) { console.error("defineMockApi lost its lazy dataset chunks"); process.exit(1); }
`,
    );
    run("node", ["probe.mjs"], dir);
    // One copy of everything that must be a singleton.
    const store = readdirSync(join(dir, "node_modules/.pnpm"));
    assert.ok(
      !store.some((entry) => entry.startsWith("@apixa+")),
      "no private workspace packages installed",
    );
    for (const prefix of ["apixa@", "@tanstack+react-query@", "react@", "react-dom@"]) {
      const copies = store.filter((entry) => entry.startsWith(prefix));
      assert.ok(copies.length <= 1, `duplicate ${prefix}: ${copies.join(", ")}`);
    }
    console.log(
      `React ${major}: facade typechecks with TypeScript 5.5.4, SSR runtime and Vite build passed`,
    );

    // ---- C. Next.js App Router (React 19 only) ---------------------------------------------------------------------
    if (major === 19) {
      write(
        dir,
        "app/layout.jsx",
        "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
      );
      write(
        dir,
        "lib/api.js",
        `import { defineApi } from "apixa";
globalThis.__apixaCalls ??= 0;
export const calls = () => globalThis.__apixaCalls;
export const api = defineApi({
  baseURL: "https://example.test",
  transport: { request: async () => { globalThis.__apixaCalls++; return { status: 200, headers: new Headers({ "content-type": "application/json" }), raw: new Response(null), body: [{ id: "1", name: "Ada" }, { id: "2", name: "Grace" }] }; } },
  resources: { users: { path: "/users" } },
});
`,
      );
      write(
        dir,
        "app/providers.jsx",
        '"use client";\nimport { ApixaProvider } from "apixa/react";\nexport default function Providers({ children }) { return <ApixaProvider config={{ staleTime: 60000, retry: false }}>{children}</ApixaProvider>; }\n',
      );
      write(
        dir,
        "app/users.jsx",
        '"use client";\nimport { useResourceQuery } from "apixa/react";\nimport { api } from "../lib/api";\nexport default function Users() { const query = useResourceQuery(api.users, { queryKey: ["users"] }); return <ul>{(query.data ?? []).map((u) => <li key={u.id}>{u.name}</li>)}</ul>; }\n',
      );
      write(
        dir,
        "app/page.jsx",
        `import { QueryClient, dehydrate, prefetchResourceQuery } from "apixa/react/advanced";
import { ApixaHydrationBoundary } from "apixa/react";
import { api } from "../lib/api";
import Providers from "./providers";
import Users from "./users";
export const dynamic = "force-dynamic";
export default async function Page() {
  // A new client per request: server caches never cross requests.
  const client = new QueryClient();
  await prefetchResourceQuery(client, api.users, { queryKey: ["users"] });
  return (
    <Providers>
      <ApixaHydrationBoundary state={dehydrate(client)}>
        <Users />
      </ApixaHydrationBoundary>
    </Providers>
  );
}
`,
      );
      write(
        dir,
        "app/calls/route.js",
        'import { calls } from "../../lib/api";\nexport const dynamic = "force-dynamic";\nexport function GET() { return Response.json({ calls: calls() }); }\n',
      );
      // Request isolation: the cache and data of one request never reach another, even when requests
      // overlap and finish out of order.
      write(
        dir,
        "app/who/page.jsx",
        `import { headers } from "next/headers";
import { defineApi } from "apixa";
import { ApixaHydrationBoundary } from "apixa/react";
import { QueryClient, dehydrate, prefetchResourceQuery } from "apixa/react/advanced";
import Providers from "../providers";
import Who from "./who";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = (await headers()).get("x-user") ?? "anonymous";
  const api = defineApi({
    baseURL: "https://example.test",
    transport: { request: async () => { await new Promise((r) => setTimeout(r, user === "alice" ? 250 : 5)); return { status: 200, headers: new Headers(), raw: new Response(null), body: [{ id: user, name: "hello-" + user }] }; } },
    resources: { users: { path: "/users" } },
  });
  const client = new QueryClient();
  await prefetchResourceQuery(client, api.users, { queryKey: ["who"] });
  return (
    <Providers>
      <ApixaHydrationBoundary state={dehydrate(client)}>
        <Who />
      </ApixaHydrationBoundary>
    </Providers>
  );
}
`,
      );
      write(
        dir,
        "app/who/who.jsx",
        '"use client";\nimport { defineApi } from "apixa";\nimport { useResourceQuery } from "apixa/react";\nconst api = defineApi({ baseURL: "https://example.test", transport: { request: async () => { throw new Error("must not refetch"); } }, resources: { users: { path: "/users" } } });\nexport default function Who() { const query = useResourceQuery(api.users, { queryKey: ["who"] }); return <p>{(query.data ?? []).map((u) => u.name).join(",") || "empty"}</p>; }\n',
      );
      // Binary downloads on the server: a Server Component reads a Blob (a live `fetch` Response
      // and a mocked file). Blobs are not serializable across the RSC boundary, so only plain
      // values (size, filename, text) are rendered.
      write(
        dir,
        "app/download/page.jsx",
        `import { createFetchTransport, defineApi, parseContentDisposition } from "apixa";
export const dynamic = "force-dynamic";
export default async function Page() {
  const live = defineApi({
    baseURL: "https://example.test",
    transport: createFetchTransport(async () => new Response("rsc-bytes", { headers: { "content-type": "text/plain", "content-disposition": 'attachment; filename="live.txt"' } })),
    resources: { docs: { path: "/docs", operations: { file: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" } } } },
  });
  const res = await live.docs.file("1", { full: true });
  const mocked = defineApi({
    baseURL: "https://example.test",
    resources: { docs: { path: "/docs", fileFields: ["file"], mock: [{ id: "1", name: "Seed", file: null }], operations: {
      file: { kind: "read", method: "GET", path: "/:id/file", responseType: "arrayBuffer", mock: ({ params, store, files }) => files.get(store.get(params.id).file).bytes() },
    } } },
  });
  const doc = await mocked.docs.create({ id: "2", name: "Up", file: new File(["mock-bytes"], "m.txt", { type: "text/plain" }) });
  const buffer = await mocked.docs.file(doc.id);
  return <p>{["live", res.data.size, parseContentDisposition(res.headers).filename, await res.data.text(), "mock", buffer.byteLength, new TextDecoder().decode(buffer)].join("|")}</p>;
}
`,
      );
      write(dir, "next.config.mjs", "export default {};\n");
      write(
        dir,
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            lib: ["DOM", "ES2022"],
            jsx: "preserve",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: true,
            allowJs: true,
            noEmit: true,
            incremental: true,
            plugins: [{ name: "next" }],
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        }),
      );
      const next = join(dir, "node_modules/.bin/next");
      const get = async (port, path, headers = {}) => {
        for (let attempt = 0; attempt < 120; attempt++) {
          try {
            const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
            return await response.text();
          } catch {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        throw new Error(`Next did not answer on ${port}${path}`);
      };
      const exercise = async (mode, port) => {
        const child = spawn(
          next,
          mode === "start" ? ["start", "-p", String(port)] : ["dev", "-p", String(port)],
          { cwd: dir, stdio: "ignore" },
        );
        try {
          const before = JSON.parse(await get(port, "/calls")).calls;
          const html = await get(port, "/");
          assert.match(html, /<li>Ada<\/li>/, `${mode}: server HTML contains prefetched data`);
          assert.match(html, /<li>Grace<\/li>/);
          const after = JSON.parse(await get(port, "/calls")).calls;
          assert.equal(
            after - before,
            1,
            `${mode}: one server fetch per request, none during hydration render`,
          );
          await get(port, "/");
          const twice = JSON.parse(await get(port, "/calls")).calls;
          assert.equal(
            twice - after,
            1,
            `${mode}: a second request refetches on its own request-scoped client`,
          );
          assert.match(
            await get(port, "/download"),
            /live\|9\|live\.txt\|rsc-bytes\|mock\|10\|mock-bytes/,
            `${mode}: Server Component downloads a Blob (live Response and mock)`,
          );
          const pages = await Promise.all(
            ["alice", "bob", "alice", "carol", "bob"].map((user) =>
              get(port, "/who", { "x-user": user }).then((html) => [user, html]),
            ),
          );
          for (const [user, html] of pages) {
            assert.match(
              html,
              new RegExp(`hello-${user}`),
              `${mode}: ${user}'s page shows ${user}'s data`,
            );
            for (const other of ["alice", "bob", "carol"].filter((o) => o !== user)) {
              assert.ok(
                !html.includes(`hello-${other}`),
                `${mode}: ${user}'s page leaked ${other}'s data`,
              );
            }
          }
          console.log(
            `Next ${mode}: RSC prefetch + hydration verified; concurrent requests stay isolated`,
          );
        } finally {
          child.kill("SIGTERM");
          await new Promise((r) => setTimeout(r, 500));
        }
      };
      run(next, ["build"], dir);
      await exercise("start", 3411);
      await exercise("dev", 3412);
    }
  }
  console.log("\nunified apixa packed consumer ok");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
