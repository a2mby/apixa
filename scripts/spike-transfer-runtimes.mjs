// Batch 0 spike (not shipped): what the runtime actually does with streamed request bodies.
// Run: node scripts/spike-transfer-runtimes.mjs
import http from "node:http";

const seen = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    seen.push({
      te: req.headers["transfer-encoding"],
      cl: req.headers["content-length"],
      ct: req.headers["content-type"],
      bytes: Buffer.concat(chunks).length,
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(seen.at(-1)));
  });
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const report = {};
const attempt = async (name, fn) => {
  try {
    report[name] = await fn();
  } catch (e) {
    report[name] = `THROWS ${e.name}: ${e.message} ${e.cause ? "| " + e.cause.message : ""}`;
  }
};

const blob = new Blob([new Uint8Array(1000)], { type: "application/octet-stream" });
const streamOf = (b) => b.stream();

await attempt("stream body without duplex", async () =>
  (await fetch(url, { method: "POST", body: streamOf(blob) })).json(),
);
await attempt("stream body with duplex half (chunked)", async () =>
  (await fetch(url, { method: "POST", body: streamOf(blob), duplex: "half" })).json(),
);
await attempt("blob body (baseline)", async () =>
  (await fetch(url, { method: "POST", body: blob })).json(),
);
await attempt("stream + explicit content-length", async () =>
  (
    await fetch(url, {
      method: "POST",
      body: streamOf(blob),
      duplex: "half",
      headers: { "content-length": String(blob.size), "content-type": "application/octet-stream" },
    })
  ).json(),
);
const form = new FormData();
form.append("a", "x");
form.append("f", blob, "f.bin");
await attempt("formdata baseline", async () =>
  (await fetch(url, { method: "POST", body: form })).json(),
);
await attempt("formdata via Response -> blob -> stream + content-length", async () => {
  const r = new Response(form);
  const ct = r.headers.get("content-type");
  const b = await r.blob();
  return (
    await fetch(url, {
      method: "POST",
      body: b.stream(),
      duplex: "half",
      headers: { "content-type": ct, "content-length": String(b.size) },
    })
  ).json();
});
await attempt("content-length settable probe", () =>
  new Request("http://x", {
    method: "POST",
    body: "a",
    headers: { "content-length": "1" },
  }).headers.has("content-length"),
);
await attempt("streaming request probe (Request duplex)", () => {
  let duplexAccessed = false;
  const hasContentType = new Request("http://x", {
    body: new ReadableStream(),
    method: "POST",
    get duplex() {
      duplexAccessed = true;
      return "half";
    },
  }).headers.has("Content-Type");
  return { duplexAccessed, hasContentType };
});
console.log(JSON.stringify({ runtime: process.version, report }, null, 2));
server.close();
