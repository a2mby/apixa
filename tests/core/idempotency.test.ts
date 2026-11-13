import { ConfigError, defineApi, getOperationMetadata, HttpError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Seen = { method: string; url: string; key: string | null; body: unknown };

function recording(statuses: number[] = [200], header = "idempotency-key") {
  const seen: Seen[] = [];
  let i = 0;
  const transport = createFakeTransport((request) => {
    seen.push({
      method: request.method,
      url: request.url,
      key: request.headers.get(header),
      body: request.body,
    });
    const status = statuses[Math.min(i++, statuses.length - 1)]!;
    const okBody = request.method === "GET" ? [] : { id: "1", name: "Ada" };
    return { status, body: status >= 400 ? { error: status } : okBody };
  });
  return { transport, seen };
}

const RETRY_WRITES = { retries: 2, baseDelayMs: 0, jitter: false, methods: ["POST" as const] };

describe("Core idempotency keys", () => {
  it("is disabled by default: no header on writes or reads", async () => {
    const { transport, seen } = recording();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: { users: { path: "/users" } },
    });
    await api.users.create({ name: "Ada" });
    await api.users.getAll();
    expect(seen.map((s) => s.key)).toEqual([null, null]);
    expect(getOperationMetadata(api.users)!.create!.idempotency).toBe(false);
  });

  it("idempotency: true sends a generated Idempotency-Key and leaves the body alone", async () => {
    const { transport, seen } = recording();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    await api.users.create({ name: "Ada" });
    expect(seen[0]!.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(seen[0]!.body).toBe(JSON.stringify({ name: "Ada" }));
    expect(getOperationMetadata(api.users)!.create!.idempotency).toBe(true);
    expect(getOperationMetadata(api.users)!.update!.idempotency).toBe(false);
  });

  it("reuses one key across Core transport retries of the same call", async () => {
    const { transport, seen } = recording([503, 503, 200]);
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          retry: RETRY_WRITES,
          operations: { create: { idempotency: true } },
        },
      },
    });
    await api.users.create({ name: "Ada" });
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((s) => s.key)).size).toBe(1);
    expect(seen[0]!.key).not.toBeNull();
  });

  it("generates distinct keys for distinct logical calls, including concurrent ones", async () => {
    const { transport, seen } = recording();
    let n = 0;
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          operations: { create: { idempotency: { generate: () => `k-${++n}` } } },
        },
      },
    });
    await Promise.all([api.users.create({ name: "A" }), api.users.create({ name: "B" })]);
    await api.users.create({ name: "C" });
    expect(seen.map((s) => s.key).sort()).toEqual(["k-1", "k-2", "k-3"]);
  });

  it("an explicit idempotencyKey wins and is reused when the caller retries the same write", async () => {
    const { transport, seen } = recording([500, 200]);
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    await expect(
      api.users.create({ name: "Ada" }, { idempotencyKey: "order-42" }),
    ).rejects.toBeInstanceOf(HttpError);
    await api.users.create({ name: "Ada" }, { idempotencyKey: "order-42" });
    expect(seen.map((s) => s.key)).toEqual(["order-42", "order-42"]);
  });

  it("supports a custom header name and keeps ordinary headers", async () => {
    const { transport, seen } = recording([200], "x-request-key");
    const headersSeen: Headers[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: {
        request: (input) => {
          headersSeen.push(input.headers);
          return transport.request(input);
        },
      },
      headers: { "X-Client": "test" },
      resources: {
        users: {
          path: "/users",
          operations: {
            create: { idempotency: { header: "X-Request-Key", generate: () => "abc" } },
          },
        },
      },
    });
    await api.users.create({ name: "Ada" });
    expect(seen[0]!.key).toBe("abc");
    expect(headersSeen[0]!.get("x-client")).toBe("test");
    expect(headersSeen[0]!.get("idempotency-key")).toBeNull();
  });

  it("a caller-supplied header is kept rather than overwritten by a generated key", async () => {
    const { transport, seen } = recording();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          operations: { create: { idempotency: { generate: () => "gen" } } },
        },
      },
    });
    await api.users.create({ name: "Ada" }, { headers: { "Idempotency-Key": "from-header" } });
    expect(seen[0]!.key).toBe("from-header");
  });

  it("request middleware sees the key, and an error-middleware replay reuses it", async () => {
    const { transport, seen } = recording([401, 200]);
    const middlewareKeys: Array<string | null> = [];
    let n = 0;
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      middleware: {
        onRequest: [
          (request) => {
            middlewareKeys.push(request.headers.get("idempotency-key"));
          },
        ],
        onError: [
          (error, { replay }) =>
            error instanceof HttpError && error.status === 401 ? replay?.() : undefined,
        ],
      },
      resources: {
        users: {
          path: "/users",
          operations: { create: { idempotency: { generate: () => `k-${++n}` } } },
        },
      },
    });
    await api.users.create({ name: "Ada" });
    expect(seen.map((s) => s.key)).toEqual(["k-1", "k-1"]);
    expect(middlewareKeys).toEqual(["k-1", "k-1"]);
    expect(n).toBe(1);
  });

  it("propagates backend errors unchanged", async () => {
    const { transport } = recording([409]);
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    const error = await api.users.create({ name: "Ada" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
  });

  it("works on a custom write operation", async () => {
    const { transport, seen } = recording();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: {
        users: {
          path: "/users",
          operations: {
            archive: {
              kind: "write",
              method: "POST",
              path: "/:id/archive",
              hasBody: false,
              idempotency: true,
            },
          },
        },
      },
    });
    await api.users.archive({ params: { id: "7" } });
    expect(seen[0]!.url).toBe("https://x.dev/users/7/archive");
    expect(seen[0]!.key).not.toBeNull();
  });

  it("rejects idempotency on reads, at runtime and in types", () => {
    const { transport } = recording();
    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        transport,
        resources: {
          // @ts-expect-error idempotency is only for write operations
          users: { path: "/users", operations: { getAll: { idempotency: true } } },
        },
      }),
    ).toThrow(/only write operations send an idempotency key/);
    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        transport,
        resources: {
          users: {
            path: "/users",
            operations: {
              // @ts-expect-error idempotency is only for write operations
              stats: { kind: "read", method: "GET", path: "/stats", idempotency: true },
            },
          },
        },
      }),
    ).toThrow(ConfigError);
  });

  it("validates the option shape and the generated key", async () => {
    const make = (idempotency: unknown) =>
      defineApi({
        baseURL: "https://x.dev",
        transport: recording().transport,
        resources: {
          users: { path: "/users", operations: { create: { idempotency } as never } },
        },
      });
    expect(() => make({ header: "bad header" })).toThrow(/valid HTTP header name/);
    expect(() => make({ generate: "nope" })).toThrow(/generate must be a function/);
    expect(() => make({ other: 1 })).toThrow(/unknown option "other"/);
    expect(() => make("yes")).toThrow(/must be true, false/);
    await expect(make({ generate: () => "" }).users.create({ name: "A" })).rejects.toThrow(
      /must return a non-empty string/,
    );
  });

  it("an explicit key on an operation without idempotency is a ConfigError, not a silent drop", async () => {
    const { transport, seen } = recording();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport,
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.create({ name: "A" }, { idempotencyKey: "k" })).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(seen).toHaveLength(0);
  });

  it("does not leak keys between requests or clients", async () => {
    const one = recording();
    const two = recording();
    const config = (transport: typeof one.transport) =>
      defineApi({
        baseURL: "https://x.dev",
        transport,
        resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
      });
    const a = config(one.transport);
    const b = config(two.transport);
    await a.users.create({ name: "A" }, { idempotencyKey: "fixed" });
    await a.users.create({ name: "A" });
    await b.users.create({ name: "B" });
    expect(one.seen[1]!.key).not.toBe("fixed");
    expect(two.seen[0]!.key).not.toBe("fixed");
    expect(one.seen[1]!.key).not.toBe(two.seen[0]!.key);
  });

  it("types: idempotencyKey is a call option", () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", operations: { create: { idempotency: true } } } },
    });
    expectTypeOf(api.users.create)
      .parameter(1)
      .toMatchTypeOf<{ idempotencyKey?: string } | undefined>();
  });
});
