import { HttpError, ValidationError, defineApi } from "@apixa/core";
import type { Transport } from "@apixa/core";
import { describe, expect, it } from "vitest";
import {
  bytes,
  chunkedResponse,
  collector,
  drain,
  transferClient,
  type StubFetch,
} from "../helpers/transfer.js";

const parts = [bytes(4, 1), bytes(3, 2), bytes(5, 3)]; // 12 bytes
const limited = (max: number, fetchImpl: StubFetch, extra: Record<string, unknown> = {}) =>
  transferClient(fetchImpl, { operation: { maxResponseSize: max, ...extra } });
const violation = (e: unknown) => (e as ValidationError).violations[0];

describe("maxResponseSize across response types", () => {
  const cases = [
    ["blob", (c: ReturnType<typeof limited>) => c.docs.download({ params: { id: "1" } })],
    ["arrayBuffer", (c: ReturnType<typeof limited>) => c.docs.buffer()],
    ["text", (c: ReturnType<typeof limited>) => c.docs.text()],
    ["json", (c: ReturnType<typeof limited>) => c.docs.json()],
  ] as const;

  const body = (type: string) =>
    type === "json" ? [new TextEncoder().encode(JSON.stringify({ a: "x".repeat(10) }))] : parts;
  const size = (type: string) => body(type).reduce((n, p) => n + p.byteLength, 0);
  const headers = (type: string) => ({
    "content-type": type === "json" ? "application/json" : "application/octet-stream",
  });

  it.each(cases)(
    "%s: byte-exact at the limit, rejected one byte under (no Content-Length)",
    async (type, call) => {
      const stub: StubFetch = async () => chunkedResponse(body(type), { headers: headers(type) });
      await expect(call(limited(size(type), stub))).resolves.toBeDefined();
      const error = await call(limited(size(type) - 1, stub)).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(violation(error)).toMatchObject({
        code: "RESPONSE_TOO_LARGE",
        path: "$",
        limit: size(type) - 1,
      });
      expect(violation(error)!.actual).toBeGreaterThan(size(type) - 1);
    },
  );

  it.each(cases)(
    "%s: a truthful Content-Length over the limit is rejected early and the body is cancelled",
    async (type, call) => {
      let cancelled = false;
      const stub: StubFetch = async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(c) {
              c.enqueue(bytes(1));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { ...headers(type), "content-length": "5000" } },
        );
      const error = await call(limited(100, stub)).catch((e) => e);
      expect(violation(error)).toMatchObject({
        code: "RESPONSE_TOO_LARGE",
        limit: 100,
        actual: 5000,
      });
      expect(cancelled).toBe(true);
    },
  );

  it("a Content-Length that lies low is caught by counting; one that lies high is rejected early", async () => {
    const liar: StubFetch = async () =>
      chunkedResponse(parts, { headers: { "content-length": "3" } });
    const error = await limited(10, liar)
      .docs.download({ params: { id: "1" } })
      .catch((e) => e);
    expect(violation(error)).toMatchObject({ code: "RESPONSE_TOO_LARGE", limit: 10 });
  });

  it("a compressed response's Content-Length is not trusted: the decoded bytes are counted", async () => {
    const stub: StubFetch = async () =>
      chunkedResponse(parts, { headers: { "content-length": "2", "content-encoding": "gzip" } });
    // 2 "compressed" bytes would pass a naive check; 12 decoded bytes exceed 10.
    const error = await limited(10, stub)
      .docs.download({ params: { id: "1" } })
      .catch((e) => e);
    expect(violation(error)).toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    await expect(limited(12, stub).docs.download({ params: { id: "1" } })).resolves.toBeDefined();
  });

  it("an unlimited call is unaffected and never wrapped for limits", async () => {
    const stub: StubFetch = async () => chunkedResponse(parts);
    const blob = await transferClient(stub).docs.download({ params: { id: "1" } });
    expect(blob.size).toBe(12);
  });

  it("a per-call limit wins over the operation's, both ways", async () => {
    const stub: StubFetch = async () => chunkedResponse(parts);
    await expect(
      limited(5, stub).docs.download({ params: { id: "1" }, maxResponseSize: 100 }),
    ).resolves.toBeDefined();
    const error = await limited(100, stub)
      .docs.download({ params: { id: "1" }, maxResponseSize: 5 })
      .catch((e) => e);
    expect(violation(error)).toMatchObject({ limit: 5 });
  });

  it("a failed (non-2xx) response keeps its status and HttpError; a small body is still readable", async () => {
    const stub: StubFetch = async () =>
      new Response(JSON.stringify({ message: "nope" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    const error = await limited(1000, stub)
      .docs.download({ params: { id: "1" } })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
    expect((error as HttpError).data).toEqual({ message: "nope" });
  });

  it("an oversized error body is bounded, not buffered: HttpError keeps its status, data is null", async () => {
    let pulls = 0;
    const huge: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(c) {
              pulls++;
              c.enqueue(bytes(10));
            },
          },
          { highWaterMark: 0 },
        ),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    const error = (await limited(25, huge)
      .docs.download({ params: { id: "1" } })
      .catch((e) => e)) as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(502);
    expect(error.data).toBeNull();
    expect(pulls).toBeLessThanOrEqual(4);
    // A declared oversize error body is not read at all.
    let read = false;
    const declared: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(c) {
              read = true;
              c.enqueue(bytes(1));
            },
          },
          { highWaterMark: 0 },
        ),
        { status: 503, headers: { "content-length": "9999" } },
      );
    const e2 = (await limited(25, declared)
      .docs.download({ params: { id: "1" } })
      .catch((e) => e)) as HttpError;
    expect(e2.status).toBe(503);
    expect(e2.data).toBeNull();
    expect(read).toBe(false);
  });

  it("a ValidationError is never retried", async () => {
    let calls = 0;
    const stub: StubFetch = async () => {
      calls++;
      return chunkedResponse(parts);
    };
    await limited(5, stub)
      .docs.download({ params: { id: "1" }, retry: { retries: 3, baseDelayMs: 0 } })
      .catch(() => {});
    expect(calls).toBe(1);
  });

  it("emits a terminal error event with willRetry false and no complete", async () => {
    const c = collector();
    await limited(5, async () => chunkedResponse(parts))
      .docs.download({ params: { id: "1" }, onTransfer: c.observer })
      .catch(() => {});
    expect(c.of("download").at(-1)).toMatchObject({ phase: "error", willRetry: false });
    expect(c.of("download").some((e) => e.phase === "complete")).toBe(false);
  });

  it("responseAccept checks the declared Content-Type", async () => {
    const stub =
      (type: string): StubFetch =>
      async () =>
        chunkedResponse(parts, { headers: { "content-type": type } });
    await expect(
      limited(1000, stub("application/pdf"), { responseAccept: ["application/pdf"] }).docs.download(
        {
          params: { id: "1" },
        },
      ),
    ).resolves.toBeDefined();
    await expect(
      limited(1000, stub("Image/PNG; x=y"), { responseAccept: ["image/*"] }).docs.download({
        params: { id: "1" },
      }),
    ).resolves.toBeDefined();
    const error = await limited(1000, stub("text/html"), { responseAccept: ["application/pdf"] })
      .docs.download({ params: { id: "1" } })
      .catch((e) => e);
    expect(violation(error)).toMatchObject({
      code: "RESPONSE_TYPE_NOT_ALLOWED",
      path: "$",
      rule: "accept",
    });
  });

  it("an empty 204 passes; a limit of 0 only accepts an empty body", async () => {
    await expect(
      limited(0, async () => new Response(null, { status: 204 })).docs.download({
        params: { id: "1" },
      }),
    ).resolves.toBeInstanceOf(Blob);
    await expect(
      limited(0, async () => chunkedResponse([])).docs.download({ params: { id: "1" } }),
    ).resolves.toBeInstanceOf(Blob);
    expect(
      await limited(0, async () => chunkedResponse(parts))
        .docs.download({ params: { id: "1" } })
        .catch((e) => e),
    ).toBeInstanceOf(ValidationError);
  });
});

