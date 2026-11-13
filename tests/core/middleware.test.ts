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

describe("middleware pipeline", () => {
  it("composes middleware hooks at client, resource, and operation levels in deterministic order", async () => {
    const events: string[] = [];
    const hooks = (name: string) => ({
      onRequest: [
        () => void events.push(`request:${name}[0]`),
        () => void events.push(`request:${name}[1]`),
      ],
      onResponse: [
        () => void events.push(`response:${name}[0]`),
        () => void events.push(`response:${name}[1]`),
      ],
      onError: [() => void events.push(`error:${name}`)],
    });
    const api = defineApi({
      baseURL: "https://x.dev",
      middleware: hooks("client"),
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          middleware: hooks("resource"),
          operations: { getAll: { middleware: hooks("operation") } },
        },
      },
    });
    await api.users.getAll();
    expect(events).toEqual([
      "request:client[0]",
      "request:client[1]",
      "request:resource[0]",
      "request:resource[1]",
      "request:operation[0]",
      "request:operation[1]",
      "response:client[0]",
      "response:client[1]",
      "response:resource[0]",
      "response:resource[1]",
      "response:operation[0]",
      "response:operation[1]",
    ]);
  });

  it("propagates and recovers errors through middleware hooks in declaration order", async () => {
    const seen: string[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ status: 503 })),
      middleware: {
        onError: [
          () => {
            seen.push("client[0]");
          },
          () => {
            seen.push("client[1]");
            throw new Error("replacement");
          },
        ],
      },
      resources: {
        users: {
          path: "/users",
          middleware: {
            onError: [
              (error) => {
                seen.push(`resource:${(error as Error).message}`);
              },
            ],
          },
          operations: {
            getAll: {
              middleware: {
                onError: [
                  (error) => {
                    seen.push(`operation:${(error as Error).message}`);
                    return [{ id: 42 }];
                  },
                ],
              },
            },
          },
        },
      },
    });
    await expect(api.users.getAll()).resolves.toEqual([{ id: 42 }]);
    expect(seen).toEqual([
      "client[0]",
      "client[1]",
      "resource:replacement",
      "operation:replacement",
    ]);
  });

  it("uses middleware query mutations for transport, mocks, and response metadata", async () => {
    const urls: string[] = [];
    const middleware = {
      onRequest: [
        (request: ApiRequest) => {
          request.query = { ...request.query, name: "Zed" };
        },
      ],
    };
    const data = [
      { id: 1, name: "Ada", active: true },
      { id: 2, name: "Zed", active: true },
    ];
    const api = defineApi({
      baseURL: "https://x.dev",
      middleware,
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return {
          body: data.filter((user) => user.name === new URL(request.url).searchParams.get("name")),
        };
      }),
      resources: {
        live: { path: "/users" },
        mock: { path: "/users", mock: data },
      },
    });

    const live = await api.live.getAll({ query: { active: true }, full: true });
    const mock = await api.mock.getAll({ query: { active: true }, full: true });
    expect(urls).toEqual(["https://x.dev/users?active=true&name=Zed"]);
    expect(live.request.url).toBe(urls[0]);
    expect(mock.request.url).toBe(urls[0]);
    expect(live.request.query).toEqual({ active: true, name: "Zed" });
    expect(mock.request.query).toEqual(live.request.query);
    expect(live.data).toEqual([{ id: 2, name: "Zed", active: true }]);
    expect(mock.data).toEqual(live.data);
  });

  it("preserves a middleware URL path rewrite while applying the effective query", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((request) => ({ body: [request.url] })),
      middleware: {
        onRequest: [
          (request) => {
            request.url = request.url.replace("/users", "/v2/users");
            request.query = { ...request.query, name: "Zed" };
          },
        ],
      },
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll({ query: { active: true } })).resolves.toEqual([
      "https://x.dev/v2/users?active=true&name=Zed",
    ]);
  });

  it("merges a URL rewrite's query with request.query, with request.query taking precedence", async () => {
    let serializeCount = 0;
    const api = defineApi({
      baseURL: "https://x.dev",
      querySerializer: (query) => {
        serializeCount++;
        return new URLSearchParams(query as Record<string, string>).toString();
      },
      transport: createFakeTransport((request) => ({ body: [request.url] })),
      middleware: {
        onRequest: [
          (request) => {
            request.url = "https://x.dev/v2/users?fromUrl=yes&name=old";
            request.query = { name: "Zed" };
          },
        ],
      },
      resources: { users: { path: "/users" } },
    });
    const response = await api.users.getAll({ full: true });
    expect(response.request.query).toEqual({ fromUrl: "yes", name: "Zed" });
    expect(response.request.url).toBe("https://x.dev/v2/users?fromUrl=yes&name=Zed");
    expect(response.data).toEqual([response.request.url]);
    expect(serializeCount).toBe(1);
  });

  it("runs request, response, and error stages root → resource → operation, sync and async", async () => {
    const log: string[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body: [] })),
      middleware: {
        onRequest: [
          async (r) => (log.push("req:root"), r),
          (r) => (log.push("req:root[0]"), r),
          async () => {
            log.push("req:root[1]"); // returning nothing keeps the request
          },
        ],
        onResponse: [() => void log.push("res:root"), (r) => (log.push("res:root[0]"), r)],
      },
      resources: {
        users: {
          path: "/users",
          middleware: {
            onRequest: [async (r) => (log.push("req:resource"), r)],
            onResponse: [() => void log.push("res:resource")],
          },
          operations: {
            getAll: {
              middleware: {
                onRequest: [async (r) => (log.push("req:op"), r)],
                onResponse: [() => void log.push("res:op"), () => void log.push("res:op[0]")],
              },
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
      middleware: {
        onRequest: [
          (r) => {
            r.headers.set("X-App", "apixa");
            return { ...r, body: { ...(r.body as object), added: true } };
          },
        ],
        onResponse: [(res) => ({ ...res, data: { wrapped: res.data, status: res.status } })],
      },
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
      middleware: { onError: [(e) => (seen.push(e), undefined)] },
      resources: { users: { path: "/users" } },
    });
    await expect(rethrow.users.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(seen[0]).toBeInstanceOf(HttpError);

    const recover = defineApi({
      baseURL: "https://x.dev",
      transport: failing,
      resources: { users: { path: "/users", middleware: { onError: [() => [{ id: "cached" }]] } } },
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
        onError: [
          () => {
            throw new Friendly("try later");
          },
        ],
      },
      resources: { users: { path: "/users", middleware: { onError: [(e) => void seen.push(e)] } } },
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
        middleware: { onError: [onError] },
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
      middleware: {
        onRequest: [(r) => (req++, r)],
        onResponse: [(r) => (res++, r)],
      },
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
      middleware: { onResponse: [(r) => void (seen = r.data)] },
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
        onRequest: [(r) => void log.push(`req ${r.mocked}`)],
        onResponse: [(r) => void log.push(`res ${r.status}`)],
        onError: [(e) => void log.push(`err ${(e as { code: string }).code}`)],
      },
      resources: { users: { path: "/users", mock: [{ id: 1 }] } },
    });
    await api.users.create({});
    await api.users.getById(9).catch(() => undefined);
    expect(log).toEqual(["req true", "res 201", "req true", "err MOCK_NOT_FOUND"]);
  });

  it("rejects malformed middleware results and shapes at client, resource, and operation levels", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body: [] })),
      middleware: { onResponse: [() => "nope" as never] },
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getAll()).rejects.toBeInstanceOf(ConfigError);

    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        middleware: [] as never,
        resources: {},
      }),
    ).toThrow(/middleware must be an object/);

    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        resources: { users: { path: "/users", middleware: [] as never } },
      }),
    ).toThrow(/resources\.users\.middleware must be an object/);

    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: { path: "/users", operations: { getAll: { middleware: [] as never } } },
        },
      }),
    ).toThrow(/resources\.users\.operations\.getAll\.middleware must be an object/);

    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        middleware: { onRequest: (() => undefined) as never },
        resources: {},
      }),
    ).toThrow(/middleware\.onRequest must be an array of functions/);

    expect(() =>
      defineApi({
        baseURL: "https://x.dev",
        middleware: { onResponse: [1] as never },
        resources: {},
      }),
    ).toThrow(/middleware\.onResponse\[0\] must be a function/);

    expect(() =>
      defineApi({ baseURL: "https://x.dev", requestMiddleware: ["x"] as never, resources: {} }),
    ).toThrow(/unknown option "requestMiddleware"/);
  });

  it("types middleware arguments and rejects legacy array syntax and unknown hook keys", () => {
    defineApi({
      baseURL: "https://x.dev",
      middleware: {
        onError: [(e) => (expectTypeOf(e).toBeUnknown(), undefined)],
        onRequest: [(r) => (expectTypeOf(r).toEqualTypeOf<ApiRequest>(), r)],
      },
      resources: {},
    });

    if (false as boolean) {
      defineApi({
        baseURL: "https://x.dev",
        // @ts-expect-error legacy middleware array syntax is rejected
        middleware: [{ onRequest: (r: ApiRequest) => r }],
        resources: {},
      });

      defineApi({
        baseURL: "https://x.dev",
        // @ts-expect-error empty middleware array is rejected
        middleware: [],
        resources: {},
      });

      defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            // @ts-expect-error resource middleware must be an object of hook arrays
            middleware: [],
            operations: {
              getAll: {
                // @ts-expect-error operation middleware rejects unknown hook keys
                middleware: { onRequset: [] },
              },
            },
          },
        },
      });
    }

    expect(TimeoutError).toBeDefined();
  });
});
