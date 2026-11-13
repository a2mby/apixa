import { HttpError, NetworkError, TimeoutError, defineApi } from "@apixa/core";
import type { Transport } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import {
  bytes,
  chunkedResponse,
  collector,
  transferClient,
  type StubFetch,
} from "../helpers/transfer.js";

const RETRY = { retries: 2, baseDelayMs: 0, maxDelayMs: 0, methods: ["GET", "PUT", "POST"] };

describe("retries and transfer events", () => {
  it("each attempt starts a new sequence; progress restarts at 0; error says whether a retry follows", async () => {
    let n = 0;
    const fetchImpl: StubFetch = async () => {
      n++;
      if (n === 1) return new Response("busy", { status: 503 });
      if (n === 2)
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(c) {
                if (n === 2) {
                  n = 2.5;
                  c.enqueue(bytes(3));
                } else c.error(new TypeError("terminated"));
              },
            },
            { highWaterMark: 0 },
          ),
        );
      return chunkedResponse([bytes(5)], { headers: { "content-length": "5" } });
    };
    const c = collector();
    const blob = await transferClient(fetchImpl).docs.download({
      params: { id: "1" },
      retry: RETRY,
      onTransfer: c.observer,
    });
    expect(blob.size).toBe(5);
    expect(c.events.map((e) => `${e.attempt}:${e.phase}`)).toEqual([
      "0:start",
      "0:error", // 503
      "1:start",
      "1:progress",
      "1:error", // dropped mid-body
      "2:start",
      "2:progress",
      "2:complete",
    ]);
    const errors = c.events.filter((e) => e.phase === "error");
    expect(errors.map((e) => (e as { willRetry: boolean }).willRetry)).toEqual([true, true]);
    expect((errors[0] as { error: unknown }).error).toBeInstanceOf(HttpError);
    expect((errors[1] as { error: unknown }).error).toBeInstanceOf(NetworkError);
    // Progress is isolated per attempt: attempt 1 saw 3 bytes, attempt 2 starts again from 0.
    expect(c.events.find((e) => e.attempt === 1 && e.phase === "progress")).toMatchObject({
      loaded: 3,
    });
    expect(c.events.find((e) => e.attempt === 2 && e.phase === "start")).toMatchObject({
      loaded: 0,
    });
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", loaded: 5, total: 5 });
  });

  it("when retries run out the last error says willRetry false and the call rejects", async () => {
    const c = collector();
    const error = await transferClient(async () => new Response("x", { status: 503 }))
      .docs.download({
        params: { id: "1" },
        retry: { ...RETRY, retries: 1 },
        onTransfer: c.observer,
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    const errors = c.events.filter((e) => e.phase === "error");
    expect(errors.map((e) => (e as { willRetry: boolean }).willRetry)).toEqual([true, false]);
    expect(c.events.filter((e) => e.phase === "complete")).toHaveLength(0);
  });

  it("a Blob upload is replayed on retry with a fresh counted stream and the same bytes", async () => {
    let n = 0;
    const sizes: number[] = [];
    const fetchImpl: StubFetch = async (_u, init) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      let total = 0;
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        total += r.value.byteLength;
      }
      sizes.push(total);
      return new Response(null, { status: ++n === 1 ? 503 : 200 });
    };
    const c = collector();
    await transferClient(fetchImpl).docs.push(new Blob([bytes(40)]), {
      retry: RETRY,
      onTransfer: c.observer,
    });
    expect(sizes).toEqual([40, 40]);
    const up = c.of("upload");
    expect(up.map((e) => `${e.attempt}:${e.phase}`)).toEqual([
      "0:start",
      "0:progress",
      "0:complete",
      "1:start",
      "1:progress",
      "1:complete",
    ]);
  });

  it("a ReadableStream request body is never retried, observed or not", async () => {
    for (const observed of [false, true]) {
      let calls = 0;
      const fetchImpl: StubFetch = async () => {
        calls++;
        return new Response("busy", { status: 503 });
      };
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes(2));
          c.close();
        },
      });
      const c = collector();
      const error = await transferClient(fetchImpl)
        .docs.push(body, { retry: RETRY, ...(observed ? { onTransfer: c.observer } : {}) })
        .catch((e) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(calls).toBe(1);
      if (observed) {
        // The server answered before the body was consumed, so upload ends in error too.
        expect(
          c
            .of("download")
            .filter((e) => e.phase === "error")
            .map((e) => (e as { willRetry: boolean }).willRetry),
        ).toEqual([false]);
        expect(c.of("upload").at(-1)).toMatchObject({ phase: "error", willRetry: false });
      }
    }
  });
});

