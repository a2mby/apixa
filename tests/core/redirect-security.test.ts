import http from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigError, NetworkError, SecurityError, defineApi } from "@apixa/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * v1.8.0 L1 (owner-approved secure-by-default redirects), on real HTTP servers and the real fetch
 * transport. A redirect is inspected BEFORE anything is sent to its destination: same-origin hops
 * keep working, listed origins are followed bare (no headers, cookies or body), everything else
 * fails closed — and the destination server never sees a request.
 */
interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}
const listen = (handler: http.RequestListener): Promise<http.Server> =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
const origin = (server: http.Server, host = "127.0.0.1") =>
  `http://${host}:${(server.address() as AddressInfo).port}`;
const read = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

let api: http.Server;
let cdn: http.Server;
let evil: http.Server;
const apiSeen: Seen[] = [];
const cdnSeen: Seen[] = [];
const evilSeen: Seen[] = [];
const record = (store: Seen[], req: http.IncomingMessage, body: string) =>
  store.push({ method: req.method!, url: req.url!, headers: req.headers, body });
const json = (res: http.ServerResponse, value: unknown) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
};

beforeAll(async () => {
  evil = await listen(async (req, res) => {
    record(evilSeen, req, await read(req));
    json(res, { stolen: true });
  });
  cdn = await listen(async (req, res) => {
    record(cdnSeen, req, await read(req));
    if (req.url === "/to-evil") {
      res.writeHead(302, { location: `${origin(evil)}/after-cdn` });
      return res.end();
    }
    json(res, { from: "cdn" });
  });
  api = await listen(async (req, res) => {
    const body = await read(req);
    record(apiSeen, req, body);
    const url = req.url!;
    const redirect = (status: number, location: string) => {
      res.writeHead(status, { location });
      res.end();
    };
    if (url.startsWith("/same/")) return redirect(Number(url.split("/")[2]), "/final");
    if (url.startsWith("/cross/"))
      return redirect(Number(url.split("/")[2]), `${origin(evil)}/stolen`);
    if (url.startsWith("/cdn/"))
      return redirect(Number(url.split("/")[2]), `${origin(cdn)}/object?sig=1`);
    if (url === "/host-swap") return redirect(302, `${origin(api, "localhost")}/final`);
    if (url === "/loop") return redirect(302, "/loop");
    if (url === "/relative") return redirect(302, "../final");
    if (url === "/protocol-relative")
      return redirect(302, `//127.0.0.1:${(evil.address() as AddressInfo).port}/pr`);
    if (url === "/ftp") return redirect(302, "ftp://127.0.0.1/x");
    if (url === "/chain") return redirect(302, `${origin(cdn)}/to-evil`);
    if (url === "/no-location") {
      res.writeHead(302);
      return res.end();
    }
    json(res, { from: "api", method: req.method, body });
  });
});
afterAll(async () => {
  await Promise.all([api, cdn, evil].map((s) => new Promise((r) => s.close(r))));
});

const secrets = {
  authorization: "Bearer TOP-SECRET",
  "x-api-key": "API-KEY-SECRET",
  cookie: "session=SECRET",
};
/** Simplest possible client: a GET collection whose path is the first segment. */
const call = async (
  path: string,
  options: Record<string, unknown> = {},
  resource: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
  body?: unknown,
) => {
  const resourceOps = resource.operations as Record<string, Record<string, unknown>> | undefined;
  const c = defineApi({
    baseURL: origin(api),
    headers: secrets,
    resources: {
      r: {
        path,
        ...resource,
        operations: {
          ...resourceOps,
          fetch: { method: "GET", path: "", ...(resourceOps?.getAll ?? {}) },
        },
      },
    },
  });
  const run = method === "GET" ? c.r.fetch(options) : c.r.create(body ?? { a: 1 }, options);
  return run.then(
    (value): { value?: unknown; error?: unknown } => ({ value: value as unknown }),
    (error: unknown): { value?: unknown; error?: unknown } => ({ error }),
  );
};
const reset = () => {
  apiSeen.length = cdnSeen.length = evilSeen.length = 0;
};

describe("same-origin redirects keep working with the request unchanged", () => {
  it.each([301, 302, 303, 307, 308])("GET follows a %i and keeps every header", async (status) => {
    reset();
    const out = await call(`/same/${status}`);
    expect(out.value).toEqual({ from: "api", method: "GET", body: "" });
    const last = apiSeen.at(-1)!;
    expect(last.url).toBe("/final");
    expect(last.headers["x-api-key"]).toBe("API-KEY-SECRET");
    expect(last.headers.authorization).toBe("Bearer TOP-SECRET");
  });

  it("relative Location headers resolve against the current URL", async () => {
    reset();
    const out = await call("/relative");
    expect(out.value).toMatchObject({ from: "api" });
  });

  it("a 307 replays a replayable body; a 302 on POST becomes a body-less GET", async () => {
    reset();
    const replayed = await call("/same/307", {}, {}, "POST", { a: 1 });
    expect(replayed.value).toMatchObject({ method: "POST", body: '{"a":1}' });
    reset();
    const converted = await call("/same/302", {}, {}, "POST", { a: 1 });
    expect(converted.value).toMatchObject({ method: "GET", body: "" });
    expect(apiSeen.at(-1)!.headers["content-type"]).toBeUndefined();
  });

  it("a redirect loop ends with NetworkError, not a hang", async () => {
    const out = await call("/loop");
    expect((out as { error: unknown }).error).toBeInstanceOf(NetworkError);
    expect(String((out as { error: Error }).error.message)).toMatch(/Too many redirects/);
  });

  it("a streamed request body cannot be replayed for a 307: fails closed", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      },
    });
    const out = await call("/same/307", {}, {}, "POST", stream);
    expect((out as { error: unknown }).error).toBeInstanceOf(NetworkError);
  });

  it("a 3xx without Location is an ordinary response", async () => {
    const out = await call("/no-location");
    expect((out as { error: { status?: number } }).error.status).toBe(302);
  });
});

