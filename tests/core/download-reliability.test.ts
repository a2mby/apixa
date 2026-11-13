import { AbortError, HttpError, NetworkError, TimeoutError, defineApi } from "@apixa/core";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { describe, expect, it } from "vitest";

const BYTES = new Uint8Array([1, 2, 3, 4, 5]);

type Plan = (
  attempt: number,
  signal: AbortSignal | null | undefined,
) => Response | Promise<Response>;

/** A stub `fetch` that, like the real one, ties the request signal to the response body stream. */
function stub(plan: Plan) {
  const calls: Array<{ method: string; body: unknown }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", body: init?.body });
    return plan(calls.length, init?.signal);
  }) as typeof fetch;
  return { transport: createFetchTransport(fetchImpl), calls };
}

/** Headers arrive at once; the body then waits for more bytes until the signal aborts or it errors. */
function slowBody(signal: AbortSignal | null | undefined, then: "hang" | "fail") {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BYTES.slice(0, 2));
      if (then === "fail") {
        queueMicrotask(() => controller.error(new TypeError("terminated")));
        return;
      }
      signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/pdf" } });
}

type Doc = { id: string };
function client(
  transport: ReturnType<typeof stub>["transport"],
  resource: Record<string, unknown> = {},
  root: Record<string, unknown> = {},
) {
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport,
    ...root,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          export: { kind: "write", method: "POST", path: "/export", responseType: "blob" },
          upload: { kind: "write", method: "POST", path: "/upload", responseType: "blob" },
        },
        ...resource,
      },
    },
  } as never) as never as {
    docs: {
      download(options: { params: { id: string } } & Record<string, unknown>): Promise<Blob>;
      export(body?: unknown, options?: Record<string, unknown>): Promise<Blob>;
      upload(body?: unknown, options?: Record<string, unknown>): Promise<Blob>;
    };
  };
}

describe("cancellation and timeouts while the body is being read", () => {
  it("an abort during the body read is an AbortError", async () => {
    const { transport } = stub((_n, signal) => slowBody(signal, "hang"));
    const api = client(transport);
    const controller = new AbortController();
    const pending = api.docs.download({ params: { id: "1" }, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AbortError);
  });

  it("a timeout during the body read is a TimeoutError", async () => {
    const { transport } = stub((_n, signal) => slowBody(signal, "hang"));
    const api = client(transport);
    const error = await api.docs
      .download({ params: { id: "1" }, timeout: 30 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it("an operation-level timeout covers the body read too", async () => {
    const { transport } = stub((_n, signal) => slowBody(signal, "hang"));
    const api = client(transport, {
      operations: {
        download: {
          kind: "read",
          method: "GET",
          path: "/:id/file",
          responseType: "blob",
          timeout: 30,
        },
      },
    });
    const error = await api.docs.download({ params: { id: "1" } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it("an already-aborted signal never starts the request", async () => {
    const { transport, calls } = stub(() => new Response(BYTES));
    const api = client(transport);
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.docs.download({ params: { id: "1" }, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(calls).toHaveLength(0);
  });
});

describe("failures and retries", () => {
  it("a stream that fails mid-body is a NetworkError", async () => {
    const { transport } = stub((_n, signal) => slowBody(signal, "fail"));
    const error = await client(transport)
      .docs.download({ params: { id: "1" } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("a safe read is retried after a mid-body failure and returns the full bytes once", async () => {
    const { transport, calls } = stub((n, signal) =>
      n === 1
        ? slowBody(signal, "fail")
        : new Response(BYTES, { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const api = client(transport, {}, { retry: { retries: 1, baseDelayMs: 1, jitter: false } });
    const blob = await api.docs.download({ params: { id: "1" } });
    expect(calls).toHaveLength(2);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES);
  });

  it("a retryable status is decided from status and headers: the JSON error body is read, not a blob", async () => {
    const { transport, calls } = stub((n) =>
      n === 1
        ? new Response('{"message":"busy"}', {
            status: 503,
            headers: { "content-type": "application/json", "retry-after": "0" },
          })
        : new Response(BYTES, { status: 200 }),
    );
    const api = client(transport, {}, { retry: { retries: 1, baseDelayMs: 1, jitter: false } });
    expect(await api.docs.download({ params: { id: "1" } })).toBeInstanceOf(Blob);
    expect(calls).toHaveLength(2);
  });

  it("exhausted retries surface an HttpError with the parsed body", async () => {
    const { transport, calls } = stub(
      () =>
        new Response('{"message":"down"}', {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = client(transport, {}, { retry: { retries: 1, baseDelayMs: 1, jitter: false } });
    const error = (await api.docs
      .download({ params: { id: "1" } })
      .catch((e: unknown) => e)) as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.data).toEqual({ message: "down" });
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("a successful binary body is read exactly once", async () => {
    let reads = 0;
    const { transport, calls } = stub(() => {
      const response = new Response(BYTES);
      const original = response.blob.bind(response);
      response.blob = () => (reads++, original());
      return response;
    });
    await client(transport).docs.download({ params: { id: "1" } });
    expect(reads).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("a write is not retried by default, even though its response is binary", async () => {
    const { transport, calls } = stub(() => new Response("nope", { status: 503 }));
    const api = client(transport, {}, { retry: { retries: 3, baseDelayMs: 1, jitter: false } });
    await expect(api.docs.export({ format: "pdf" })).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("a non-replayable request body is never retried, whatever the response type", async () => {
    const { transport, calls } = stub((_n, signal) => slowBody(signal, "fail"));
    const api = client(
      transport,
      {
        operations: {
          upload: {
            kind: "write",
            method: "POST",
            path: "/upload",
            responseType: "blob",
            retry: { retries: 3, baseDelayMs: 1, jitter: false, methods: ["POST"] },
          },
        },
      },
      {},
    );
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(BYTES);
        c.close();
      },
    });
    await expect(api.docs.upload(body)).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
  });
});
