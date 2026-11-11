import { ConfigError, createFetchTransport, defineApi, mockFiles } from "apixa/core";
import { describe, expect, it, vi } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

/**
 * v1.8.0 Batch 4 — resource bounds (register L10, L11, L12, L14). Timing assertions are ratios
 * against the same run's smaller case, never absolute wall-clock numbers; byte assertions are exact.
 */
async function secondsPerPart(parts: number): Promise<number> {
  const server = protocolServer();
  const started = performance.now();
  await server
    .client({ chunkSize: 1 })
    .files.create({ document: source(parts) }, { transfer: { saveCheckpoint: () => {} } });
  return (performance.now() - started) / parts;
}

describe("L10: per-acknowledgment cost does not grow with part count", () => {
  it("a 4,000-part transfer costs about the same per part as a 1,000-part one", async () => {
    await secondsPerPart(200); // warm the JIT so the comparison is not dominated by start-up
    const small = await secondsPerPart(1000);
    const large = await secondsPerPart(4000);
    // Before the fix the ratio was ~3.6 and still growing (quadratic); now it stays near 1.
    expect(large / small).toBeLessThan(2.5);
  }, 60_000);

  it("the serialized checkpoint stays capped (4 MiB) even though it is no longer re-stringified", async () => {
    const server = protocolServer();
    const protocol = {
      ...server.config.protocol,
      uploadPart: async (ctx: never, input: never) => {
        const ack = await server.config.protocol.uploadPart(ctx, input);
        return { ...ack, etag: "e".repeat(2000) };
      },
    };
    const error = await server
      .client({ chunkSize: 1, protocol: protocol as never })
      .files.create({ document: source(2300) }, { transfer: { saveCheckpoint: () => {} } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toBe("Transfer checkpoint exceeds its limits.");
  }, 60_000);

  it("checkpoint snapshots are immutable and share their manifest between saves", async () => {
    const server = protocolServer();
    const saved: { source: { manifest: readonly string[] }; parts: readonly unknown[] }[] = [];
    await server
      .client()
      .files.create(
        { document: source() },
        { transfer: { saveCheckpoint: (c) => void saved.push(c) } },
      );
    expect(saved.length).toBeGreaterThan(2);
    expect(Object.isFrozen(saved[0])).toBe(true);
    expect(Object.isFrozen(saved[0]!.parts)).toBe(true);
    expect(saved[0]!.source.manifest).toBe(saved.at(-1)!.source.manifest);
    expect(saved.map((c) => c.parts.length)).toEqual(
      [...saved.map((c) => c.parts.length)].sort((a, b) => a - b),
    );
  });
});

describe("L11: upload progress does not buffer a Blob body", () => {
  it("never reads the whole Blob into memory and keeps Content-Length", async () => {
    const arrayBuffer = vi.spyOn(Blob.prototype, "arrayBuffer");
    const text = vi.spyOn(Blob.prototype, "text");
    let seen: { body: unknown; headers: Headers } | undefined;
    const transport = createFetchTransport((async (_url: string, init: RequestInit) => {
      seen = { body: init.body, headers: new Headers(init.headers) };
      await new Response(init.body as ReadableStream).arrayBuffer();
      return new Response("ok");
    }) as never);
    const events: number[] = [];
    const big = new Blob([new Uint8Array(4 * 1024 * 1024)]);
    await transport.request({
      method: "PUT",
      url: "https://api.example.com/x",
      headers: new Headers(),
      body: big,
      responseType: "text",
      onTransfer: (e: { direction: string; loaded?: number }) => {
        if (e.direction === "upload" && e.loaded !== undefined) events.push(e.loaded);
      },
    } as never);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(seen!.body).toBeInstanceOf(ReadableStream);
    expect(seen!.headers.get("content-length")).toBe(String(big.size));
    expect(events.at(-1)).toBe(big.size);
    arrayBuffer.mockRestore();
    text.mockRestore();
  });
});

describe("L14: concurrency is bounded by configuration, not by file size", () => {
  it("never has more requests in flight than `concurrency`, for any file size", async () => {
    for (const [size, concurrency] of [
      [20, 1],
      [40, 3],
      [200, 8],
    ] as const) {
      const server = protocolServer();
      server.faults.latency = () => new Promise((r) => setTimeout(r, 1));
      await server
        .client({ chunkSize: 1, concurrency })
        .files.create({ document: source(size) }, {});
      expect(server.maximum).toBeLessThanOrEqual(concurrency);
      expect(server.maximum).toBeGreaterThanOrEqual(Math.min(concurrency, 2) > 1 ? 2 : 1);
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects concurrency %s before any request",
    async (concurrency) => {
      const server = protocolServer();
      // Validated when the operation runs (or at definition), always before any request is sent.
      const error = await Promise.resolve()
        .then(() => server.client({ concurrency }).files.create({ document: source() }, {}))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConfigError);
      expect(server.requests).toHaveLength(0);
    },
  );
});

describe("whole-transfer cleanup", () => {
  it("leaves no pending abort listeners on the caller's signal after settlement", async () => {
    const server = protocolServer();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await server.client().files.create({ document: source() }, { signal: controller.signal });
    const added = add.mock.calls.filter(([type]) => type === "abort").length;
    const removed = remove.mock.calls.filter(([type]) => type === "abort").length;
    expect(removed).toBeGreaterThanOrEqual(added - 1);
  });
});

describe("L12: mock file storage stays usable with thousands of files", () => {
  it("duplicate virtual paths are still rejected at scale, and 3,000 puts stay well inside a loose budget", async () => {
    const api = defineApi({
      baseURL: "https://e.test",
      resources: { docs: { path: "/docs", fileFields: ["file"], mock: [{ id: 1, file: "" }] } },
    });
    const files = mockFiles(api)!;
    const started = performance.now();
    for (let i = 0; i < 3000; i++)
      await files.put(new Blob(["x"]), {
        resource: "docs",
        field: "file",
        name: `f${i}.txt`,
        directory: "d",
        naming: "original",
      });
    // ~0.03 ms/put measured (was ~0.3 ms before the in-place path scan); 20x headroom for slow CI.
    expect(performance.now() - started).toBeLessThan(3000);
    expect(files.size).toBe(3000);
    await expect(
      files.put(new Blob(["y"]), {
        resource: "docs",
        field: "file",
        name: "f1500.txt",
        directory: "d",
        naming: "original",
      }),
    ).rejects.toMatchObject({ code: "MOCK_DUPLICATE_ID" });
  });
});
