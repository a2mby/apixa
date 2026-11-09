import http from "node:http";
import { NetworkError, ValidationError, defineApi } from "@apixa/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { bytes, collector, transferClient, type StubFetch } from "../helpers/transfer.js";

/** Reads the request body like fetch does; a failing body rejects like undici (`fetch failed`, cause). */
const consume =
  (log: { read: number; calls: number } = { read: 0, calls: 0 }): StubFetch =>
  async (_url, init) => {
    log.calls++;
    if (init.body instanceof ReadableStream) {
      const reader = init.body.getReader();
      try {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          log.read += r.value.byteLength;
        }
      } catch (cause) {
        throw new TypeError("fetch failed", { cause });
      }
    }
    return new Response("ok");
  };

const source = (chunks: number, size = 10, onPull?: () => void) => {
  let i = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(c) {
        onPull?.();
        if (i++ < chunks) c.enqueue(bytes(size));
        else c.close();
      },
    },
    { highWaterMark: 0 },
  );
};

const limited = (limit: number, fetchImpl: StubFetch) =>
  transferClient(fetchImpl, { operation: { fileLimits: { maxBodySize: limit } } });

describe("upload stream limits", () => {
  it("passes a stream at the limit and rejects one byte over with ValidationError (not NetworkError)", async () => {
    const log = { read: 0, calls: 0 };
    await expect(limited(30, consume(log)).docs.push(source(3))).resolves.toBe("ok");
    expect(log.read).toBe(30);
    const error = (await limited(29, consume())
      .docs.push(source(3))
      .catch((e) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(error.violations).toEqual([
      { code: "BODY_TOO_LARGE", path: "$", limit: 29, actual: 30 },
    ]);
  });

  it("maxTotalSize also bounds a stream; the smaller limit wins", async () => {
    const client = transferClient(consume(), {
      operation: { fileLimits: { maxBodySize: 100, maxTotalSize: 15 } },
    });
    const error = (await client.docs.push(source(3)).catch((e) => e)) as ValidationError;
    expect(error.violations[0]).toMatchObject({ code: "TOTAL_TOO_LARGE", limit: 15 });
  });

  it("is incremental: the source is not read far past the limit, and nothing is buffered up front", async () => {
    let pulls = 0;
    await limited(25, consume())
      .docs.push(source(1000, 10, () => pulls++))
      .catch(() => {});
    expect(pulls).toBeLessThanOrEqual(5);
  });

  it("a stream under no limit is untouched (no wrapper, no rules)", async () => {
    let received: unknown;
    const client = transferClient(async (_u, init) => {
      received = init.body;
      return new Response("ok");
    });
    const body = source(1);
    await client.docs.push(body);
    expect(received).toBe(body);
  });

  it("is never retried and ends as an error transfer event with willRetry false", async () => {
    const log = { read: 0, calls: 0 };
    const c = collector();
    const error = (await limited(15, consume(log))
      .docs.push(source(5), {
        retry: { retries: 3, baseDelayMs: 0, methods: ["PUT"] },
        onTransfer: c.observer,
      })
      .catch((e) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(log.calls).toBe(1);
    const last = c.of("upload").at(-1)!;
    expect(last).toMatchObject({ phase: "error", willRetry: false });
    expect(error.transfer).toMatchObject({ direction: "upload" });
    expect(c.of("upload").filter((e) => e.phase === "complete")).toHaveLength(0);
  });

  it("works together with onTransfer observation: counts, then errors", async () => {
    const c = collector();
    await limited(20, consume())
      .docs.push(source(5), { onTransfer: c.observer })
      .catch(() => {});
    expect(c.of("upload")[0]).toMatchObject({ phase: "start" });
    expect(c.of("upload").some((e) => e.phase === "progress")).toBe(true);
  });

  it("caller cancellation still wins and releases the stream", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(ctl) {
        ctl.enqueue(bytes(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl: StubFetch = async (_u, init) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      controller.abort();
      await reader.cancel().catch(() => {});
      throw init.signal!.reason;
    };
    const error = await limited(1_000_000, fetchImpl)
      .docs.push(body, { signal: controller.signal })
      .catch((e) => e);
    expect((error as Error).name).toBe("AbortError");
    expect(cancelled).toBe(true);
  });
});

describe("over a real socket (loopback)", () => {
  let server: http.Server;
  let url = "";
  const received: number[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let n = 0;
      req.on("data", (d) => (n += d.length));
      req.on("end", () => {
        received.push(n);
        res.end("ok");
      });
      req.on("error", () => {});
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("a real fetch surfaces the ValidationError; a 48 MiB source is cut at the limit, never fully read", async () => {
    const CHUNK = 1024 * 1024;
    let generated = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          generated++;
          c.enqueue(new Uint8Array(CHUNK));
        },
      },
      { highWaterMark: 0 },
    );
    const api = defineApi<{ d: { path: "/d"; entity: { id: string } } }>()({
      baseURL: url,
      transport: createFetchTransport(),
      resources: {
        d: {
          path: "/d",
          fileLimits: { maxBodySize: 4 * CHUNK },
          operations: { put: { kind: "write", method: "PUT", path: "/p", responseType: "text" } },
        },
      },
    } as never) as never as { d: { put(b: unknown): Promise<string> } };
    const error = (await api.d.put(body).catch((e) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.violations[0]).toMatchObject({ code: "BODY_TOO_LARGE", limit: 4 * CHUNK });
    expect(generated).toBeLessThan(10);
  });
});
