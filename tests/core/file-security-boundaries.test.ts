import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import {
  ConfigError,
  ValidationError,
  defineApi,
  mockFiles,
  type Transport,
  type TransportRequest,
} from "@apixa/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureCheckpoint,
  protocolServer,
  source,
} from "../helpers/advanced-transfer-protocol.js";

/**
 * v1.8.0 Batch 1 — real security boundaries (register L1, L4, L20, L23). Nothing here loosens an
 * existing protection; findings that need an owner decision are characterized, not changed.
 */
const listen = (handler: http.RequestListener): Promise<http.Server> =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
const origin = (server: http.Server) =>
  `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

describe("L4: a checkpoint's session id is opaque input", () => {
  it("is handed to protocol steps verbatim, so protocols must encode it", async () => {
    const server = protocolServer();
    const cp = captureCheckpoint();
    server.faults.failPart = 1;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch(() => {});
    const tampered = JSON.parse(JSON.stringify(cp.value));
    tampered.session.id = "../admin?x=1#h";
    const before = server.requests.length;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { checkpoint: tampered } })
      .catch(() => {});
    // The test protocol interpolates the id unencoded (as a careless author would): the URL shows it.
    expect(server.requests[before]!.url).toContain("/files/sessions/../admin?x=1#h");
  });

  it("the documented recipe (encodeURIComponent) keeps a tampered id inside one path segment", async () => {
    const server = protocolServer();
    const cp = captureCheckpoint();
    server.faults.failPart = 1;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch(() => {});
    const tampered = JSON.parse(JSON.stringify(cp.value));
    tampered.session.id = "../admin?x=1#h";
    const safe = {
      ...server.config.protocol,
      inspect: (ctx: never, input: { session: { id: string } }) =>
        server.config.protocol.inspect!(ctx, {
          ...input,
          session: { ...input.session, id: encodeURIComponent(input.session.id) },
        } as never),
    };
    const before = server.requests.length;
    await server
      .client({ protocol: safe as never })
      .files.create({ document: source() }, { transfer: { checkpoint: tampered } })
      .catch(() => {});
    const url = new URL(server.requests[before]!.url);
    expect(url.pathname).toBe("/files/sessions/..%2Fadmin%3Fx%3D1%23h");
    expect(url.search).toBe("");
  });

  it.each([
    ["non-object session", { session: "x" }],
    ["empty session id", { session: { id: "" } }],
    ["oversized session id", { session: { id: "x".repeat(2049) } }],
    ["extra session key", { session: { id: "a", admin: true } }],
    ["extra top-level key", { extra: 1 }],
    ["wrong version", { version: 2 }],
  ])("rejects a malformed checkpoint: %s before any request", async (_name, patch) => {
    const server = protocolServer();
    const cp = captureCheckpoint();
    server.faults.failPart = 1;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch(() => {});
    const before = server.requests.length;
    const error = await server
      .client()
      .files.create(
        { document: source() },
        { transfer: { checkpoint: { ...JSON.parse(JSON.stringify(cp.value)), ...patch } } },
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect(server.requests.length).toBe(before);
  });
});

describe("L20: mock storage paths are virtual and isolated", () => {
  const api = () =>
    defineApi({
      baseURL: "https://example.test",
      resources: { docs: { path: "/docs", fileFields: ["file"], mock: [{ id: 1, file: "" }] } },
    });
  it.each([
    "../escape.txt",
    "a/../../b.txt",
    "..\\win.txt",
    "a\u0000b.txt",
    "/abs.txt",
    "%2e%2e/x",
  ])("legacy display name %j never becomes a path segment", async (name) => {
    const files = mockFiles(api())!;
    const meta = await files.put(new File(["x"], name), { resource: "docs", field: "file" });
    const path = meta.path!;
    expect(path.split("/").every((segment) => segment && segment !== "." && segment !== "..")).toBe(
      true,
    );
    expect(path.startsWith("/")).toBe(false);
    expect(path.includes("\0")).toBe(false);
  });
  it.each(["../x", "a/b", "a\\b", ".", "..", ""])(
    "explicit naming %j must be one safe segment",
    async (name) => {
      const files = mockFiles(api())!;
      await expect(
        files.put(new File(["x"], "a.txt"), {
          resource: "docs",
          field: "file",
          naming: () => name,
        }),
      ).rejects.toBeInstanceOf(ConfigError);
    },
  );
  it.each(["../up", "a/../../b", "/abs", "a//b"])(
    "directory %j cannot leave the disk",
    async (dir) => {
      const files = mockFiles(api())!;
      try {
        const meta = await files.put(new File(["x"], "a.txt"), {
          resource: "docs",
          field: "file",
          directory: dir,
        });
        expect(meta.path!.split("/").includes("..")).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
      }
    },
  );
  it("disks keep identical paths apart", async () => {
    const files = mockFiles(api())!;
    const a = await files.put(new File(["a"], "same.txt"), {
      resource: "docs",
      field: "file",
      disk: "one",
      directory: "d",
      naming: "original",
    });
    const b = await files.put(new File(["b"], "same.txt"), {
      resource: "docs",
      field: "file",
      disk: "two",
      directory: "d",
      naming: "original",
    });
    expect(a.path).toBe(b.path);
    expect(files.list({ disk: "one" })).toHaveLength(1);
    expect(files.get(a.ref)!.text()).toBe("a");
    expect(files.get(b.ref)!.text()).toBe("b");
  });
});

describe("L23: query-string credentials never surface in errors", () => {
  it("HttpError and NetworkError expose no request URL in enumerable output", async () => {
    const secret = "QS-SECRET-9";
    for (const transport of [
      {
        request: async () => {
          throw new TypeError("fetch failed");
        },
      },
      {
        request: async () => ({
          status: 500,
          headers: new Headers(),
          raw: new Response("x", { status: 500 }),
          body: null,
        }),
      },
    ]) {
      const client = defineApi({
        baseURL: "https://api.example.com",
        transport,
        resources: { items: { path: "/items" } },
      });
      const error = await client.items
        .getAll({ query: { token: secret }, retry: false })
        .catch((e: unknown) => e);
      const shown = [
        inspect(error, { depth: 8 }),
        JSON.stringify(error),
        (error as Error).message,
      ].join("\n");
      expect(shown).not.toContain(secret);
    }
  });
});

describe("L5/L13: response size limits and custom transports", () => {
  const items = (transport: Transport) =>
    defineApi({
      baseURL: "https://api.example.com",
      transport,
      resources: { items: { path: "/items" } },
    });
  const big = "x".repeat(2 * 1024 * 1024);
  const textTransport = (seen?: TransportRequest[]): Transport => ({
    request: async (input) => {
      seen?.push(input);
      const raw = new Response(big, { headers: { "content-type": "text/plain" } });
      return { status: 200, headers: raw.headers, raw, body: big };
    },
  });

  it("a custom transport receives the limit; a transport that ignores it is caught after reading", async () => {
    const seen: TransportRequest[] = [];
    const error = (await items(textTransport(seen))
      .items.getAll({ responseType: "text", maxResponseSize: 1024, retry: false } as never)
      .catch((e: unknown) => e)) as ValidationError;
    expect(seen[0]!.limits?.maxResponseBytes).toBe(1024);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.violations[0]).toMatchObject({ code: "RESPONSE_TOO_LARGE", limit: 1024 });
    // Documented limitation: the transport had already buffered the body. Bounding the read itself
    // is the custom transport's job (the built-in fetch transport does it while streaming).
  });

  it("ordinary reads have no default size cap; the limit is opt-in", async () => {
    const value = await items(textTransport()).items.getAll({
      responseType: "text",
      retry: false,
    } as never);
    expect(value).toBe(big);
  });
});
