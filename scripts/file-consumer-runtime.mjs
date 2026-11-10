import * as advancedCore from "apixa/core";
// Executed inside the packed React 18 / React 19 consumers (see verify-react-consumers.mjs): real hooks
// from the published `apixa` package upload, download, report progress, cancel, time out, reject files
// with typed errors and use mock fixtures. Node's own Blob/File/FormData/Response are used (jsdom only
// provides the DOM), so bytes are asserted exactly; jsdom's Blob limits are covered by the workspace suite.
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AbortError,
  TimeoutError,
  ValidationError,
  createFetchTransport,
  defineApi,
  mockFileFixture,
  mockFiles,
  mockFixtureRef,
  resetMock,
} from "apixa/core";
import { useResource, useResourceMutation, useResourceQuery } from "apixa/react";

const expectedMajor = process.env.REACT_MAJOR;
assert.ok(
  React.version.startsWith(`${expectedMajor}.`),
  `expected React ${expectedMajor}, got ${React.version}`,
);

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await act(async () => wait(10));
  }
  throw new Error(`timed out waiting for ${label}`);
};

const requests = [];
let nextResponse;
const stubFetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  requests.push(`${method} ${url.pathname}`);
  if (nextResponse) {
    const respond = nextResponse;
    nextResponse = undefined;
    return respond(init);
  }
  const signal = init.signal;
  if (url.pathname.endsWith("/file")) {
    let sent = 0;
    const body = new ReadableStream(
      {
        async pull(controller) {
          await wait(5);
          if (signal.aborted) return controller.error(signal.reason);
          if (sent++ < 3) controller.enqueue(new Uint8Array(4).fill(9));
          else controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    signal.addEventListener("abort", () => body.cancel(signal.reason).catch(() => {}), {
      once: true,
    });
    return new Response(body, {
      headers: { "content-length": "12", "content-type": "application/octet-stream" },
    });
  }
  if (method === "GET") return Response.json([{ id: "1", name: "one" }]);
  let received = 0;
  if (init.body instanceof ReadableStream) {
    const reader = init.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
  } else if (init.body) {
    received = (await new Response(init.body).arrayBuffer()).byteLength;
  }
  return Response.json({ id: "2", name: "made", photo: `ref-${received}` }, { status: 201 });
};

const api = defineApi()({
  baseURL: "https://files.example.test/v1",
  transport: createFetchTransport(stubFetch),
  resources: {
    docs: {
      path: "/docs",
      fileFields: { photo: { maxSize: 8, accept: ["image/*"] } },
      operations: {
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
        send: { kind: "write", method: "PUT", path: "/send", responseType: "text" },
      },
    },
  },
});

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const root = createRoot(document.getElementById("root"));
let current;
function Probe({ useHook }) {
  current = useHook();
  return null;
}
let mounts = 0;
async function mount(useHook) {
  // A new key per scenario remounts the probe, so each one starts with its own hook order.
  await act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(Probe, { key: ++mounts, useHook }),
      ),
    );
  });
}
const png = (size) => new File([new Uint8Array(size)], "secret-name.png", { type: "image/png" });

// 1. A query download reports counted progress with a trustworthy total and caches a Blob.
{
  const events = [];
  await mount(() =>
    useResourceQuery(api.docs, {
      queryKey: ["download"],
      operation: "download",
      args: ["1", { onTransfer: (e) => events.push(e) }],
    }),
  );
  await until(() => current.isSuccess, "download query");
  assert.ok(current.data instanceof Blob && current.data.size === 12, "Blob result");
  assert.deepEqual(
    new Uint8Array(await current.data.arrayBuffer()),
    new Uint8Array(12).fill(9),
    "byte-exact",
  );
  assert.deepEqual(
    [events[0].phase, events.at(-1).phase, events.at(-1).loaded, events.at(-1).total],
    ["start", "complete", 12, 12],
  );
  assert.equal(
    client.getQueryCache().findAll({ queryKey: ["download"] }).length,
    1,
    "one cache entry",
  );
  console.log(`React ${expectedMajor}: query download with progress ok`);
}

