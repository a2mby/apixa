import {
  ConfigError,
  defineApi,
  HttpError,
  NetworkError,
  TimeoutError,
  type ApiRequest,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("one pipeline for three middleware styles", () => {
  it("runs request, response, and error stages root → resource → operation, sync and async", async () => {
    const log: string[] = [];
    const tag = (name: string) => ({
      onRequest: async (r: ApiRequest) => (log.push(`req:${name}`), r),
      onResponse: (r: { data: unknown }) => void log.push(`res:${name}`),
    });
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body: [] })),
      middleware: tag("root"),
      requestMiddleware: [
        (r) => (log.push("req:root[0]"), r),
        async () => {
          log.push("req:root[1]"); // returning nothing keeps the request
        },
      ],
      responseMiddleware: [(r) => (log.push("res:root[0]"), r)],
      resources: {
        users: {
          path: "/users",
          middleware: tag("resource"),
          operations: {
            getAll: {
              middleware: tag("op"),
              responseMiddleware: [() => void log.push("res:op[0]")],
            },
          },
        },
      },
    });
    await api.users.getAll();
    expect(log).toEqual([
      "req:root",
      "req:root[0]",
      "req:root[1]",
      "req:resource",
      "req:op",
      "res:root",
      "res:root[0]",
      "res:resource",
      "res:op",
      "res:op[0]",
    ]);
  });

  it("request middleware can modify the request; response middleware can replace the response", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((r) => ({
        body: { echo: r.headers.get("x-app"), body: r.body },
      })),
      requestMiddleware: [
        (r) => {
          r.headers.set("X-App", "apixa");
          return { ...r, body: { ...(r.body as object), added: true } };
        },
      ],
      responseMiddleware: [(res) => ({ ...res, data: { wrapped: res.data, status: res.status } })],
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.create({ a: 1 })).toEqual({
      wrapped: { echo: "apixa", body: JSON.stringify({ a: 1, added: true }) },
      status: 200,
    });
  });

  it("full: true returns the response envelope after middleware", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ status: 201, body: { id: 1 } })),
      resources: { users: { path: "/users" } },
    });
    const res = await api.users.create({}, { full: true });
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ id: 1 });
    expect(res.request.operation).toBe("create");
    expect(res.raw).toBeInstanceOf(Response);
  });

  it("error middleware can log and rethrow, or recover with a fallback", async () => {
    const seen: unknown[] = [];
    const failing = createFakeTransport(() => ({ status: 500 }));
    const rethrow = defineApi({
      baseURL: "https://x.dev",
      transport: failing,
      middleware: { onError: (e) => (seen.push(e), undefined) },
      resources: { users: { path: "/users" } },
    });
    await expect(rethrow.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(seen[0]).toBeInstanceOf(HttpError);

    const recover = defineApi({
      baseURL: "https://x.dev",
      transport: failing,
      resources: { users: { path: "/users", middleware: { onError: () => [{ id: "cached" }] } } },
    });
    expect(await recover.users.getAll()).toEqual([{ id: "cached" }]);
  });

  it("a throwing error handler replaces the error for later handlers", async () => {
    class Friendly extends Error {}
    const seen: unknown[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ status: 503 })),
      middleware: {
        onError: () => {
          throw new Friendly("try later");
        },
      },
      resources: { users: { path: "/users", middleware: { onError: (e) => void seen.push(e) } } },
    });
    await expect(api.users.getAll()).rejects.toBeInstanceOf(Friendly);
    expect(seen[0]).toBeInstanceOf(Friendly);
  });

  it("error middleware can distinguish timeout, network, and HTTP failures", async () => {
    const codes: string[] = [];
    const onError = (e: unknown) => void codes.push((e as { code: string }).code);
    const hang = createFakeTransport(() => new Promise(() => undefined));
    const net = createFakeTransport(() => {
      throw new NetworkError("down");
    });
    for (const [transport, timeout] of [
      [hang, 5],
      [net, undefined],
      [createFakeTransport(() => ({ status: 404 })), undefined],
    ] as const) {
      const api = defineApi({
        baseURL: "https://x.dev",
        transport,
        timeout,
        middleware: { onError },
        resources: { u: { path: "/u" } },
      });
      await api.u.getAll().catch(() => undefined);
    }
    expect(codes).toEqual(["TIMEOUT", "NETWORK", "HTTP"]);
  });

  it("request and response middleware run once per call even when the transport retries", async () => {
    let req = 0;
    let res = 0;
    let attempts = 0;
    const api = defineApi({
      baseURL: "https://x.dev",
      retry: { retries: 3, baseDelayMs: 0 },
      transport: createFakeTransport(() => (++attempts < 3 ? { status: 503 } : { body: [] })),
      requestMiddleware: [(r) => (req++, r)],
      responseMiddleware: [(r) => (res++, r)],
      resources: { users: { path: "/users" } },
    });
    await api.users.getAll();
    expect([attempts, req, res]).toEqual([3, 1, 1]);
  });

  it("response key transforms run before response middleware", async () => {
    let seen: unknown;
    const api = defineApi({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      transport: createFakeTransport(() => ({ body: { first_name: "Ali" } })),
      responseMiddleware: [(r) => void (seen = r.data)],
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.getById(1)).toEqual({ firstName: "Ali" });
    expect(seen).toEqual({ firstName: "Ali" });
  });

  it("mocked resources run the same middleware stages without a transport", async () => {
    const log: string[] = [];
    const api = defineApi({
      baseURL: "/api",
      middleware: {
        onRequest: (r) => void log.push(`req ${r.mocked}`),
        onResponse: (r) => void log.push(`res ${r.status}`),
        onError: (e) => void log.push(`err ${(e as { code: string }).code}`),
      },
      resources: { users: { path: "/users", mock: [{ id: 1 }] } },
    });
    await api.users.create({});
    await api.users.getById(9).catch(() => undefined);
    expect(log).toEqual(["req true", "res 201", "req true", "err MOCK_NOT_FOUND"]);
  });

  it("rejects malformed middleware results and shapes", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body: [] })),
      responseMiddleware: [() => "nope" as never],
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll()).rejects.toBeInstanceOf(ConfigError);
    expect(() =>
      defineApi({ baseURL: "https://x.dev", middleware: [] as never, resources: {} }),
    ).toThrow(/Around-style/);
    expect(() =>
      defineApi({ baseURL: "https://x.dev", requestMiddleware: ["x"] as never, resources: {} }),
    ).toThrow(/requestMiddleware\[0\] must be a function/);
  });

  it("types middleware arguments", () => {
    defineApi({
      baseURL: "https://x.dev",
      requestMiddleware: [(r) => (expectTypeOf(r).toEqualTypeOf<ApiRequest>(), r)],
      middleware: { onError: (e) => (expectTypeOf(e).toBeUnknown(), undefined) },
      resources: {},
    });
    expect(TimeoutError).toBeDefined();
  });
});
