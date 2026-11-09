// Batch 0 spike (not shipped): what surfaces when a request stream errors mid-send, and File metadata edge cases.
// Run: node scripts/spike-file-validation.mjs
import http from "node:http";

const server = http.createServer((req, res) => {
  let n = 0;
  req.on("data", (c) => (n += c.length));
  req.on("end", () => res.end(String(n)));
  req.on("error", () => {});
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const report = {};

class Boom extends Error {}
let pulls = 0;
const body = new ReadableStream(
  {
    pull(c) {
      pulls++;
      if (pulls > 3) return c.error(new Boom("limit"));
      c.enqueue(new Uint8Array(1000));
    },
  },
  { highWaterMark: 0 },
);
try {
  await fetch(url, { method: "POST", body, duplex: "half" });
  report.streamError = "resolved";
} catch (e) {
  report.streamError = { name: e.name, message: e.message, causeIsBoom: e.cause instanceof Boom };
}
report.pullsAfterError = pulls;

const f = (parts, name, opts) => new File(parts, name, opts);
const meta = (file) => ({ name: file.name, type: file.type, size: file.size });
report.file = {
  emptyType: meta(f(["x"], "a.heic")),
  paramType: meta(f(["x"], "a.txt", { type: "Text/Plain; charset=UTF-8" })),
  noExt: meta(f(["x"], "README")),
  dotfile: meta(f(["x"], ".env")),
  unicode: meta(f(["x"], "résumé.PDF")),
  longName: f(["x"], "a".repeat(300) + ".png").name.length,
  slashName: meta(f(["x"], "a/b\\c.png")),
  zero: meta(f([], "z.bin")),
  blobName: new Blob(["x"]).name,
};
const form = new FormData();
form.append("k", new Blob(["x"], { type: "a/b" }));
report.blobInForm = { isFile: form.get("k") instanceof File, name: form.get("k").name };
console.log(JSON.stringify({ runtime: process.version, report }, null, 2));
server.close();
