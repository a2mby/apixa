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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { ApiError, HttpError, createFetchTransport, defineApi, defineMockApi } from "apixa";
import "apixa/mocking/register";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
export async function run() {
  const out = {};
  const inline = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: [{ id: "1", name: "Ada" }] } } });
  out.inline = (await inline.users.getAll()).map((u) => u.name);
  await inline.users.create({ name: "Grace" });
  out.afterCreate = (await inline.users.getAll()).length;
  const named = defineApi({ baseURL: "https://edge.test", resources: { users: { path: "/users", mock: "users-mock" } } });
  out.named = (await named.users.getAll()).length > 0;
  const standalone = defineMockApi({ resources: { users: { type: "users-mock", readOnly: true } } });
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
  out.nodeGlobals = { process: typeof globalThis.process, Buffer: typeof globalThis.Buffer, require: typeof globalThis.require };
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
  assert.deepEqual(out.inline, ["Ada"], `${label}: inline mock`);
  assert.equal(out.afterCreate, 2, `${label}: mock create`);
  assert.equal(out.named, true, `${label}: named dataset loads after registration`);
  assert.equal(out.standalone, true, `${label}: defineMockApi named dataset`);
  assert.equal(out.live.auth, "Bearer t", `${label}: headers reach the fetch implementation`);
  assert.match(out.live.url, /^https:\/\/upstream\.test\/users/, `${label}: fetch URL`);
  assert.equal(out.httpError, true, `${label}: HttpError identity and status`);
  assert.equal(out.aborted, true, `${label}: cancellation surfaces as an ApiError`);
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
  const version = "1.0.0-rc.0";
  const tarballs = {};
  for (const [name, dir] of [
    ["@apixa/core", "packages/core"],
    ["@apixa/mocking", "packages/mocking"],
    ["@apixa/react", "packages/react"],
    ["apixa", "."],
  ]) {
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
      tarballs["@apixa/core"],
      tarballs["@apixa/mocking"],
      tarballs["@apixa/react"],
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
