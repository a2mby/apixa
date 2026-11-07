// Real-browser verification of server rendering, hydration and client behavior, against the
// tracked Next.js example (`examples/query-ssr-next`) in production (`next start`) and development
// (`next dev`) mode. Run after `pnpm build`.
//
// Browser: Chromium through playwright-core. Resolution order: $APIXA_CHROMIUM, Playwright's
// default install, then the newest `chromium-*` in the Playwright cache. Install one with
// `npx playwright-core install chromium`.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, "examples/query-ssr-next");

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

    note(
      `Browser (${mode}): SSR HTML, hydration without warnings or requests, shared cache, mutation + invalidation, cached read, infinite query, ApixaProvider stability, native provider, request isolation passed`,
    );
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
}

console.log(`Chromium: ${executablePath}`);
execFileSync(next, ["build"], { cwd: example, stdio: "inherit" });

// The server bundle imports the React-free advanced entry; only the main entry is a client reference.
const manifestFile = join(example, ".next/server/app/page_client-reference-manifest.js");
const manifest = readFileSync(manifestFile, "utf8");
assert.ok(
  /packages\/react\/dist\/index\.js/.test(manifest),
  "the hydration boundary must be a client reference",
);
assert.ok(
  !/packages\/react\/dist\/advanced\.js/.test(manifest),
  "the server-safe advanced entry must not be a client module",
);
assert.ok(
  !/node:fs|\/mocking\/dist\/node\.js/.test(manifest),
  "no Node-only module may reach a client reference",
);
note(
  "Next bundle graph: ApixaHydrationBoundary is the only client reference from apixa/react; advanced stays server-side",
);

await exercise("start", 3421);
await exercise("dev", 3422);
console.log(`\nbrowser verification ok (${results.length} checks)`);