describe("cross-origin redirects fail closed before the destination is contacted", () => {
  it.each([301, 302, 303, 307, 308])("a %i to another origin never reaches it", async (status) => {
    reset();
    const out = await call(`/cross/${status}`);
    expect((out as { error: unknown }).error).toBeInstanceOf(SecurityError);
    expect(evilSeen).toHaveLength(0);
  });

  it.each([
    ["a different host on the same machine", "/host-swap"],
    ["a protocol-relative Location", "/protocol-relative"],
  ])("%s", async (_name, path) => {
    reset();
    const out = await call(path);
    expect((out as { error: unknown }).error).toBeInstanceOf(SecurityError);
    expect(evilSeen).toHaveLength(0);
  });

  it("a non-http(s) destination is refused", async () => {
    const out = await call("/ftp");
    expect((out as { error: unknown }).error).toBeInstanceOf(SecurityError);
  });

  it("the error names origins only, never the Location's path or query", async () => {
    const out = (await call("/cdn/302")) as { error: Error };
    expect(out.error).toBeInstanceOf(SecurityError);
    expect(out.error.message).not.toContain("sig=1");
    expect(out.error.message).not.toContain("/object");
    expect(JSON.stringify(out.error)).not.toMatch(/TOP-SECRET|API-KEY-SECRET|SECRET/);
  });

  it("is never retried (a redirect decision is not transient)", async () => {
    reset();
    await call("/cross/302", { retry: { retries: 3, baseDelayMs: 0, maxDelayMs: 0 } });
    expect(apiSeen.filter((r) => r.url === "/cross/302")).toHaveLength(1);
  });
});

describe("redirectOrigins: an explicit, credential-free CDN workflow", () => {
  it.each([301, 302, 303, 307, 308])(
    "follows a %i to a listed origin with nothing attached",
    async (status) => {
      reset();
      const out = await call(`/cdn/${status}`, { redirectOrigins: [origin(cdn)] });
      expect(out.value).toEqual({ from: "cdn" });
      const seen = cdnSeen.at(-1)!;
      expect(seen.url).toBe("/object?sig=1");
      expect(seen.method).toBe("GET");
      expect(seen.headers.authorization).toBeUndefined();
      expect(seen.headers["x-api-key"]).toBeUndefined();
      expect(seen.headers.cookie).toBeUndefined();
      expect(seen.body).toBe("");
    },
  );

  it("works as an operation setting and a per-call list wins", async () => {
    reset();
    const viaOperation = await call(
      "/cdn/302",
      {},
      {
        operations: { getAll: { redirectOrigins: [origin(cdn)] } },
      },
    );
    expect(viaOperation.value).toEqual({ from: "cdn" });
    const narrowed = await call(
      "/cdn/302",
      { redirectOrigins: [origin(evil)] },
      {
        operations: { getAll: { redirectOrigins: [origin(cdn)] } },
      },
    );
    expect((narrowed as { error: unknown }).error).toBeInstanceOf(SecurityError);
  });

  it("a POST is never forwarded to a listed origin (307/308), but a 303 becomes a bare GET", async () => {
    reset();
    const kept = await call("/cdn/307", { redirectOrigins: [origin(cdn)] }, {}, "POST", { a: 1 });
    expect((kept as { error: unknown }).error).toBeInstanceOf(SecurityError);
    expect(cdnSeen).toHaveLength(0);
    const converted = await call("/cdn/303", { redirectOrigins: [origin(cdn)] }, {}, "POST", {
      a: 1,
    });
    expect(converted.value).toEqual({ from: "cdn" });
    expect(cdnSeen.at(-1)!.body).toBe("");
    expect(cdnSeen.at(-1)!.headers["x-api-key"]).toBeUndefined();
  });

  it("a listed origin cannot bounce the request on to an unlisted one", async () => {
    reset();
    const out = await call("/chain", { redirectOrigins: [origin(cdn)] });
    expect((out as { error: unknown }).error).toBeInstanceOf(SecurityError);
    expect(evilSeen).toHaveLength(0);
  });

  it.each([
    "*",
    "https://*.example.com",
    "https://cdn.example.com/path",
    "https://user:pw@cdn.example.com",
    "cdn.example.com",
    "ftp://cdn.example.com",
    "",
  ])("rejects %j as a redirect origin", async (bad) => {
    const out = await call("/cdn/302", { redirectOrigins: [bad] });
    expect((out as { error: unknown }).error).toBeInstanceOf(ConfigError);
    expect(() =>
      defineApi({
        baseURL: origin(api),
        resources: { r: { path: "/r", operations: { getAll: { redirectOrigins: [bad] } } } },
      }),
    ).toThrow(ConfigError);
  });
});

describe("unchanged behavior", () => {
  it("a request without a redirect is untouched", async () => {
    reset();
    const out = await call("/plain");
    expect(out.value).toMatchObject({ from: "api" });
    expect(apiSeen.at(-1)!.headers["x-api-key"]).toBe("API-KEY-SECRET");
  });

  it("an abort during a redirect chain cancels the request", async () => {
    const controller = new AbortController();
    const pending = call("/same/302", { signal: controller.signal });
    controller.abort();
    const out = (await pending) as { error?: Error };
    expect(out.error?.name).toBe("AbortError");
  });
});
