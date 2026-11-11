// Measures memory and CPU of the file paths documented in versions/v1.8.0 (not a CI gate:
// thresholds live in tests/core/file-memory-bounds.test.ts as ratios and byte caps).
// Run: pnpm build && node --expose-gc scripts/measure-file-memory.mjs
import http from "node:http";
import { createFetchTransport, defineApi, mockFiles } from "../packages/core/dist/index.js";

const MiB = 1024 * 1024;
const mb = (n) => (n / MiB).toFixed(0);
const gc = () => globalThis.gc?.();

/** Peak resident-set growth (and external buffers) while `run` executes. */
async function peak(run) {
  gc();
  const base = process.memoryUsage();
  let rss = 0;
  let ext = 0;
  const timer = setInterval(() => {
    const m = process.memoryUsage();
    rss = Math.max(rss, m.rss - base.rss);
    ext = Math.max(ext, m.arrayBuffers - base.arrayBuffers);
  }, 2);
  const started = performance.now();
  await run();
  const ms = performance.now() - started;
  clearInterval(timer);
  return { rss, ext, ms };
}

// ---- 1. advanced upload: memory does not grow with file size -------------------------------
function offsetProtocol() {
  const acks = new Map();
  return {
    id: "measure",
    version: 1,
    independentParts: true,
    replaySafeParts: true,
    emptyFile: "complete",
    initiate: async () => ({ id: "s" }),
    inspect: async () => ({ state: "active", parts: [...acks.values()] }),
    uploadPart: async (_ctx, { part }) => {
      await part.blob.arrayBuffer(); // the part is read once, then dropped
      const ack = {
        index: part.index,
        offset: part.offset,
        size: part.size,
        verification: "unverified",
      };
      acks.set(part.index, ack);
      return ack;
    },
    complete: async (ctx) =>
      ctx.request({ kind: "write", method: "POST", path: "/complete", full: true }),
  };
}
const fake = {
  async request() {
    const raw = new Response("{}", { headers: { "content-type": "application/json" } });
    return { status: 200, headers: raw.headers, raw, body: {} };
  },
};
async function advancedUpload(size, chunkSize, concurrency, integrity = "none", saveCheckpoint) {
  const api = defineApi({
    baseURL: "https://api.example.com",
    transport: fake,
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: {
          create: {
            transfer: {
              strategy: "chunked",
              source: "document",
              chunkSize,
              concurrency,
              integrity,
              protocol: offsetProtocol(),
            },
          },
        },
      },
    },
  });
  const blob = new Blob([new Uint8Array(size)]);
  return peak(() =>
    api.files.create({ document: blob }, saveCheckpoint ? { transfer: { saveCheckpoint } } : {}),
  );
}
console.log("1. advanced upload, 8 MiB parts, concurrency 2, no hashing");
for (const size of [64 * MiB, 256 * MiB, 512 * MiB]) {
  const r = await advancedUpload(size, 8 * MiB, 2, "none");
  console.log(
    `   file ${mb(size).padStart(4)} MiB -> peak rss growth ${mb(r.rss)} MiB, peak external buffers ${mb(r.ext)} MiB, ${r.ms.toFixed(0)} ms`,
  );
}
const hashed = await advancedUpload(256 * MiB, 8 * MiB, 1, "sha256");
console.log(
  `   sha256 manifest, 256 MiB -> peak external ${mb(hashed.ext)} MiB, ${hashed.ms.toFixed(0)} ms (${((256 / hashed.ms) * 1000).toFixed(0)} MiB/s including upload)`,
);

// ---- 2. checkpoint cost versus part count ---------------------------------------------------
console.log("2. checkpointing cost per part (1-byte parts, saveCheckpoint on every ack)");
for (const parts of [500, 2000, 8000]) {
  const r = await advancedUpload(parts, 1, 1, "sha256", () => {});
  console.log(
    `   ${String(parts).padStart(5)} parts -> ${(r.ms / parts).toFixed(3)} ms/part (${r.ms.toFixed(0)} ms total)`,
  );
}

// ---- 3. mock storage scaling ----------------------------------------------------------------
console.log("3. mock file storage put() time per file");
const api = defineApi({
  baseURL: "https://e.test",
  resources: { docs: { path: "/docs", fileFields: ["file"], mock: [{ id: 1, file: "" }] } },
});
const files = mockFiles(api);
let n = 0;
for (const upTo of [1000, 2000, 4000]) {
  const from = n;
  const t = performance.now();
  for (; n < upTo; n++)
    await files.put(new Blob(["x"]), { resource: "docs", field: "file", name: `f${n}.txt` });
  console.log(
    `   files ${String(from).padStart(4)}..${upTo}: ${((performance.now() - t) / (upTo - from)).toFixed(3)} ms/put`,
  );
}

// ---- 4. multipart versus raw Blob upload through the fetch transport (Node) ---------------
console.log("4. 128 MiB upload to a draining loopback server (Node fetch transport)");
const server = http.createServer((req, res) => {
  req.on("data", () => {});
  req.on("end", () => res.end("ok"));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const transport = createFetchTransport();
const big = new File([new Uint8Array(128 * MiB)], "big.bin");
for (const [label, body] of [
  ["raw Blob body", () => big],
  [
    "multipart FormData",
    () => {
      const f = new FormData();
      f.append("file", big);
      return f;
    },
  ],
]) {
  for (const progress of [false, true]) {
    const r = await peak(() =>
      transport.request({
        method: "POST",
        url,
        headers: new Headers(),
        body: body(),
        responseType: "text",
        ...(progress ? { onTransfer: () => {} } : {}),
      }),
    );
    console.log(
      `   ${label.padEnd(20)} ${progress ? "with onTransfer" : "no progress   "} -> peak rss growth ${mb(r.rss)} MiB`,
    );
  }
}
server.close();
