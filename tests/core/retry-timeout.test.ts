import {
  AbortError,
  computeBackoffMs,
  defineApi,
  HttpError,
  NetworkError,
  parseRetryAfter,
  TimeoutError,
  type Transport,
} from "@apixa/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

const resources = { users: { path: "/users" } } as const;

function sequence(...steps: Array<{ status?: number; headers?: HeadersInit } | Error>) {
  let i = 0;
  const calls = { count: 0 };
  const transport = createFakeTransport((request) => {
    calls.count++;
    const step = steps[Math.min(i++, steps.length - 1)]!;
    if (step instanceof Error) throw step;
    const okBody = request.method === "GET" ? [] : { id: 1 };
    return {
      status: step.status ?? 200,
      headers: step.headers,
      body: step.status && step.status >= 400 ? { e: 1 } : okBody,
    };
  });
  return { transport, calls };
}

/** Transport that never answers until aborted. */
const hanging: Transport = {
  request: (input) =>
    new Promise((_, reject) =>
      input.signal?.addEventListener("abort", () => reject(input.signal!.reason), { once: true }),
    ),
};

afterEach(() => vi.useRealTimers());

describe("retry policy", () => {
  it("succeeds on the first attempt without retry overhead", async () => {
    const { transport, calls } = sequence({});
    const api = defineApi({ baseURL: "https://x.dev", retry: 3, transport, resources });
    await api.users.getAll();
    expect(calls.count).toBe(1);
  });

  it("retry: 2 retries transient failures (network, 503) for safe methods", async () => {
    const { transport, calls } = sequence(new NetworkError("blip"), { status: 503 }, {});
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 2, baseDelayMs: 0 },
      transport,
      resources,
    });
    await expect(api.users.getAll()).resolves.toEqual([]);
    expect(calls.count).toBe(3);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    const { transport, calls } = sequence({ status: 422 });
    const api = defineApi({ baseURL: "https://x.dev", retry: 3, transport, resources });
    const error = await api.users.getAll().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 422, retryable: false });
    expect(calls.count).toBe(1);
  });

  it("does not retry writes unless their method is opted in", async () => {
    const plain = sequence({ status: 503 }, {});
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 2, baseDelayMs: 0 },
      transport: plain.transport,
      resources,
    });
    await expect(api.users.create({})).rejects.toBeInstanceOf(HttpError);
    expect(plain.calls.count).toBe(1);

    const optIn = sequence({ status: 503 }, {});
    const writes = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 2, baseDelayMs: 0, methods: ["POST"] },
      transport: optIn.transport,
      resources,
    });
    await writes.users.create({});
    expect(optIn.calls.count).toBe(2);
  });

  it("uses exponential backoff with bounded jitter", () => {
    const retry = {
      retries: 5,
      methods: ["GET" as const],
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false,
      respectRetryAfter: true,
    };
    expect([0, 1, 2, 3, 4].map((a) => computeBackoffMs(a, retry))).toEqual([
      100, 200, 400, 800, 1000,
    ]);
    const jittered = { ...retry, jitter: true };
    expect(computeBackoffMs(2, jittered, () => 0)).toBe(200);
    expect(computeBackoffMs(2, jittered, () => 0.999)).toBe(399);
  });

  it("honors a valid Retry-After and ignores an invalid one", async () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(new Date(Date.now() + 3000).toUTCString())).toBeGreaterThan(1000);
    expect(parseRetryAfter("soon")).toBeUndefined();

    vi.useFakeTimers();
    const valid = sequence({ status: 429, headers: { "Retry-After": "1" } }, {});
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 1, baseDelayMs: 5, jitter: false },
      transport: valid.transport,
      resources,
    });
    const pending = api.users.getAll();
    await vi.advanceTimersByTimeAsync(999);
    expect(valid.calls.count).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(valid.calls.count).toBe(2);

    const invalid = sequence({ status: 429, headers: { "Retry-After": "later" } }, {});
    const api2 = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 1, baseDelayMs: 5, jitter: false },
      transport: invalid.transport,
      resources,
    });
    const pending2 = api2.users.getAll();
    await vi.advanceTimersByTimeAsync(5);
    await pending2;
    expect(invalid.calls.count).toBe(2);
  });

  it("stops retrying when Retry-After exceeds maxDelayMs", async () => {
    const { transport, calls } = sequence({ status: 503, headers: { "Retry-After": "120" } }, {});
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 3, maxDelayMs: 2000 },
      transport,
      resources,
    });
    await expect(api.users.getAll()).rejects.toMatchObject({ status: 503, retryable: false });
    expect(calls.count).toBe(1);
  });

  it("does not retry a non-replayable stream body", async () => {
    const { transport, calls } = sequence({ status: 503 }, {});
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 2, baseDelayMs: 0, methods: ["POST"] },
      transport,
      resources,
    });
    await expect(api.users.create(new ReadableStream() as never)).rejects.toBeInstanceOf(HttpError);
    expect(calls.count).toBe(1);
  });
});

describe("timeout and cancellation (one budget for the whole logical call)", () => {
  it("times out during a request as TimeoutError", async () => {
    const api = defineApi({ baseURL: "https://x.dev", timeout: 20, transport: hanging, resources });
    const error = await api.users.getAll().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toMatchObject({ code: "TIMEOUT" });
  });

  it("the timeout spans attempts and backoff instead of restarting per attempt", async () => {
    vi.useFakeTimers();
    const { transport, calls } = sequence({ status: 503 });
    const api = defineApi({
      baseURL: "https://x.dev",
      timeout: 250,
      retry: { retries: 10, baseDelayMs: 100, jitter: false, maxDelayMs: 100 },
      transport,
      resources,
    });
    const pending = api.users.getAll().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeInstanceOf(TimeoutError);
    expect(calls.count).toBe(3); // t=0, 100, 200 — then the 250ms budget ends during backoff
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.count).toBe(3);
  });

  it("caller abort is an AbortError, never a timeout or an HTTP error", async () => {
    const controller = new AbortController();
    const api = defineApi({
      baseURL: "https://x.dev",
      timeout: 10_000,
      transport: hanging,
      resources,
    });
    const pending = api.users.getAll({ signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(error).toBeInstanceOf(AbortError);
    expect(error).not.toBeInstanceOf(TimeoutError);
    expect((error as AbortError).status).toBeUndefined();
  });

  it("abort during backoff stops further attempts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { transport, calls } = sequence({ status: 503 });
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 5, baseDelayMs: 1000, jitter: false },
      transport,
      resources,
    });
    const pending = api.users.getAll({ signal: controller.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    expect(await pending).toBeInstanceOf(AbortError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.count).toBe(1);
  });

  it("an already-aborted signal never reaches transport", async () => {
    const { transport, calls } = sequence({});
    const api = defineApi({ baseURL: "https://x.dev", transport, resources });
    await expect(api.users.getAll({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(calls.count).toBe(0);
  });

  it("per-request timeout overrides operation, resource, and root", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      timeout: 10_000,
      transport: hanging,
      resources: {
        users: { path: "/users", timeout: 10_000, operations: { getAll: { timeout: 10_000 } } },
      },
    });
    await expect(api.users.getAll({ timeout: 10 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("cleans up the caller's abort listener after the call", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: sequence({}).transport,
      resources,
    });
    await api.users.getAll({ signal: controller.signal });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
