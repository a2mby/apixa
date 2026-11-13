import { describe, expect, it } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

describe("part retries through existing reliability infrastructure", () => {
  it("retries only a failed part with a stable distinct idempotency key", async () => {
    const server = protocolServer();
    server.faults.failPart = 1;
    await server
      .client(
        {},
        { retry: { retries: 1, methods: ["PUT"], baseDelayMs: 0, maxDelayMs: 0, jitter: false } },
      )
      .files.create({ document: source() });
    const writes = server.requests.filter((r) => r.method === "PUT");
    expect(writes.map((r) => new URL(r.url).pathname.split("/").at(-1))).toEqual([
      "0",
      "1",
      "1",
      "2",
      "3",
    ]);
    const keys = writes.map((r) => r.headers.get("idempotency-key"));
    expect(keys[1]).toBe(keys[2]);
    expect(new Set(keys).size).toBe(4);
    expect(server.completions).toBe(1);
  });
  it("does not enable write retries implicitly", async () => {
    const server = protocolServer();
    server.faults.failPart = 1;
    await expect(
      server.client({}, { retry: 3 }).files.create({ document: source() }),
    ).rejects.toThrow();
    expect(server.requests.filter((r) => r.url.endsWith("/parts/1"))).toHaveLength(1);
  });
  it("does not retry parts without protocol replay safety", async () => {
    const server = protocolServer();
    server.faults.failPart = 1;
    await expect(
      server
        .client(
          { protocol: { ...server.config.protocol, replaySafeParts: false } },
          { retry: { retries: 3, methods: ["PUT"] } },
        )
        .files.create({ document: source() }),
    ).rejects.toThrow();
    expect(server.requests.filter((r) => r.url.endsWith("/parts/1"))).toHaveLength(1);
  });
});

it("an explicit error-middleware replay keeps the same part key and cannot replay twice", async () => {
  const server = protocolServer();
  server.faults.failPart = 1;
  let replays = 0;
  const { defineApi } = await import("apixa/core");
  const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: server.transport,
    middleware: {
      onError: [
        async (error, context) => {
          if (context.request?.url.includes("/parts/") && context.replay) {
            replays++;
            return context.replay();
          }
        },
      ],
    },
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: { create: { transfer: server.config } },
      },
    },
  });
  await api.files.create({ document: source() });
  const repeated = server.requests.filter((r) => r.url.endsWith("/parts/1"));
  expect(repeated).toHaveLength(2);
  expect(repeated[0]!.headers.get("idempotency-key")).toBe(
    repeated[1]!.headers.get("idempotency-key"),
  );
  expect(replays).toBe(1);
  expect(server.completions).toBe(1);
});

it("respects explicit protocol idempotency headers without combining different header casing", async () => {
  const server = protocolServer();
  const protocol = {
    ...server.config.protocol,
    uploadPart: (
      ctx: import("apixa/core").TransferStepContext,
      input: Parameters<typeof server.config.protocol.uploadPart>[1],
    ) =>
      ctx.request<import("apixa/core").TransferPartAck>({
        kind: "write",
        method: "PUT",
        path: `/sessions/${input.session.id}/parts/${input.part.index}`,
        body: input.part.blob,
        headers: {
          "x-offset": String(input.part.offset),
          "idempotency-key": `protocol:${input.part.index}`,
        },
      }),
  };
  await server.client({ protocol }).files.create({ document: source() });
  expect(
    server.requests.filter((r) => r.method === "PUT").map((r) => r.headers.get("idempotency-key")),
  ).toEqual(["protocol:0", "protocol:1", "protocol:2", "protocol:3"]);
});

it("outer error replay reconciles a checkpoint instead of creating a second session", async () => {
  const server = protocolServer();
  server.faults.failPart = 1;
  const { defineApi } = await import("apixa/core");
  const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: server.transport,
    middleware: {
      onError: [
        async (error, context) => {
          if (context.request?.path === "/files" && context.replay) return context.replay();
        },
      ],
    },
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: { create: { transfer: server.config } },
      },
    },
  });
  await api.files.create({ document: source() });
  expect(server.sessions.size).toBe(1);
  expect(server.completions).toBe(1);
  expect(server.requests.filter((r) => r.url.endsWith("/parts/0"))).toHaveLength(1);
});
it("generic error middleware cannot replay a protocol write marked unsafe", async () => {
  const server = protocolServer();
  server.faults.failPart = 1;
  const { defineApi } = await import("apixa/core");
  const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: server.transport,
    middleware: {
      onError: [
        (error, context) => {
          if (context.request?.url.includes("/parts/")) return context.replay?.();
        },
      ],
    },
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: {
          create: {
            transfer: {
              ...server.config,
              protocol: { ...server.config.protocol, replaySafeParts: false },
            },
          },
        },
      },
    },
  });
  await expect(api.files.create({ document: source() })).rejects.toThrow();
  expect(server.requests.filter((r) => r.url.endsWith("/parts/1"))).toHaveLength(1);
});

it("per-call retry:false disables an operation's part retries", async () => {
  const server = protocolServer();
  server.faults.failPart = 1;
  await expect(
    server
      .client({}, { retry: { retries: 1, methods: ["PUT"], baseDelayMs: 0, maxDelayMs: 0 } })
      .files.create({ document: source() }, { retry: false }),
  ).rejects.toThrow();
  expect(server.requests.filter((r) => r.url.endsWith("/parts/1"))).toHaveLength(1);
});
it("per-call retry and headers propagate to backend steps", async () => {
  const server = protocolServer();
  server.faults.failPart = 1;
  await server.client().files.create(
    { document: source() },
    {
      retry: { retries: 1, methods: ["PUT"], baseDelayMs: 0, maxDelayMs: 0 },
      headers: { "x-tenant": "caller" },
      maxResponseSize: 1000,
    },
  );
  expect(server.requests.every((r) => r.headers.get("x-tenant") === "caller")).toBe(true);
  expect(server.requests.every((r) => r.limits?.maxResponseBytes === 1000)).toBe(true);
  expect(server.requests.filter((r) => r.url.endsWith("/parts/1"))).toHaveLength(2);
});
it("operation idempotency namespaces initiation, parts and finalization with its configured header", async () => {
  const server = protocolServer();
  await server
    .client({}, { idempotency: { header: "x-request-key" } })
    .files.create({ document: source() }, { idempotencyKey: "logical-upload" });
  const keys = server.requests
    .filter((r) => r.method !== "GET")
    .map((r) => r.headers.get("x-request-key"));
  expect(keys.every(Boolean)).toBe(true);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys[0]).toContain("logical-upload:initiate");
  expect(keys.at(-1)).toContain("1:complete");
});
