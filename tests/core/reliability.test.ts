import { AbortError, defineApi, HttpError, NetworkError, TimeoutError } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("request reliability", () => {
  it("throws AbortError when the call signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(async () => {
        await new Promise(() => undefined);
        return { body: [] };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.getAll({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
  });

  it("throws TimeoutError when the call timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(async () => {
          await new Promise(() => undefined);
          return { body: [] };
        }),
        resources: {
          users: { path: "/users" },
        },
      });

      const pending = api.users.getAll({ timeout: 50 });
      const expectation = expect(pending).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(50);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries GET after transient failures then succeeds", async () => {
    let attempts = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 2, baseDelayMs: 1, jitter: false },
      transport: createFakeTransport(() => {
        attempts += 1;
        if (attempts < 3) {
          throw new NetworkError("temporary");
        }
        return { body: [{ id: "1" }] };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.getAll()).resolves.toEqual([{ id: "1" }]);
    expect(attempts).toBe(3);
  });

  it("does not retry POST by default", async () => {
    let attempts = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 3, baseDelayMs: 1, jitter: false },
      transport: createFakeTransport(() => {
        attempts += 1;
        throw new NetworkError("temporary");
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.create({ name: "Ada" })).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(1);
  });

  it("retries GET on retryable HTTP status then throws the last HttpError", async () => {
    let attempts = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 1, baseDelayMs: 1, jitter: false },
      transport: createFakeTransport(() => {
        attempts += 1;
        return { status: 503, body: { detail: "unavailable" } };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.getAll()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpError);
      if (error instanceof HttpError) {
        expect(error.status).toBe(503);
      }
      return true;
    });
    expect(attempts).toBe(2);
  });

  it("calls a custom shouldRetry exactly once per failed HTTP attempt (v0.11.0 fix)", async () => {
    let attempts = 0;
    let shouldRetryCalls = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: {
        retries: 2,
        baseDelayMs: 1,
        jitter: false,
        shouldRetry: ({ attempt }) => {
          shouldRetryCalls += 1;
          return attempt < 2;
        },
      },
      transport: createFakeTransport(() => {
        attempts += 1;
        return { status: 503, body: { detail: "unavailable" } };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toBe(3);
    // One call per failed attempt that still has retry budget; never consulted twice per attempt,
    // and not consulted once the budget is spent (it cannot extend it).
    expect(shouldRetryCalls).toBe(2);
  });

  it("sets HttpError.retryable consistently with the actual retry decision (v0.11.0 fix)", async () => {
    const seenRetryable: boolean[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: {
        retries: 1,
        baseDelayMs: 1,
        jitter: false,
        shouldRetry: ({ error }) => {
          if (error instanceof HttpError) seenRetryable.push(error.retryable);
          return false;
        },
      },
      transport: createFakeTransport(() => ({ status: 503, body: {} })),
      resources: {
        users: { path: "/users" },
      },
    });

    const error = await api.users.getAll().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    // shouldRetry returned false, so the thrown error's `.retryable` must also be false —
    // previously these could disagree, since the metadata and the decision were two separate
    // decideRetry calls with different `error` values.
    expect((error as HttpError).retryable).toBe(false);
    expect(seenRetryable).toEqual([false]);
  });

  it("stops retry backoff when the caller aborts", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      let attempts = 0;

      const api = defineApi({
        baseURL: "https://api.example.com",
        retry: { retries: 5, baseDelayMs: 1_000, jitter: false },
        transport: createFakeTransport(() => {
          attempts += 1;
          throw new NetworkError("temporary");
        }),
        resources: {
          users: { path: "/users" },
        },
      });

      const pending = api.users.getAll({ signal: controller.signal });
      const expectation = expect(pending).rejects.toBeInstanceOf(AbortError);

      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);
      controller.abort();
      await expectation;
      expect(attempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs request middleware once per logical call (not per retry attempt), before transport", async () => {
    const seen: string[] = [];
    let middlewareCalls = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 1, baseDelayMs: 1, jitter: false },
      requestMiddleware: [
        (request) => {
          middlewareCalls += 1;
          request.headers.set("X-Trace", "1");
          return request;
        },
      ],
      transport: createFakeTransport((request) => {
        seen.push(request.headers.get("x-trace") ?? "");
        if (seen.length === 1) throw new NetworkError("temporary");
        return { body: [] };
      }),
      resources: { users: { path: "/users" } },
    });

    await api.users.getAll();
    expect(middlewareCalls).toBe(1);
    expect(seen).toEqual(["1", "1"]);
  });

  it("passes classified ApiError types to error middleware that rethrows", async () => {
    const seen: unknown[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      middleware: {
        onError: (error) => {
          seen.push(error);
          throw error;
        },
      },
      transport: createFakeTransport(() => ({ status: 500, body: { detail: "boom" } })),
      resources: { users: { path: "/users" } },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(seen[0]).toBeInstanceOf(HttpError);
  });

  it("honors operation-level retry: false over api retry", async () => {
    let attempts = 0;

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 2, baseDelayMs: 1, jitter: false },
      transport: createFakeTransport(() => {
        attempts += 1;
        throw new NetworkError("temporary");
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: { retry: false },
          },
        },
      },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(1);
  });
});
