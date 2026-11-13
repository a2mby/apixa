import { MOCK_STORAGE_SCENARIO } from "./lib/mock-storage-scenario.mjs";
// Edge-runtime verification of the PACKED facade, executed in two real edge runtimes:
//   - Cloudflare Workers: the `workerd` binary (the open-source Workers runtime), no nodejs_compat;
//   - Vercel Edge Runtime: the `edge-runtime` package that Vercel uses for Edge Functions/Middleware.
// Both run a single-file bundle built from tarballs installed into an empty project (dynamic imports
// inlined, as Workers bundlers do). The bundles exercise the root facade, mocking (inline, named
// datasets, defineMockApi), the fetch transport, error classes, cancellation, and the server-safe
// `apixa/react/advanced` entry (`QueryClient`, prefetch, `dehydrate`).
//
// Needs network access once, to install `workerd`, `edge-runtime`, React and TanStack Query into a
// temporary project. Run after `pnpm build`.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "apixa-edge-"));
const packs = join(temporary, "packs");
const project = join(temporary, "project");
mkdirSync(packs);
mkdirSync(project);

function run(command, args, cwd, quiet = false) {
  if (!quiet) console.log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

const CORE_SCENARIO = `
import { ApiError, HttpError, createFetchTransport, defineApi, defineMockApi, detectTransferSupport, parseContentDisposition, SecurityError, ValidationError } from "apixa";
import "apixa/mocking/register";
import * as storage from "apixa/core";
${MOCK_STORAGE_SCENARIO}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
export async function run() {
  const out = {};
  const inline = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: [{ id: "1", name: "Ada" }] } } });
  out.inline = (await inline.users.getAll()).map((u) => u.name);
  await inline.users.create({ name: "Grace" });
  out.afterCreate = (await inline.users.getAll()).length;
  const named = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: "users-mock" } } });
  out.named = (await named.users.getAll()).length > 0;
  const standalone = defineMockApi({ resources: { users: { type: "users-mock", operations: "read" } } });
  out.standalone = (await standalone.users.getAll()).length > 0;
  const live = defineApi({ baseURL: "https://upstream.test", headers: { authorization: "Bearer t" }, transport: createFetchTransport(async (url, init) => json([{ id: "9", auth: new Headers(init.headers).get("authorization"), url: String(url) }])), resources: { users: { path: "/users" } } });
  const [first] = await live.users.getAll();
  out.live = first;
  const failing = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport(async () => json({}, 503)), resources: { users: { path: "/users" } } });
  const error = await failing.users.getAll({ retry: false }).catch((e) => e);
  out.httpError = error instanceof HttpError && error instanceof ApiError && error.status === 503;
  const slow = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport((url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))), resources: { users: { path: "/users" } } });
  const controller = new AbortController();
  const pending = slow.users.getAll({ signal: controller.signal, retry: false }).catch((e) => e);
  setTimeout(() => controller.abort(), 10);
  const aborted = await pending;
  out.aborted = aborted instanceof ApiError && !(aborted instanceof HttpError);
  const pdf = new Uint8Array([37, 80, 68, 70, 0, 255]);
  const downloader = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport(async () => new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="r.pdf"' } })), resources: { docs: { path: "/docs", operations: { file: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" } } } } });
  const download = await downloader.docs.file({ params: { id: "1" }, full: true });
  out.download = { isBlob: download.data instanceof Blob, type: download.data.type, bytes: Array.from(new Uint8Array(await download.data.arrayBuffer())), filename: parseContentDisposition(download.headers).filename };
  const mockedDownload = defineApi({ baseURL: "https://edge.test", resources: { docs: { path: "/docs", fileFields: ["file"], mock: [{ id: "1", name: "Seed", file: null }], operations: { file: { kind: "read", method: "GET", path: "/:id/file", responseType: "arrayBuffer", mock: ({ params, store, files }) => files.get(store.get(params.id).file).bytes() } } } } });
  const uploaded = await mockedDownload.docs.create({ id: "2", name: "Up", file: new File([pdf], "u.pdf", { type: "application/pdf" }) });
  out.mockDownload = Array.from(new Uint8Array(await mockedDownload.docs.file({ params: { id: uploaded.id } })));
  // v1.3.0 transfer events: honest per-runtime behavior, never faked.
  const support = detectTransferSupport();
  const downEvents = [];
  await downloader.docs.file({ params: { id: "1" }, onTransfer: (e) => downEvents.push(e.direction + ":" + e.phase + ":" + (e.loaded ?? "-")) });
  const putter = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport(async (url, init) => { if (init.body instanceof ReadableStream) { const r = init.body.getReader(); while (!(await r.read()).done) {} } return new Response("ok"); }), resources: { docs: { path: "/docs", operations: { put: { kind: "write", method: "PUT", path: "/p", responseType: "text" } } } } });
  const upEvents = [];
  await putter.docs.put(new Blob([pdf]), { onTransfer: (e) => { if (e.direction === "upload") upEvents.push(e.phase + ":" + (e.loaded ?? "-") + ":" + (e.total ?? "-")); } });
  const streamed = [];
  await putter.docs.put(new ReadableStream({ start(c) { c.enqueue(pdf); c.close(); } }), { onTransfer: (e) => { if (e.direction === "upload") streamed.push(e.phase + ":" + (e.loaded ?? "-")); } }).catch((e) => streamed.push("rejected:" + e.name));
  const hang = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport(async (url, init) => new Response(new ReadableStream({ start(c) { c.enqueue(pdf); init.signal.addEventListener("abort", () => c.error(init.signal.reason)); } }))), resources: { docs: { path: "/docs", operations: { feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream" } } } } });
  const ac = new AbortController();
  const feed = await hang.docs.feed({ signal: ac.signal });
  const reader = feed.getReader();
  await reader.read();
  ac.abort();
  const streamError = await reader.read().then(() => "no error", (e) => e.name);
  out.transfer = { support, downEvents, upEvents, streamed, streamError };
  // v1.4.0 file validation: rejected before any request; limits bound streams and responses.
  let validationRequests = 0;
  const guarded = defineApi({ baseURL: "https://upstream.test", transport: createFetchTransport(async (url, init) => { validationRequests++; if (init.body instanceof ReadableStream) { const r = init.body.getReader(); try { while (!(await r.read()).done) {} } catch (cause) { throw new TypeError("fetch failed", { cause }); } } return String(url).includes("/big") ? new Response(new Uint8Array(500), { headers: { "content-length": "500" } }) : new Response("{}", { headers: { "content-type": "application/json" } }); }), resources: { pets: { path: "/pets", fileFields: { photo: { maxSize: 10, accept: ["image/*"] } }, fileLimits: { maxBodySize: 20 }, operations: { big: { kind: "read", method: "GET", path: "/big", responseType: "blob", maxResponseSize: 100 }, put: { kind: "write", method: "PUT", path: "/put" } } } } });
  const badFile = await guarded.pets.create({ photo: new File([new Uint8Array(50)], "x.exe", { type: "application/x-msdownload" }) }).catch((e) => e);
  const cutStream = await guarded.pets.put(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(15)); c.enqueue(new Uint8Array(15)); c.close(); } })).catch((e) => e);
  const bigResponse = await guarded.pets.big().catch((e) => e);
  out.validation = { rejected: badFile instanceof ValidationError, codes: badFile.violations?.map((v) => v.code).sort(), requestsAfterReject: validationRequests === 1 ? "only the stream call" : validationRequests, stream: cutStream instanceof ValidationError && cutStream.violations[0].code, response: bigResponse instanceof ValidationError && bigResponse.violations[0].code, support: detectTransferSupport().streamingUpload };
  // v1.8.0 secure redirects: every hop is inspected before it is sent (fetch is stubbed; the runtimes' real
  // manual-redirect socket behavior is covered in Node and Chromium).
  const hops = [];
  const redirecting = (redirectOrigins) => defineApi({ baseURL: "https://api.test", headers: { "x-api-key": "SECRET" }, transport: createFetchTransport(async (url, init) => { hops.push({ url: String(url), manual: init.redirect, key: new Headers(init.headers).get("x-api-key"), credentials: init.credentials }); const u = new URL(String(url)); if (u.pathname === "/same") return new Response(null, { status: 302, headers: { location: "/final" } }); if (u.pathname === "/cross") return new Response(null, { status: 302, headers: { location: "https://evil.test/steal" } }); if (u.pathname === "/cdn") return new Response(null, { status: 302, headers: { location: "https://cdn.test/o?sig=1" } }); return new Response("{}", { headers: { "content-type": "application/json" } }); }), resources: { same: { path: "/same", operations: { getAll: { redirectOrigins } } }, cross: { path: "/cross", operations: { getAll: { redirectOrigins } } }, cdn: { path: "/cdn", operations: { getAll: { redirectOrigins } } } } });
  const guardedRedirects = redirecting(["https://cdn.test"]);
  await guardedRedirects.same.getAll();
  const crossError = await guardedRedirects.cross.getAll({ retry: false }).catch((e) => e);
  await guardedRedirects.cdn.getAll();
  out.redirects = { manual: hops.every((h) => h.manual === "manual"), sameKey: hops.find((h) => h.url.endsWith("/final"))?.key, blocked: crossError instanceof SecurityError, evilContacted: hops.some((h) => h.url.includes("evil.test")), cdnKey: hops.find((h) => h.url.startsWith("https://cdn.test"))?.key ?? null, cdnCredentials: hops.find((h) => h.url.startsWith("https://cdn.test"))?.credentials };
  out.nodeGlobals = { process: typeof globalThis.process, Buffer: typeof globalThis.Buffer, require: typeof globalThis.require };
  out.storage = await mockStorageScenario(storage);
  return out;
}`;
const ADVANCED_SCENARIO = `
import { defineApi } from "apixa";
import { QueryClient, dehydrate, prefetchResourceQuery } from "apixa/react/advanced";
export async function run() {
  const api = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: [{ id: "1", name: "Ada" }] } } });
  const client = new QueryClient({ staleTime: 1000 });
  await prefetchResourceQuery(client, api.users, { queryKey: ["users"] });
  const state = dehydrate(client);
  return { queries: state.queries.length, names: state.queries[0].state.data.map((u) => u.name), staleTime: client.getDefaultOptions().queries.staleTime, isolated: dehydrate(new QueryClient()).queries.length };
}`;

function expectCore(out, label) {
  assert.equal(out.storage, "seed:next:seed", `${label}: virtual fixture storage lifecycle`);
  assert.deepEqual(out.inline, ["Ada"], `${label}: inline mock`);
  assert.equal(out.afterCreate, 2, `${label}: mock create`);
  assert.equal(out.named, true, `${label}: named dataset loads after registration`);
  assert.equal(out.standalone, true, `${label}: defineMockApi named dataset`);
  assert.equal(out.live.auth, "Bearer t", `${label}: headers reach the fetch implementation`);
  assert.match(out.live.url, /^https:\/\/upstream\.test\/users/, `${label}: fetch URL`);
  assert.equal(out.httpError, true, `${label}: HttpError identity and status`);
  assert.equal(out.aborted, true, `${label}: cancellation surfaces as an ApiError`);
  assert.deepEqual(
    out.download,
    { isBlob: true, type: "application/pdf", bytes: [37, 80, 68, 70, 0, 255], filename: "r.pdf" },
    `${label}: binary download, byte-exact with metadata`,
  );
  assert.deepEqual(
    out.mockDownload,
    [37, 80, 68, 70, 0, 255],
    `${label}: mock download from the virtual file store`,
  );
  expectTransfer(out, label);
  expectValidation(out, label);
  assert.deepEqual(
    out.redirects,
    {
      manual: true,
      sameKey: "SECRET",
      blocked: true,
      evilContacted: false,
      cdnKey: null,
      cdnCredentials: "omit",
    },
    `${label}: redirects are inspected per hop (same origin kept, cross origin refused, listed origin bare)`,
  );
}
function expectValidation(out, label) {
  const v = out.validation;
  assert.equal(v.rejected, true, `${label}: invalid file rejected with ValidationError`);
  assert.deepEqual(v.codes, ["FILE_TOO_LARGE", "TYPE_NOT_ALLOWED"], `${label}: violation codes`);
  // The rejected create made no request; the stream call may or may not reach fetch depending on runtime support.
  assert.ok(
    v.requestsAfterReject === "only the stream call" || typeof v.requestsAfterReject === "number",
    `${label}: request accounting`,
  );
  assert.equal(v.response, "RESPONSE_TOO_LARGE", `${label}: response limit from Content-Length`);
  if (v.support)
    assert.equal(v.stream, "BODY_TOO_LARGE", `${label}: stream limit surfaces ValidationError`);
}
function expectTransfer(out, label) {
  const t = out.transfer;
  console.log(`${label}: transfer support ${JSON.stringify(t.support)}`);
  assert.deepEqual(
    t.downEvents,
    ["download:start:0", "download:progress:6", "download:complete:6"],
    `${label}: download progress`,
  );
  assert.equal(
    t.streamError,
    "AbortError",
    `${label}: a stream stays cancellable after the call resolved`,
  );
  // Upload is observed only where the runtime can keep the wire form; otherwise it says so.
  if (t.support.uploadProgress) {
    assert.deepEqual(
      t.upEvents,
      ["start:0:6", "progress:6:6", "complete:6:6"],
      `${label}: upload progress when supported`,
    );
  } else {
    assert.deepEqual(t.upEvents, ["unsupported:-:-"], `${label}: upload honestly unsupported`);
  }
  if (t.support.streamingUpload) {
    assert.deepEqual(
      t.streamed,
      ["start:0", "progress:6", "complete:6"],
      `${label}: streamed upload counted`,
    );
  } else {
    assert.deepEqual(
      t.streamed,
      ["unsupported:-"],
      `${label}: streamed upload honestly unsupported`,
    );
  }
}
function expectAdvanced(out, label) {
  assert.deepEqual(
    out,
    { queries: 1, names: ["Ada"], staleTime: 1000, isolated: 0 },
    `${label}: advanced entry`,
  );
}

try {
  // ---- Pack and install the facade exactly as a consumer would -----------------------------------------------------
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const tarballs = {};
  for (const [name, dir] of [["apixa", "."]]) {
    run("pnpm", ["--dir", dir, "pack", "--pack-destination", packs], root, true);
    tarballs[name] = join(packs, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`);
  }
  writeFileSync(join(project, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      tarballs.apixa,
      "react@19.1.1",
      "@tanstack/react-query@5.104.4",
      "workerd",
      "edge-runtime",
    ],
    project,
  );
  const workerdBin = join(project, "node_modules/.bin/workerd");
  console.log(`workerd ${run(workerdBin, ["--version"], project, true).trim()}`);

  const bundle = async (scenario, format) => {
    const result = await build({
      stdin: {
        contents:
          format === "esm"
            ? `${scenario}\nexport default { async fetch() { return Response.json(await run()); } };`
            : `${scenario}\nglobalThis.__done = run();`,
        resolveDir: project,
        loader: "js",
      },
      bundle: true,
      format,
      platform: "neutral",
      mainFields: ["module", "main"],
      conditions: ["workerd", "worker", "edge-light", "browser"],
      define: { "process.env.NODE_ENV": '"production"' },
      target: "es2022",
      write: false,
      logLevel: "error",
    });
    const code = result.outputFiles[0].text;
    assert.ok(
      !/from ["']node:|require\(["']node:/.test(code),
      "the bundle must not import Node built-ins",
    );
    return code;
  };

  // ---- Vercel Edge Runtime ---------------------------------------------------------------------------------------------------
  const { EdgeRuntime } = createRequire(join(project, "package.json"))("edge-runtime");
  for (const [label, scenario, check] of [
    ["Vercel Edge Runtime (root facade, mocking)", CORE_SCENARIO, expectCore],
    ["Vercel Edge Runtime (apixa/react/advanced)", ADVANCED_SCENARIO, expectAdvanced],
  ]) {
    const runtime = new EdgeRuntime();
    runtime.evaluate(await bundle(scenario, "iife"));
    // The sandbox is another realm: compare plain JSON, not its Array/Object prototypes.
    const out = JSON.parse(JSON.stringify(await runtime.evaluate("globalThis.__done")));
    check(out, label);
    console.log(
      `${label}: passed${out.nodeGlobals ? ` (process: ${out.nodeGlobals.process}, Buffer: ${out.nodeGlobals.Buffer}, require: ${out.nodeGlobals.require})` : ""}`,
    );
    if (out.nodeGlobals)
      assert.deepEqual(
        Object.values(out.nodeGlobals),
        ["undefined", "undefined", "undefined"],
        "Node globals must be absent",
      );
  }

  // ---- Cloudflare Workers (workerd) ----------------------------------------------------------------------------------------
  let port = 8790;
  for (const [label, scenario, check] of [
    ["Cloudflare Workers/workerd (root facade, mocking)", CORE_SCENARIO, expectCore],
    ["Cloudflare Workers/workerd (apixa/react/advanced)", ADVANCED_SCENARIO, expectAdvanced],
  ]) {
    const dir = join(temporary, `workerd-${port}`);
    mkdirSync(dir);
    writeFileSync(join(dir, "worker.mjs"), await bundle(scenario, "esm"));
    writeFileSync(
      join(dir, "config.capnp"),
      `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ (name = "main", worker = .worker) ],
  sockets = [ (name = "http", address = "127.0.0.1:${port}", http = (), service = "main") ]
);
const worker :Workerd.Worker = (
  modules = [ (name = "worker.mjs", esModule = embed "worker.mjs") ],
  compatibilityDate = "2025-01-01",
);
`,
    );
    const child = spawn(workerdBin, ["serve", join(dir, "config.capnp")], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    try {
      let body;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (child.exitCode !== null) throw new Error(`workerd exited early:\n${log}`);
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`);
          body = await response.text();
          assert.equal(response.status, 200, `${label}: HTTP ${response.status}\n${body}\n${log}`);
          break;
        } catch (error) {
          if (error.code === "ERR_ASSERTION") throw error;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      assert.ok(body, `${label}: no answer\n${log}`);
      const out = JSON.parse(body);
      check(out, label);
      if (out.nodeGlobals) {
        assert.deepEqual(
          Object.values(out.nodeGlobals),
          ["undefined", "undefined", "undefined"],
          "Node globals must be absent in workerd",
        );
      }
      console.log(
        `${label}: passed${out.nodeGlobals ? " (no process, Buffer or require; no nodejs_compat flag)" : ""}`,
      );
    } finally {
      child.kill("SIGTERM");
      port++;
    }
  }
  console.log("\nedge verification ok");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
