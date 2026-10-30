import {
  AbortError,
  defineApi,
  HttpError,
  NetworkError,
  TimeoutError,
  type Middleware,
} from "@apixa/core";
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
      users: { path: "/users" },
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
        users: { path: "/users" },
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
      users: { path: "/users" },
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
      users: { path: "/users" },
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
      users: { path: "/users" },
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
        users: { path: "/users" },
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

  it("runs middleware per attempt and mutates request headers before transport", async () => {
    const seen: string[] = [];
    let middlewareCalls = 0;

    const trace: Middleware = async (ctx, next) => {
      middlewareCalls += 1;
      ctx.request.headers.set("X-Trace", "1");
      return next();
    };

    const api = defineApi({
      baseURL: "https://api.example.com",
      retry: { retries: 1, baseDelayMs: 1, jitter: false },
      middleware: [trace],
      transport: createFakeTransport((request) => {
        seen.push(request.headers.get("x-trace") ?? "");
        if (seen.length === 1) {
          throw new NetworkError("temporary");
        }
        return { body: [] };
      }),
      users: { path: "/users" },
    });

    await api.users.getAll();
    expect(middlewareCalls).toBe(2);
    expect(seen).toEqual(["1", "1"]);
  });

  it("allows middleware to call next() more than once", async () => {
    let transportCalls = 0;

    const refresh: Middleware = async (_ctx, next) => {
      let res = await next();
      if (res.status === 401) {
        res = await next();
      }
      return res;
    };

    const api = defineApi({
      baseURL: "https://api.example.com",
      middleware: [refresh],
      transport: createFakeTransport(() => {
        transportCalls += 1;
        if (transportCalls === 1) {
          return { status: 401, body: { detail: "unauthorized" } };
        }
        return { body: [{ id: "1" }] };
      }),
      users: { path: "/users" },
    });

    await expect(api.users.getAll()).resolves.toEqual([{ id: "1" }]);
    expect(transportCalls).toBe(2);
  });

  it("preserves middleware error path as documented ApiError types", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      middleware: [
        async (_ctx, next) => {
          try {
            return await next();
          } catch (error) {
            throw error;
          }
        },
      ],
      transport: createFakeTransport(() => ({ status: 500, body: { detail: "boom" } })),
      users: { path: "/users" },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(HttpError);
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
      users: {
        path: "/users",
        operations: {
          getAll: { retry: false },
        },
      },
    });

    await expect(api.users.getAll()).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(1);
  });
});