describe("timeouts, aborts and failures", () => {
  it("the overall timeout during a body read is a TimeoutError with an error event (not abort)", async () => {
    const fetchImpl: StubFetch = async (_u, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(bytes(2));
            init.signal!.addEventListener("abort", () => c.error(init.signal!.reason));
          },
        }),
        { headers: { "content-length": "100" } },
      );
    const c = collector();
    const error = await transferClient(fetchImpl)
      .docs.download({ params: { id: "1" }, timeout: 20, onTransfer: c.observer })
      .catch((e) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    const last = c.events.at(-1)!;
    expect(last).toMatchObject({ phase: "error", loaded: 2, total: 100, willRetry: false });
    expect(c.events.filter((e) => e.phase === "abort")).toHaveLength(0);
    expect((error as TimeoutError).transfer).toEqual({
      direction: "download",
      loaded: 2,
      total: 100,
    });
  });

  it("a caller abort during a body read is AbortError with a single abort event", async () => {
    const controller = new AbortController();
    const fetchImpl: StubFetch = async (_u, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(bytes(2));
            setTimeout(() => controller.abort("user"), 5);
            init.signal!.addEventListener("abort", () => c.error(init.signal!.reason));
          },
        }),
      );
    const c = collector();
    const error = await transferClient(fetchImpl)
      .docs.download({ params: { id: "1" }, signal: controller.signal, onTransfer: c.observer })
      .catch((e) => e);
    expect(error.name).toBe("AbortError");
    expect(c.events.filter((e) => e.phase === "abort")).toHaveLength(1);
    expect(c.events.at(-1)).toMatchObject({ phase: "abort", loaded: 2, reason: "user" });
  });

  it("aborting before anything is sent emits no events (nothing started) and does not call the transport", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const c = collector();
    const error = await transferClient(async () => {
      calls++;
      return new Response("x");
    })
      .docs.download({ params: { id: "1" }, signal: controller.signal, onTransfer: c.observer })
      .catch((e) => e);
    expect(error.name).toBe("AbortError");
    expect(calls).toBe(0);
    expect(c.events).toEqual([]);
  });

  it("a connection failure before the response is a NetworkError; started uploads end with error", async () => {
    const fetchImpl: StubFetch = async (_u, init) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      throw new TypeError("fetch failed");
    };
    const c = collector();
    const error = await transferClient(fetchImpl)
      .docs.upload(new Blob([bytes(10)]), { onTransfer: c.observer })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(c.of("upload").at(-1)).toMatchObject({ phase: "error", loaded: 10, willRetry: false });
    expect(c.of("download")).toEqual([]);
  });

  it("a throwing observer never changes the result", async () => {
    const blob = await transferClient(async () => chunkedResponse([bytes(3)])).docs.download({
      params: { id: "1" },
      onTransfer() {
        throw new Error("observer bug");
      },
    });
    expect(blob.size).toBe(3);
  });
});

describe("middleware, custom transports, defaults", () => {
  const response = () => new Response(new Blob([bytes(4)]), { headers: { "content-length": "4" } });

  it("request/response middleware run once per logical call, even across retries, and see unchanged binary data", async () => {
    let requests = 0;
    let responses = 0;
    let seen: unknown;
    let n = 0;
    const client = transferClient(
      async () => (++n === 1 ? new Response("x", { status: 503 }) : response()),
      {
        operation: {
          middleware: {
            onRequest: [() => void requests++],
            onResponse: [
              (res: { data: unknown }) => {
                responses++;
                seen = res.data;
              },
            ],
          },
        },
      },
    );
    const c = collector();
    const blob = await client.docs.download({
      params: { id: "1" },
      retry: RETRY,
      onTransfer: c.observer,
    });
    expect(requests).toBe(1);
    expect(responses).toBe(1);
    expect(seen).toBeInstanceOf(Blob);
    expect(seen).toBe(blob);
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", attempt: 1 });
  });

  it("a custom transport that ignores onTransfer works; both directions are reported unsupported", async () => {
    const transport: Transport = {
      async request() {
        const raw = response();
        return { status: 200, headers: raw.headers, raw, body: await raw.blob() };
      },
    };
    const api = defineApi<{ d: { path: "/d"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        d: {
          path: "/d",
          operations: { up: { kind: "write", method: "POST", path: "/up", responseType: "blob" } },
        },
      },
    } as never) as never as { d: { up(b: unknown, o?: object): Promise<Blob> } };
    const c = collector();
    const out = await api.d.up("payload", { onTransfer: c.observer });
    expect(out.size).toBe(4);
    expect(c.events).toEqual([
      expect.objectContaining({ phase: "unsupported", direction: "upload" }),
      expect.objectContaining({ phase: "unsupported", direction: "download" }),
    ]);
  });

  it("an operation-level onTransfer is the default; the per-call one wins", async () => {
    const op = collector();
    const call = collector();
    const client = transferClient(async () => response(), {
      operation: { onTransfer: op.observer },
    });
    await client.docs.download({ params: { id: "1" } });
    expect(op.events.length).toBeGreaterThan(0);
    const before = op.events.length;
    await client.docs.download({ params: { id: "1" }, onTransfer: call.observer });
    expect(call.events.length).toBeGreaterThan(0);
    expect(op.events.length).toBe(before);
  });

  it("onTransfer must be a function (call and operation)", async () => {
    const client = transferClient(async () => response());
    await expect(
      client.docs.download({ params: { id: "1" }, onTransfer: "nope" }),
    ).rejects.toMatchObject({
      name: "ConfigError",
    });
    expect(() => transferClient(async () => response(), { operation: { onTransfer: 3 } })).toThrow(
      /onTransfer must be a function/,
    );
  });

  it("idempotency keys are unchanged by observation", async () => {
    const keys: Array<string | null> = [];
    let n = 0;
    const fetchImpl: StubFetch = async (_u, init) => {
      keys.push(new Headers(init.headers).get("idempotency-key"));
      return ++n === 1 ? new Response("x", { status: 503 }) : new Response("ok");
    };
    const client = defineApi<{ docs: { path: "/docs"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      transport: createFetchTransport(fetchImpl as unknown as typeof fetch),
      resources: {
        docs: {
          path: "/docs",
          operations: {
            push: {
              kind: "write",
              method: "PUT",
              path: "/push",
              responseType: "text",
              idempotency: true,
            },
          },
        },
      },
    } as never) as never as { docs: { push(b: unknown, o?: object): Promise<string> } };
    await client.docs.push("a", { retry: RETRY, onTransfer: () => {}, idempotencyKey: "k-1" });
    expect(keys).toEqual(["k-1", "k-1"]);
  });
});
