import {
  AbortError,
  ConfigError,
  MockError,
  ValidationError,
  createFetchTransport,
  defineApi,
} from "apixa/core";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

describe("advanced transfer pipeline integration", () => {
  it("validates the whole source before creating any session", async () => {
    const server = protocolServer();
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport: server.transport,
      resources: {
        files: {
          path: "/files",
          fileFields: { document: { maxSize: 8 } },
          operations: { create: { transfer: server.config } },
        },
      },
    });
    await expect(api.files.create({ document: source(13) })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(server.requests).toHaveLength(0);
  });
  it("ctx.transfer composes the same orchestration without relaxing ordinary ctx.request kinds", async () => {
    const server = protocolServer();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: server.transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: {
            upload: {
              kind: "write",
              run: (ctx, blob: Blob) => ctx.transfer(server.config, { document: blob }),
            },
          },
        },
      },
    });
    await expect(api.files.upload(source())).resolves.toMatchObject({ size: 13 });
  });
  it("mocked advanced operations fail explicitly without reaching any network", async () => {
    let sends = 0;
    const server = protocolServer();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        async request() {
          sends++;
          throw new Error("network fallback");
        },
      },
      resources: {
        files: {
          path: "/files",
          mock: [{ id: "one", document: "seed" }],
          fileFields: ["document"],
          operations: { create: { transfer: server.config } },
        },
      },
    });
    const error = await api.files.create({ document: source() }).catch((e) => e);
    expect(error).toBeInstanceOf(MockError);
    expect(error.code).toBe("MOCK_UNSUPPORTED");
    expect(sends).toBe(0);
    expect(await api.files.getAll()).toEqual([{ id: "one", document: "seed" }]);
  });
  it("does not run outer operation middleware twice on protocol requests", async () => {
    const server = protocolServer();
    let requests = 0;
    let responses = 0;
    await server
      .client(
        {},
        {
          middleware: {
            onRequest: [
              () => {
                requests++;
              },
            ],
            onResponse: [
              () => {
                responses++;
              },
            ],
          },
        },
      )
      .files.create({ document: source() });
    expect(requests).toBe(1);
    expect(responses).toBe(1);
  });
  it("rejects strategy/dataFormat conflicts and nondeclared sources", () => {
    const server = protocolServer();
    expect(() => server.client({}, { dataFormat: "json" })).toThrow(ConfigError);
    expect(() => server.client({ source: "missing" })).toThrow(ConfigError);
  });
  it("fetch rejects a real redirect rather than following it to another endpoint", async () => {
    let targetHits = 0;
    const server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(307, { location: "/target" });
        res.end();
      } else {
        targetHits++;
        res.end("leaked");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw Error("no port");
      // Delegate TLS routing only in this injected test fetch; actual HTTP redirect handling is native fetch.
      const transport = createFetchTransport((input, init) =>
        fetch(`http://127.0.0.1:${address.port}${new URL(String(input)).pathname}`, init),
      );
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport,
        resources: {
          files: {
            path: "/files",
            operations: {
              get: {
                kind: "read",
                method: "GET",
                presigned: { origins: ["https://storage.example"] },
              },
            },
          },
        },
      });
      await expect(
        api.files.get({ presigned: { url: "https://storage.example/redirect?signature=secret" } }),
      ).rejects.toThrow("Presigned request failed");
      expect(targetHits).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

it("streams bounded parts over a real slow socket without reading the whole source", async () => {
  const backend = protocolServer();
  const chunkSize = 64 * 1024;
  const size = 2 * 1024 * 1024 + 17;
  let active = 0;
  let maximum = 0;
  let largestBody = 0;
  const socket = createServer(async (request, response) => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      const index = Number(new URL(request.url!, "http://loopback").pathname.split("/").at(-1));
      const chunks: Buffer[] = [];
      let bytesRead = 0;
      for await (const chunk of request) {
        chunks.push(chunk);
        bytesRead += chunk.length;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      largestBody = Math.max(largestBody, bytesRead);
      const bytes = new Uint8Array(Buffer.concat(chunks));
      const ack = {
        index,
        offset: index * chunkSize,
        size: bytes.length,
        verification: "unverified" as const,
      };
      backend.sessions.get("1")!.parts.set(index, { bytes, ack });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(ack));
    } finally {
      active--;
    }
  });
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  if (!address || typeof address === "string") throw Error("no socket port");
  class SeekableSource extends Blob {
    override async arrayBuffer(): Promise<ArrayBuffer> {
      throw Error("whole source read");
    }
  }
  try {
    const transport = createFetchTransport(async (url, init) => {
      if (init?.method === "PUT")
        return fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`, init);
      const result = await backend.transport.request({
        url: String(url),
        method: init?.method as "GET" | "POST",
        body: init?.body ? await new Response(init.body).text() : undefined,
        headers: new Headers(init?.headers),
        signal: init?.signal ?? undefined,
      });
      return result.raw;
    });
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://protocol.example",
      transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: { create: { transfer: { ...backend.config, chunkSize, concurrency: 2 } } },
        },
      },
    });
    await api.files.create(
      { document: new SeekableSource([new Uint8Array(size)]) },
      { onTransfer() {} },
    );
    expect(maximum).toBeLessThanOrEqual(2);
    expect(maximum).toBeGreaterThan(0);
    expect(largestBody).toBe(chunkSize);
    expect(backend.bytes().length).toBe(size);
    expect(backend.completions).toBe(1);
  } finally {
    socket.closeAllConnections();
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
});

it("binary-part replacement by middleware cannot silently change the hashed bytes", async () => {
  const server = protocolServer();
  const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: server.transport,
    middleware: {
      onRequest: [
        (request) => {
          if (request.body instanceof Blob) request.body = new Blob(["corrupt"]);
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
  await expect(api.files.create({ document: source() })).rejects.toBeInstanceOf(ValidationError);
  expect(server.requests.filter((r) => r.method === "PUT")).toHaveLength(0);
  expect(server.completions).toBe(0);
});

it.each(["update", "patch"] as const)(
  "%s override uses the same advanced strategy",
  async (name) => {
    const server = protocolServer();
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport: server.transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: {
            update: { transfer: server.config },
            patch: { transfer: server.config },
          },
        },
      },
    });
    await expect(
      api.files[name]("original", { body: { document: source() } }),
    ).resolves.toHaveProperty("size", 13);
    expect(server.completions).toBe(1);
  },
);
it("an explicitly declared custom request operation also preserves the final domain result", async () => {
  const server = protocolServer();
  const api = defineApi<{
    files: {
      entity: { id: string; document: string };
      operations: { upload: { body: { document: Blob }; response: { id: string; size: number } } };
    };
  }>()({
    baseURL: "https://api.example.com",
    transport: server.transport,
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: { upload: { kind: "write", method: "POST", transfer: server.config } },
      },
    },
  });
  await expect(api.files.upload({ document: source() })).resolves.toHaveProperty("size", 13);
});