// 2. A rejected file: typed ValidationError, nothing sent; an accepted file is created and the list refetches.
{
  await mount(() => useResource(api.docs, { queryKey: ["docs"] }));
  await until(() => current.isSuccess, "list query");
  const before = requests.filter((r) => r.startsWith("POST")).length;
  const error = await act(async () =>
    current.create({ name: "x", photo: png(50) }).catch((e) => e),
  );
  assert.ok(error instanceof ValidationError, "ValidationError identity across the packed entries");
  assert.deepEqual(
    error.violations.map((v) => [v.code, v.path, v.limit, v.actual]),
    [["FILE_TOO_LARGE", "$.photo", 8, 50]],
  );
  assert.ok(
    !JSON.stringify(error.violations).includes("secret-name"),
    "no file name in violations",
  );
  await until(() => current.states.create.error instanceof ValidationError, "mutation error state");
  assert.equal(
    requests.filter((r) => r.startsWith("POST")).length,
    before,
    "rejected file sent nothing",
  );
  const lists = () => requests.filter((r) => r === "GET /v1/docs").length;
  const listsBefore = lists();
  await act(async () => {
    await current.create({ name: "ok", photo: png(4) });
  });
  await until(() => lists() > listsBefore, "list refetch after create");
  console.log(`React ${expectedMajor}: typed validation error, accepted upload, invalidation ok`);
}

// 3. Cancellation, timeout and a counted stream upload through a flat operation.
{
  await mount(() => useResource(api.docs, { queryKey: ["docs"] }));
  await until(() => current.isSuccess, "list query");
  const controller = new AbortController();
  const abortEvents = [];
  const pending = current
    .download("1", { signal: controller.signal, onTransfer: (e) => abortEvents.push(e.phase) })
    .catch((e) => e);
  setTimeout(() => controller.abort(), 8);
  assert.ok((await act(async () => pending)) instanceof AbortError, "caller abort");
  assert.equal(abortEvents.filter((p) => p === "abort").length, 1, "one abort event");

  nextResponse = (init) =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(2));
          init.signal.addEventListener("abort", () => c.error(init.signal.reason));
        },
      }),
      { headers: { "content-length": "99" } },
    );
  const timeout = await act(async () => current.download("1", { timeout: 30 }).catch((e) => e));
  assert.ok(timeout instanceof TimeoutError, "timeout");

  const upload = [];
  await act(async () => {
    await current.send(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < 3; i++) c.enqueue(new Uint8Array(4));
          c.close();
        },
      }),
      { onTransfer: (e) => e.direction === "upload" && upload.push(e) },
    );
  });
  assert.deepEqual(
    [upload[0].phase, upload.at(-1).phase, upload.at(-1).loaded],
    ["start", "complete", 12],
    "counted stream upload",
  );
  console.log(`React ${expectedMajor}: cancellation, timeout and stream upload progress ok`);
}

// 4. Mock fixtures and managed files through the hooks; no network.
{
  const mocked = defineApi()({
    baseURL: "https://mock.example.test",
    resources: {
      pets: {
        path: "/pets",
        fileFields: { photo: { maxSize: 8 } },
        mock: {
          data: [{ id: 1, name: "Seed", photo: mockFixtureRef("seed") }],
          fixtures: { seed: mockFileFixture("seed", { name: "seed.txt" }) },
          storage: { disk: "consumer" },
        },
      },
    },
  });
  await mount(() => useResourceMutation(mocked.pets, { queryKey: ["pets"] }));
  const filesBefore = mockFiles(mocked).size;
  const rejected = await act(async () =>
    current.create({ name: "big", photo: new File([new Uint8Array(99)], "b.txt") }).catch((e) => e),
  );
  assert.ok(rejected instanceof ValidationError);
  assert.equal(mockFiles(mocked).size, filesBefore, "rejected write left the store");
  await act(async () => {
    await current.patch(1, { photo: new File(["changed"], "new.txt") });
  });
  assert.equal(
    mockFiles(mocked)
      .get((await mocked.pets.getById(1)).photo)
      .text(),
    "changed",
  );
  resetMock(mocked);
  assert.equal(
    mockFiles(mocked)
      .get((await mocked.pets.getById(1)).photo)
      .text(),
    "seed",
  );
  console.log(`React ${expectedMajor}: mock fixtures, validation and reset ok`);
}

assert.equal(
  await advancedTransferScenario(advancedCore, async (api, body, options) => {
    await mount(() => useResourceMutation(api.files, { queryKey: ["advanced-packed"] }));
    let result;
    await act(async () => {
      result = await current.create(body, options);
    });
    return result;
  }),
  "advanced:resumed:8",
  "packed hook advanced transfer recovery",
);
await act(async () => root.unmount());
console.log(`React ${expectedMajor}: file runtime scenarios passed (${React.version})`);