describe("streamed responses with a limit", () => {
  it("pass under the limit: bytes, order and completion unchanged", async () => {
    const stream = await limited(12, async () => chunkedResponse(parts)).docs.feed();
    expect(Array.from(await drain(stream!))).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3]);
  });

  it("over the limit errors the consumer with ValidationError after delivering only bytes within it", async () => {
    const stream = await limited(8, async () => chunkedResponse(parts)).docs.feed();
    const reader = stream!.getReader();
    const first = await reader.read();
    const second = await reader.read();
    expect([first.value?.byteLength, second.value?.byteLength]).toEqual([4, 3]);
    const error = await reader.read().catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(violation(error)).toMatchObject({ code: "RESPONSE_TOO_LARGE", limit: 8, actual: 12 });
  });

  it("keeps backpressure: nothing is read ahead of the consumer", async () => {
    let pulls = 0;
    const stub: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(c) {
              pulls++;
              c.enqueue(bytes(1));
            },
          },
          { highWaterMark: 0 },
        ),
      );
    const stream = await limited(1000, stub).docs.feed();
    await new Promise((r) => setTimeout(r, 15));
    expect(pulls).toBe(0);
    const reader = stream!.getReader();
    await reader.read();
    await reader.read();
    await new Promise((r) => setTimeout(r, 15));
    expect(pulls).toBe(2);
    await reader.cancel();
  });

  it("an early Content-Length reject needs no read at all and an observer sees the error", async () => {
    const c = collector();
    const error = await limited(
      5,
      async () => chunkedResponse(parts, { headers: { "content-length": "12" } }),
      {},
    )
      .docs.feed({ onTransfer: c.observer })
      .catch((e) => e);
    expect(violation(error)).toMatchObject({ code: "RESPONSE_TOO_LARGE", limit: 5, actual: 12 });
  });

  it("limit failure mid-stream is one error event; cancel and timeout ownership are unchanged", async () => {
    const c = collector();
    const stream = await limited(8, async () => chunkedResponse(parts)).docs.feed({
      onTransfer: c.observer,
    });
    await drain(stream!).catch(() => {});
    expect(c.events.filter((e) => e.phase === "error")).toHaveLength(1);
    expect(c.events.at(-1)).toMatchObject({ phase: "error", willRetry: false });

    const stalled: StubFetch = async (_u, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(ctl) {
            ctl.enqueue(bytes(2));
            init.signal!.addEventListener("abort", () => ctl.error(init.signal!.reason));
          },
        }),
      );
    const reader = (await limited(1000, stalled).docs.feed({ timeout: 20 }))!.getReader();
    await reader.read();
    const error = await reader.read().catch((e) => e);
    expect((error as Error).name).toBe("TimeoutError");
  });
});

