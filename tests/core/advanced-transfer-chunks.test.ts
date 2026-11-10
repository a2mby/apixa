import { ConfigError, ValidationError, createFetchTransport, defineApi } from "apixa/core";
import { describe, expect, it } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

describe("advanced source slicing and scheduling", () => {
  it.each([0, 1, 3, 4, 5, 8, 9, 13, 31])(
    "sends byte-exact boundaries for %i bytes",
    async (size) => {
      const server = protocolServer();
      const promise = server.client().files.create({ document: source(size) });
      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toMatchObject({ size });
      expect(server.bytes()).toEqual([...new Uint8Array(await source(size).arrayBuffer())]);
      expect(server.completions).toBe(1);
      const parts = [...server.sessions.get("1")!.parts.values()];
      expect(parts.every((p) => p.bytes.length > 0 && p.bytes.length <= 4)).toBe(true);
    },
  );
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe chunkSize %s before initiate",
    (chunkSize) => {
      const server = protocolServer();
      expect(() => server.client({ chunkSize })).toThrow(ConfigError);
      expect(server.requests).toHaveLength(0);
    },
  );
  it.each([0, -1, 1.5, Infinity])("rejects unsafe concurrency %s", (concurrency) => {
    expect(() => protocolServer().client({ concurrency })).toThrow(ConfigError);
  });
  it("rejects part caps and empty-file rejection before any request", async () => {
    const server = protocolServer();
    await expect(
      server.client({ maxParts: 2 }).files.create({ document: source(13) }),
    ).rejects.toBeInstanceOf(ConfigError);
    await expect(
      server
        .client({ protocol: { ...server.config.protocol, emptyFile: "reject" } })
        .files.create({ document: source(0) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(server.requests).toHaveLength(0);
  });
  it.each([1, 2, 3])("limits concurrent active parts to %i", async (concurrency) => {
    const server = protocolServer();
    server.faults.latency = () => new Promise((resolve) => setTimeout(resolve, 2));
    await server.client({ concurrency }).files.create({ document: source(40) });
    expect(server.maximum).toBe(concurrency);
    expect(server.completions).toBe(1);
    expect(server.bytes()).toEqual([...new Uint8Array(await source(40).arrayBuffer())]);
  });
  it("falls back to sequential transfer if independent parts are unsupported", async () => {
    const server = protocolServer();
    server.faults.latency = () => Promise.resolve();
    await server
      .client({ concurrency: 9, protocol: { ...server.config.protocol, independentParts: false } })
      .files.create({ document: source() });
    expect(server.maximum).toBe(1);
  });
  it("never reads the complete source and hashes at most one bounded slice at a time", async () => {
    const server = protocolServer();
    let largest = 0;
    let hashes = 0;
    let maximumHashes = 0;
    class Instrumented extends Blob {
      override async arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error("whole source buffered");
      }
      override slice(start?: number, end?: number, type?: string): Blob {
        const slice = super.slice(start, end, type);
        largest = Math.max(largest, slice.size);
        const read = slice.arrayBuffer.bind(slice);
        slice.arrayBuffer = async () => {
          hashes++;
          maximumHashes = Math.max(maximumHashes, hashes);
          try {
            return await read();
          } finally {
            hashes--;
          }
        };
        return slice;
      }
    }
    for (const size of [1024, 2048]) {
      largest = 0;
      maximumHashes = 0;
      await server
        .client({ chunkSize: 64, concurrency: 3 })
        .files.create({ document: new Instrumented([new Uint8Array(size)]) });
      expect(largest).toBe(64);
      expect(maximumHashes).toBe(1);
    }
  });
  it("returns real finalization response metadata under full:true", async () => {
    const server = protocolServer();
    const result = await server.client().files.create({ document: source() }, { full: true });
    expect(result.status).toBe(200);
    expect(result.request.url).toContain("/complete");
  });
});

it.each(["blob", "arrayBuffer", "text"] as const)(
  "preserves per-call %s response inference on the final completion request",
  async (responseType) => {
    const server = protocolServer();
    const transport = createFetchTransport(async (url, init) => {
      const body =
        init?.body instanceof ReadableStream
          ? init.method === "PUT"
            ? await new Response(init.body).blob()
            : await new Response(init.body).text()
          : init?.body;
      return (
        await server.transport.request({
          url: String(url),
          method: init?.method as "POST" | "PUT" | "GET",
          body,
          headers: new Headers(init?.headers),
          signal: init?.signal ?? undefined,
        })
      ).raw;
    });
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: { create: { transfer: server.config } },
        },
      },
    });
    const result = await api.files.create({ document: source() }, { responseType });
    if (responseType === "blob") expect(result).toBeInstanceOf(Blob);
    if (responseType === "arrayBuffer") expect(result).toBeInstanceOf(ArrayBuffer);
    if (responseType === "text") expect(typeof result).toBe("string");
  },
);
it("rejects unowned streamed completion before initiating a session", async () => {
  const server = protocolServer();
  await expect(
    server.client().files.create({ document: source() }, { responseType: "stream" }),
  ).rejects.toBeInstanceOf(ConfigError);
  expect(server.requests).toHaveLength(0);
});
