import { createServer as createSecureServer } from "node:https";
import { MOCK_STORAGE_SCENARIO } from "./lib/mock-storage-scenario.mjs";
// Real-browser verification of server rendering, hydration and client behavior, against the
// tracked Next.js example (`examples/frontends/query-ssr-next`) in production (`next start`) and development
// (`next dev`) mode. Run after `pnpm build`.
//
// Browser: Chromium through playwright-core. Resolution order: $APIXA_CHROMIUM, Playwright's
// default install, then the newest `chromium-*` in the Playwright cache. Install one with
// `npx playwright-core install chromium`.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Keep the tracked example untouched: materialize it in an external npm consumer.
const temporary = mkdtempSync(join(tmpdir(), "apixa-browser-"));
const example = join(temporary, "app");

function findChromium() {
  if (process.env.APIXA_CHROMIUM) return process.env.APIXA_CHROMIUM;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    (platform() === "darwin"
      ? join(homedir(), "Library/Caches/ms-playwright")
      : join(homedir(), ".cache/ms-playwright"));
  if (!existsSync(cache)) return undefined;
  const found = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse();
  for (const dir of found) {
    const candidates = [
      join(
        cache,
        dir,
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ),
      join(
        cache,
        dir,
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ),
      join(cache, dir, "chrome-linux/chrome"),
      join(cache, dir, "chrome-linux64/chrome"),
    ];
    const hit = candidates.find(existsSync);
    if (hit) return hit;
  }
  return undefined;
}

const executablePath = findChromium();
if (!executablePath) {
  console.error(
    "No Chromium found. Run: npx playwright-core install chromium (or set APIXA_CHROMIUM).",
  );
  process.exit(1);
}

const HYDRATION_PROBLEM =
  /hydrat|did not match|Text content does not match|server rendered HTML|mismatch/i;
const next = join(example, "node_modules/.bin/next");
const results = [];
const note = (message) => {
  results.push(message);
  console.log(message);
};