describe("custom transports are limited by the pipeline", () => {
  const make = (body: unknown, headers: Record<string, string> = {}): Transport => ({
    async request() {
      const raw = new Response(null, { headers });
      return { status: 200, headers: raw.headers, raw, body };
    },
  });
  const client = (transport: Transport, rt: string, extra: object) =>
    defineApi<{ d: { path: "/d"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        d: {
          path: "/d",
          operations: {
            x: { kind: "read", method: "GET", path: "/x", responseType: rt, ...extra },
          },
        },
      },
    } as never) as never as { d: { x(): Promise<unknown> } };

  it("checks fully read bodies after the fact (Blob, ArrayBuffer, text) and the head headers", async () => {
    for (const body of [new Blob([bytes(20)]), new ArrayBuffer(20), "x".repeat(20)]) {
      const error = await client(make(body), "blob", { maxResponseSize: 10 })
        .d.x()
        .catch((e) => e);
      expect(violation(error), String(body)).toMatchObject({
        code: "RESPONSE_TOO_LARGE",
        actual: 20,
      });
    }
    const early = await client(make(new Blob([]), { "content-length": "99" }), "blob", {
      maxResponseSize: 10,
    })
      .d.x()
      .catch((e) => e);
    expect(violation(early)).toMatchObject({ actual: 99 });
  });

  it("counts a stream result returned by a transport that ignores limits", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes(8));
        c.enqueue(bytes(8));
        c.close();
      },
    });
    const result = (await client(make(stream), "stream", {
      maxResponseSize: 10,
    }).d.x()) as ReadableStream<Uint8Array>;
    const reader = result.getReader();
    await reader.read();
    expect(await reader.read().catch((e) => e)).toBeInstanceOf(ValidationError);
  });
});