async function waitForServer(base, child) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null) throw new Error("Next exited before answering");
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Next did not answer on ${base}`);
}

async function exercise(mode, port) {
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(next, [mode === "start" ? "start" : "dev", "-p", String(port)], {
    cwd: example,
    stdio: "ignore",
  });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    await waitForServer(base, child);
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__apixaRequests = [];
    });
    // The example ships no favicon; answer it so a 404 does not look like an application error.
    await context.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" || HYDRATION_PROBLEM.test(text))
        problems.push(`${message.type()}: ${text}`);
    });
    const requests = () => page.evaluate(() => window.__apixaRequests);
    const names = (selector) =>
      page.$$eval(`${selector} li`, (items) => items.map((i) => i.textContent));

    // 1. Server-rendered HTML already contains the prefetched data.
    const response = await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const html = await response.text();
    for (const expected of [
      "<li>Ada</li>",
      "<li>Grace</li>",
      "<li>Post 1</li>",
      "<li>Post 5</li>",
    ]) {
      assert.ok(html.includes(expected), `${mode}: server HTML lacks ${expected}`);
    }
    assert.ok(!html.includes("Loading users"), `${mode}: server HTML rendered the pending state`);
    assert.ok(!html.includes("<li>Post 6</li>"), `${mode}: only the prefetched page is rendered`);

    // 2. Hydration finishes without mismatch warnings and without any request.
    await page.waitForFunction(() => window.__TANSTACK_QUERY_CLIENT__ !== undefined, null, {
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    assert.deepEqual(
      await requests(),
      [],
      `${mode}: hydration must not refetch prefetched queries`,
    );
    assert.deepEqual(await names("section:nth-of-type(1)"), ["Ada", "Grace"]);

    // 3. Client hooks read the hydrated cache entry.
    const cached = await page.evaluate(() =>
      window.__TANSTACK_QUERY_CLIENT__.getQueryData(["users", "list"]).map((u) => u.name),
    );
    assert.deepEqual(cached, ["Ada", "Grace"], `${mode}: hooks and cache disagree`);

    // 4. A mutation after hydration: optimistic row, one POST, list invalidated and refetched.
    await page.getByRole("button", { name: "Add user" }).click();
    await page.getByText("User 3", { exact: true }).waitFor({ timeout: 15_000 });
    await page.waitForFunction(
      () =>
        window.__apixaRequests.some((r) => r.startsWith("POST /users")) &&
        window.__apixaRequests.filter((r) => r === "GET /users").length >= 1 &&
        !JSON.stringify(window.__TANSTACK_QUERY_CLIENT__.getQueryData(["users", "list"])).includes(
          "temp-",
        ),
      null,
      { timeout: 15_000 },
    );
    const afterCreate = await requests();
    assert.equal(
      afterCreate.filter((r) => r.startsWith("POST /users")).length,
      1,
      `${mode}: one create request`,
    );
    assert.equal((await names("section:nth-of-type(1)")).length, 3, `${mode}: list after create`);

    // 5. A cached read is fetched once, then served from the cache.
    await page.getByRole("button", { name: "Load stats (cached read)" }).click();
    await page.waitForFunction(() =>
      document.querySelector("output")?.textContent?.includes("total"),
    );
    const statsRequests = (await requests()).filter((r) => r.includes("/users/stats")).length;
    await page.getByRole("button", { name: "Load stats (cached read)" }).click();
    await page.waitForTimeout(300);
    assert.equal(
      (await requests()).filter((r) => r.includes("/users/stats")).length,
      statsRequests,
      `${mode}: stats re-fetched`,
    );

    // 6. Infinite query continues from the hydrated first page.
    await page.getByRole("button", { name: "Load more" }).click();
    await page.getByText("Post 6", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(
      (await requests()).filter((r) => r.startsWith("GET /posts?")).length,
      1,
      `${mode}: one page request`,
    );

    assert.deepEqual(problems, [], `${mode}: console problems on /:\n${problems.join("\n")}`);

    // 7. ApixaProvider keeps one client across provider re-renders.
    const configPage = await context.newPage();
    const configProblems = [];
    configPage.on("pageerror", (error) => configProblems.push(error.message));
    configPage.on("console", (m) => {
      if (m.type() === "error" || HYDRATION_PROBLEM.test(m.text())) configProblems.push(m.text());
    });
    await configPage.goto(`${base}/config`);
    await configPage.getByText("Ada", { exact: true }).waitFor({ timeout: 30_000 });
    for (let i = 1; i <= 3; i++) {
      await configPage.getByRole("button", { name: "Rerender provider" }).click();
      await configPage
        .getByTestId("renders")
        .filter({ hasText: String(i) })
        .waitFor();
    }
    const distinct = await configPage.evaluate(() => new Set(window.__clients).size);
    assert.equal(distinct, 1, `${mode}: ApixaProvider created ${distinct} clients`);
    const staleTime = await configPage.evaluate(
      () => window.__clients[0].getDefaultOptions().queries?.staleTime,
    );
    assert.equal(staleTime, 60_000, `${mode}: provider config was not applied`);
    assert.deepEqual(
      configProblems,
      [],
      `${mode}: /config problems:\n${configProblems.join("\n")}`,
    );

    // 8. A native TanStack provider works with Apixa hooks.
    const nativePage = await context.newPage();
    const nativeProblems = [];
    nativePage.on("pageerror", (error) => nativeProblems.push(error.message));
    nativePage.on("console", (m) => {
      if (m.type() === "error" || HYDRATION_PROBLEM.test(m.text())) nativeProblems.push(m.text());
    });
    await nativePage.addInitScript(() => {
      window.__apixaRequests = [];
    });
    await nativePage.goto(`${base}/native`);
    await nativePage.getByText("Ada", { exact: true }).waitFor({ timeout: 30_000 });
    await nativePage.waitForTimeout(300);
    assert.equal(
      (await nativePage.evaluate(() => window.__apixaRequests)).filter((r) => r === "GET /users")
        .length,
      1,
      `${mode}: native provider made an unexpected number of list requests`,
    );
    assert.deepEqual(
      nativeProblems,
      [],
      `${mode}: /native problems:\n${nativeProblems.join("\n")}`,
    );

    // 9. Separate server requests do not share a cache: each page load hydrates its own state.
    const second = await (await context.newPage()).goto(`${base}/`);
    assert.ok((await second.text()).includes("<li>Ada</li>"));
    assert.ok(
      !(await second.text()).includes("User 3"),
      `${mode}: one visitor's mutation reached another's server render`,
    );

    // 10. File scenario (v1.6.0): rules reject locally, progress is counted, cancel ends the transfer.
    const filesPage = await context.newPage();
    const fileProblems = [];
    filesPage.on("pageerror", (error) => fileProblems.push(`pageerror: ${error.message}`));
    filesPage.on("console", (m) => {
      if (m.type() === "error" || HYDRATION_PROBLEM.test(m.text()))
        fileProblems.push(`${m.type()}: ${m.text()}`);
    });
    const filesResponse = await filesPage.goto(`${base}/files`, { waitUntil: "domcontentloaded" });
    const filesHtml = await filesResponse.text();
    assert.match(
      filesHtml.replace(/<!-- -->/g, ""),
      /server downloaded 10000 bytes/,
      `${mode}: the Server Component read the binary itself`,
    );
    assert.ok(
      filesHtml.includes("report.bin"),
      `${mode}: the serializable list was prefetched and hydrated`,
    );
    await filesPage.waitForFunction(() =>
      document.querySelector('[data-testid="support"]')?.textContent?.includes("streamingUpload"),
    );
    const requestsOf = () => filesPage.evaluate(() => window.__apixaRequests);
    const status = () => filesPage.getByTestId("status").textContent();
    const events = () => filesPage.getByTestId("events").textContent();
    const upload = (name, mimeType, size) =>
      filesPage
        .getByTestId("file")
        .setInputFiles({ name, mimeType, buffer: Buffer.alloc(size, 1) });
    await filesPage.evaluate(() => (window.__apixaRequests = []));

    await upload("big.png", "image/png", 4096);
    await filesPage.getByTestId("upload").click();
    await filesPage.waitForFunction(() =>
      document
        .querySelector('[data-testid="status"]')
        .textContent.startsWith("upload: ValidationError"),
    );
    assert.match(
      await status(),
      /FILE_TOO_LARGE/,
      `${mode}: oversized file rejected with typed violations`,
    );
    await upload("note.txt", "text/plain", 10);
    await filesPage.getByTestId("upload").click();
    await filesPage.waitForFunction(() =>
      document.querySelector('[data-testid="status"]').textContent.includes("TYPE_NOT_ALLOWED"),
    );
    assert.deepEqual(await requestsOf(), [], `${mode}: rejected files sent no request`);

    await upload("ok.png", "image/png", 512);
    await filesPage.getByTestId("upload").click();
    await filesPage.waitForFunction(() =>
      document.querySelector('[data-testid="status"]').textContent.startsWith("upload: done"),
    );
    assert.equal(
      (await requestsOf()).filter((r) => r.startsWith("POST")).length,
      1,
      `${mode}: the accepted file was sent once`,
    );

    await filesPage.getByTestId("send-stream").click();
    await filesPage.waitForFunction(() =>
      document.querySelector('[data-testid="status"]').textContent.startsWith("send: done"),
    );
    assert.match(
      await events(),
      /upload:complete:2000/,
      `${mode}: a streamed upload is counted byte for byte`,
    );

    await filesPage.getByTestId("download").click();
    await filesPage.waitForFunction(
      () =>
        document.querySelector('[data-testid="status"]').textContent ===
        "download: done 10000 bytes",
      null,
      { timeout: 15_000 },
    );
    const downloadEvents = await events();
    assert.match(
      downloadEvents,
      /download:start:0\/10000/,
      `${mode}: download starts with the trustworthy total`,
    );
    assert.match(
      downloadEvents,
      /download:progress:[2468]000\/10000/,
      `${mode}: download progress is incremental`,
    );
    assert.match(downloadEvents, /download:complete:10000\/10000/, `${mode}: download completes`);

    await filesPage.getByTestId("download").click();
    await filesPage.waitForTimeout(100);
    await filesPage.getByTestId("cancel").click();
    await filesPage
      .waitForFunction(
        () => document.querySelector('[data-testid="status"]').textContent.includes("AbortError"),
        null,
        { timeout: 10_000 },
      )
      .catch(async (error) => {
        throw new Error(`${error.message}; status=${await status()}; events=${await events()}`);
      });
    assert.doesNotMatch(
      await events(),
      /download:complete/,
      `${mode}: a cancelled download never completes`,
    );
    await filesPage.getByTestId("advanced-start").click();
    await filesPage.waitForFunction(() =>
      document
        .querySelector('[data-testid="advanced-status"]')
        .textContent.startsWith("interrupted:"),
    );
    assert.equal(
      await filesPage.getByTestId("advanced-confirmed").textContent(),
      "4 confirmed bytes",
    );
    await filesPage.getByTestId("advanced-resume").click();
    await filesPage.waitForFunction(
      () =>
        document.querySelector('[data-testid="advanced-status"]').textContent ===
        "complete: 13 bytes",
    );
    assert.equal(
      await filesPage.getByTestId("advanced-confirmed").textContent(),
      "13 confirmed bytes",
    );
    assert.deepEqual(
      fileProblems,
      [],
      `${mode}: /files console problems:\n${fileProblems.join("\n")}`,
    );

    note(
      `Browser (${mode}): SSR HTML, hydration without warnings or requests, shared cache, mutation + invalidation, cached read, infinite query, ApixaProvider stability, native provider, request isolation, file scenario (rules, progress, cancel) passed`,
    );
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
}

// v1.3.0: transfer events in real Chromium, against the packed `apixa` served as plain ESM and a
// loopback API. Chromium cannot set Content-Length on a request, so Blob uploads must be reported
// `unsupported` (never faked) while still reaching the server byte-exact; downloads and stream
// ownership are fully observable.
async function verifyTransfers() {
  const dist = join(example, "node_modules/apixa/dist");
  const uploads = [];
  let posts = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/storage-scenario.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return void res.end(MOCK_STORAGE_SCENARIO + "\nexport { mockStorageScenario }; ");
    }
    if (url.pathname.startsWith("/apixa/")) {
      const file = join(dist, url.pathname.slice("/apixa/".length));
      if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/javascript" });
      return void res.end(readFileSync(file));
    }
    if (url.pathname === "/page")
      return void res
        .writeHead(200, { "content-type": "text/html" })
        .end("<!doctype html><title>t</title>");
    if (url.pathname === "/api/docs/file") {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": "30000" });
      let sent = 0;
      const tick = () => {
        if (res.destroyed) return;
        if (sent >= 30000) return void res.end();
        res.write(Buffer.alloc(5000, 3));
        sent += 5000;
        setTimeout(tick, 15);
      };
      return void tick();
    }
    if (url.pathname === "/api/docs/slow") {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": "1000000",
      });
      res.write(Buffer.alloc(1000, 1));
      return; // stall: the body never finishes
    }
    if (url.pathname === "/api/docs/feed") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.write(Buffer.alloc(8, 1));
      return;
    }
    if (req.method === "POST") posts++;
    if (req.method !== "PUT") return void res.writeHead(204).end();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      uploads.push({
        length: req.headers["content-length"],
        encoding: req.headers["transfer-encoding"],
        bytes: Buffer.concat(chunks).length,
      });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/page`);
    const out = await page.evaluate(async (origin) => {
      const m = await import(`${origin}/apixa/index.js`);
      const storage = await import(`${origin}/apixa/core.js`);
      const { mockStorageScenario } = await import(`${origin}/storage-scenario.js`);
      const storageResult = await mockStorageScenario(storage);
      const api = m.defineApi({
        baseURL: `${origin}/api`,
        resources: {
          docs: {
            path: "/docs",
            operations: {
              file: { kind: "read", method: "GET", path: "/file", responseType: "blob" },
              slow: { kind: "read", method: "GET", path: "/slow", responseType: "blob" },
              feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream" },
              put: { kind: "write", method: "PUT", path: "/put", responseType: "text" },
            },
          },
        },
      });
      const result = { support: m.detectTransferSupport(), storage: storageResult };
      const down = [];
      const blob = await api.docs.file({
        onTransfer: (e) => down.push([e.phase, e.loaded ?? null, e.total ?? null]),
      });
      result.download = { size: blob.size, events: down };
      const up = [];
      await api.docs.put(new Blob([new Uint8Array(70000)]), {
        onTransfer: (e) => e.direction === "upload" && up.push(e.phase),
      });
      result.blobUpload = up;
      const sUp = [];
      result.streamUpload = await api.docs
        .put(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(30));
              c.close();
            },
          }),
          { onTransfer: (e) => e.direction === "upload" && sUp.push(e.phase) },
        )
        .then(
          () => ({ ok: true, events: sUp }),
          (e) => ({ ok: false, name: e.name, events: sUp }),
        );
      const ac = new AbortController();
      const abortEvents = [];
      const pending = api.docs
        .slow({ signal: ac.signal, onTransfer: (e) => abortEvents.push(e.phase) })
        .catch((e) => e.name);
      setTimeout(() => ac.abort(), 150);
      result.abortDuring = { error: await pending, events: abortEvents };
      const ac2 = new AbortController();
      const reader = (await api.docs.feed({ signal: ac2.signal })).getReader();
      await reader.read();
      ac2.abort();
      result.streamAbort = await reader.read().then(
        () => "no error",
        (e) => e.name,
      );
      const reader2 = (await api.docs.feed({ timeout: 100 })).getReader();
      await reader2.read();
      result.streamTimeout = await reader2.read().then(
        () => "no error",
        (e) => e.name,
      );
      // v1.4.0: rules reject locally (no request), limits bound responses and streams.
      const guarded = m.defineApi({
        baseURL: `${origin}/api`,
        resources: {
          docs: {
            path: "/docs",
            fileFields: { photo: { maxSize: 10, accept: ["image/*"] } },
            operations: {
              file: {
                kind: "read",
                method: "GET",
                path: "/file",
                responseType: "blob",
                maxResponseSize: 1000,
              },
              feed: {
                kind: "read",
                method: "GET",
                path: "/feed",
                responseType: "stream",
                maxResponseSize: 4,
              },
            },
          },
        },
      });
      const bad = await guarded.docs
        .create({
          photo: new File([new Uint8Array(50)], "a.exe", { type: "application/x-msdownload" }),
        })
        .catch((e) => e);
      const tooBig = await guarded.docs.file().catch((e) => e);
      const limitedFeed = (await guarded.docs.feed()).getReader();
      const feedError = await (async () => {
        for (;;) {
          const r = await limitedFeed.read();
          if (r.done) return "done";
        }
      })().catch((e) => e.name + ":" + e.violations?.[0]?.code);
      result.validation = {
        name: bad.name,
        codes: bad.violations?.map((v) => v.code).sort(),
        response: tooBig.violations?.[0]?.code,
        feedError,
      };
      return result;
    }, origin);
    assert.equal(out.storage, "seed:next:seed", "Chromium virtual fixture storage lifecycle");
    const progress = out.download.events.filter(([p]) => p === "progress");
    assert.equal(out.download.size, 30000, "browser download is byte-complete");
    assert.deepEqual(
      [out.download.events[0], out.download.events.at(-1)],
      [
        ["start", 0, 30000],
        ["complete", 30000, 30000],
      ],
      "browser download start and complete with the Content-Length total",
    );
    assert.ok(
      progress.length > 1 &&
        progress.every(([, loaded], i) => i === 0 || loaded > progress[i - 1][1]),
      "browser download progress is incremental and monotonic",
    );
    if (out.support.uploadProgress)
      assert.equal(out.blobUpload.at(-1), "complete", "Blob upload observed where supported");
    else
      assert.deepEqual(
        out.blobUpload,
        ["unsupported"],
        "Blob upload honestly unsupported in the browser",
      );
    assert.equal(
      uploads[0].length,
      "70000",
      "the Blob reached the server with its Content-Length, unchanged by observation",
    );
    assert.equal(uploads[0].bytes, 70000);
    if (out.streamUpload.ok)
      assert.equal(out.streamUpload.events.at(-1), "complete", "streamed upload counted");
    else
      assert.ok(
        out.streamUpload.name === "NetworkError" && out.streamUpload.events.at(-1) === "error",
        `a refused stream upload is an error, never a fake completion (${JSON.stringify(out.streamUpload)})`,
      );
    assert.equal(out.abortDuring.error, "AbortError", "abort during a download");
    assert.deepEqual(out.abortDuring.events.slice(-1), ["abort"], "abort event ends the download");
    assert.equal(out.streamAbort, "AbortError", "stream abort after the call resolved");
    assert.equal(out.streamTimeout, "TimeoutError", "stream timeout after the call resolved");
    assert.equal(out.validation.name, "ValidationError", "browser file rule rejects locally");
    assert.deepEqual(
      out.validation.codes,
      ["FILE_TOO_LARGE", "TYPE_NOT_ALLOWED"],
      "browser violation codes",
    );
    assert.equal(posts, 0, "a rejected file never reached the server");
    assert.equal(
      out.validation.response,
      "RESPONSE_TOO_LARGE",
      "browser response limit from Content-Length",
    );
    assert.equal(
      out.validation.feedError,
      "ValidationError:RESPONSE_TOO_LARGE",
      "browser stream response limit",
    );
    note(
      `Browser transfers (Chromium): download progress with total, Blob upload ${out.support.uploadProgress ? "observed" : "reported unsupported"} and sent byte-exact, stream upload ${out.streamUpload.ok ? "counted" : "refused honestly (" + out.streamUpload.name + ")"}, abort and stream ownership, local file-rule rejection with no request, response and stream limits; support ${JSON.stringify(out.support)}`,
    );
  } finally {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

async function verifyPresignedSecurity() {
  const key = join(temporary, "presigned-key.pem");
  const cert = join(temporary, "presigned-cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  const tls = { key: readFileSync(key), cert: readFileSync(cert) };
  const received = [];
  const applicationRequests = [];
  let applicationOrigin;
  let storageOriginValue;
  const storageOriginForRedirects = () => storageOriginValue;
  const storage = createSecureServer(tls, async (req, res) => {
    res.setHeader("access-control-allow-origin", applicationOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-methods", "GET, PUT, OPTIONS");
    res.setHeader("access-control-allow-headers", "x-signed, content-type");
    res.setHeader("access-control-expose-headers", "etag");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    received.push({ path: req.url, headers: req.headers });
    if (req.url.startsWith("/redirect"))
      return void res.writeHead(307, { location: "/target" }).end();
    for await (const chunk of req) void chunk;
    res.setHeader("etag", '"opaque-browser-etag"');
    res.end("stored");
  });
  const dist = join(example, "node_modules/apixa/dist");
  const application = createSecureServer(tls, (req, res) => {
    const path = new URL(req.url, "https://localhost").pathname;
    applicationRequests.push({ path, headers: req.headers });
    if (path === "/api/plain") {
      res.writeHead(200, { "content-type": "application/json" });
      return void res.end(JSON.stringify([{ id: 1 }]));
    }
    if (path === "/api/redirect-same")
      return void res.writeHead(302, { location: "/api/plain" }).end();
    if (path === "/api/redirect-cross")
      return void res.writeHead(302, { location: `${storageOriginForRedirects()}/stolen` }).end();
    if (path.startsWith("/apixa/")) {
      const file = join(dist, path.slice("/apixa/".length));
      if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(readFileSync(file));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>Presigned security</title>");
    }
  });
  await new Promise((resolve) => application.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => storage.listen(0, "127.0.0.1", resolve));
  applicationOrigin = `https://localhost:${application.address().port}`;
  const storageOrigin = `https://localhost:${storage.address().port}`;
  storageOriginValue = storageOrigin;
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.addCookies([
      {
        name: "storage-cookie",
        value: "must-not-leak",
        url: storageOrigin,
        secure: true,
        sameSite: "None",
      },
    ]);
    const page = await context.newPage();
    await page.goto(applicationOrigin);
    const proof = await page.evaluate(
      async ({ applicationOrigin, storageOrigin }) => {
        const m = await import(applicationOrigin + "/apixa/core.js");
        // Positive control proves this browser would send the cookie across these two origins.
        await fetch(storageOrigin + "/control", { credentials: "include" });
        let providers = 0,
          middleware = 0;
        const api = m.defineApi({
          baseURL: applicationOrigin,
          headers: () => {
            providers++;
            return { Authorization: "Bearer backend-secret" };
          },
          middleware: [
            {
              onRequest(r) {
                middleware++;
                r.headers.set("x-api-key", "backend-secret");
              },
            },
          ],
          resources: {
            objects: {
              path: "/objects",
              operations: {
                put: {
                  kind: "write",
                  method: "PUT",
                  responseType: "text",
                  presigned: { origins: [storageOrigin], headers: ["x-signed"] },
                },
              },
            },
          },
        });
        const response = await api.objects.put(new Blob(["binary"]), {
          full: true,
          presigned: {
            url: storageOrigin + "/object?signature=temporary",
            headers: { "x-signed": "approved" },
          },
        });
        const error = await api.objects
          .put(new Blob(["binary"]), {
            presigned: { url: storageOrigin + "/redirect?signature=temporary" },
          })
          .catch((e) => e);
        // v1.8.0 secure redirects: a browser hides where a manual redirect leads, so Apixa fails closed.
        const secure = m.defineApi({
          baseURL: applicationOrigin,
          headers: { "X-Api-Key": "backend-secret" },
          resources: {
            plain: { path: "/api/plain" },
            sameHop: { path: "/api/redirect-same" },
            crossHop: { path: "/api/redirect-cross" },
          },
        });
        const plain = await secure.plain.getAll();
        const same = await secure.sameHop.getAll({ retry: false }).catch((e) => e);
        const cross = await secure.crossHop
          .getAll({ retry: false, redirectOrigins: [storageOrigin] })
          .catch((e) => e);
        return {
          redirects: {
            plain: plain.length,
            sameBlocked: same instanceof m.SecurityError,
            crossBlocked: cross instanceof m.SecurityError,
            message: String(cross.message),
          },
          providers,
          middleware,
          etag: response.headers.get("etag"),
          bytes: response.data,
          redirected: error instanceof m.NetworkError,
          error: JSON.stringify(error),
          requestURL: response.request.url,
        };
      },
      { applicationOrigin, storageOrigin },
    );
    assert.match(
      received.find((r) => r.path === "/control").headers.cookie,
      /storage-cookie=must-not-leak/,
      "positive cookie control",
    );
    const signed = received.find((r) => r.path.startsWith("/object?"));
    assert.equal(signed.headers.cookie, undefined, "native browser omits storage cookies");
    assert.equal(signed.headers.authorization, undefined, "no API authorization");
    assert.equal(signed.headers["x-api-key"], undefined, "no API middleware secret");
    assert.equal(signed.headers["x-signed"], "approved");
    assert.equal(proof.providers, 0);
    assert.equal(proof.middleware, 0);
    assert.equal(proof.etag, '"opaque-browser-etag"');
    assert.equal(proof.bytes, "stored");
    assert.equal(proof.redirected, true);
    assert.equal(
      received.some((r) => r.path === "/target"),
      false,
    );
    assert.equal(proof.redirects.plain, 1, "a request without a redirect still works");
    assert.equal(
      proof.redirects.sameBlocked,
      true,
      "browser: same-origin redirect fails closed (opaque redirect)",
    );
    assert.equal(
      proof.redirects.crossBlocked,
      true,
      "browser: cross-origin redirect fails closed even when its origin is listed",
    );
    assert.doesNotMatch(proof.redirects.message, /stolen|backend-secret/);
    assert.equal(
      received.some((r) => r.path === "/stolen"),
      false,
      "the redirect destination never receives a request",
    );
    assert.doesNotMatch(proof.error, /signature|temporary|backend-secret/);
    assert.doesNotMatch(proof.requestURL, /signature|temporary/);
    note(
      "Browser HTTPS presigned security: positive cookie control, credential omission, CORS ETag, auth isolation and redirect rejection passed; ordinary-request redirects fail closed before the destination is contacted",
    );
  } finally {
    await browser.close();
    application.closeAllConnections();
    storage.closeAllConnections();
    await Promise.all([
      new Promise((r) => application.close(r)),
      new Promise((r) => storage.close(r)),
    ]);
  }
}

try {
  const packs = join(temporary, "packs");
  mkdirSync(packs);
  execFileSync("pnpm", ["pack", "--pack-destination", packs], { cwd: root, stdio: "pipe" });
  cpSync(join(root, "examples/frontends/query-ssr-next"), example, {
    recursive: true,
    filter: (file) => !/(^|\/)(node_modules|\.next|\.git)(\/|$)|tsbuildinfo$/.test(file),
  });
  const rewrite = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, item.name);
      if (item.isDirectory()) rewrite(file);
      else if (/\.(tsx?|jsx?|mjs)$/.test(file)) {
        writeFileSync(
          file,
          readFileSync(file, "utf8")
            .replaceAll("@apixa/core", "apixa/core")
            .replaceAll("@apixa/mocking", "apixa/mocking")
            .replaceAll("@apixa/react", "apixa/react"),
        );
      }
    }
  };
  rewrite(example);
  const manifest = JSON.parse(readFileSync(join(example, "package.json"), "utf8"));
  manifest.dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).filter(([name]) => !name.startsWith("@apixa/")),
  );
  manifest.dependencies.apixa = `file:${join(
    packs,
    readdirSync(packs).find((f) => f.endsWith(".tgz")),
  )}`;
  writeFileSync(join(example, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(example, "next.config.mjs"), "export default {};\n");
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: example, stdio: "inherit" });
  assert.ok(
    !existsSync(join(example, "node_modules/@apixa")),
    "browser consumer installs no private packages",
  );
  console.log(`Chromium: ${executablePath}`);
  execFileSync(next, ["build"], { cwd: example, stdio: "inherit" });

  // The server bundle imports the React-free advanced entry; only the main entry is a client reference.
  const manifestFile = join(example, ".next/server/app/page_client-reference-manifest.js");
  const clientManifest = readFileSync(manifestFile, "utf8");
  assert.ok(
    /apixa\/dist\/react\/index\.js/.test(clientManifest),
    "the hydration boundary must be a client reference",
  );
  assert.ok(
    !/apixa\/dist\/react\/advanced\.js/.test(clientManifest),
    "the server-safe advanced entry must not be a client module",
  );
  assert.ok(
    !/node:fs|\/dist\/mocking\/node\.js/.test(clientManifest),
    "no Node-only module may reach a client reference",
  );
  note(
    "Next bundle graph: ApixaHydrationBoundary is the only client reference from apixa/react; advanced stays server-side",
  );

  await exercise("start", 3421);
  await exercise("dev", 3422);
  await verifyTransfers();
  await verifyPresignedSecurity();
  console.log(`\nbrowser verification ok (${results.length} checks)`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
