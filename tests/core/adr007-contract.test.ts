import {
  defineApi,
  emptyResponse,
  ResponseShapeError,
  ConfigError,
  SchemaValidationError,
  TimeoutError,
  AbortError,
} from "@apixa/core";
import type { TransportRequest, StandardSchemaV1 } from "@apixa/core";
import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { createFakeTransport } from "../helpers/fake-transport.js";

const baseURL = "https://api.example.com";
const records = [
  { id: 1, price: "100", name: "b" },
  { id: "2", price: 20, name: "a" },
  { id: 3, price: "5", name: "a" },
];
afterEach(() => vi.useRealTimers());

describe("ADR-007 count", () => {
  it.each([
    125,
    "125",
    { count: "125" },
    { total: 125 },
    { data: 125 },
    { records: 125 },
    { quantity: 125 },
    { numberOfUsers: 125 },
    { statistics: { count: "125" } },
  ])("normalizes %j", async (body) => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body })),
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.count()).toBe(125);
  });
  it.each([
    -1,
    1.1,
    NaN,
    Infinity,
    null,
    "",
    "  ",
    "1e2",
    "0x10",
    "-1",
    true,
    Number.MAX_SAFE_INTEGER + 1,
    { activeUsers: 1 },
    { nested: { count: 1 } },
    [],
    { count: null, total: 1 },
    Object.create({ count: 1 }),
  ])("rejects %j", async (body) => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body })),
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.count()).rejects.toBeInstanceOf(ResponseShapeError);
  });
  it("unwraps, transforms, parses, normalizes, runs middleware, then validates exactly once", async () => {
    const order: string[] = [];
    const schema: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (v) => {
          order.push("schema");
          return z.number().min(10)["~standard"].validate(v);
        },
      },
    };
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body: { data: { number_of_users: "12" } } })),
      resources: {
        users: {
          path: "/users",
          operations: {
            count: {
              response: {
                unwrap: "data",
                parse: (v) => {
                  order.push("parse");
                  return v;
                },
              },
              transforms: { response: { keys: "camelCase" } },
              schema: { response: schema },
              middleware: {
                onResponse: [
                  (r) => {
                    order.push("middleware");
                    expect(r.data).toBe(12);
                    r.data = 13;
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(await api.users.count()).toBe(13);
    expect(order).toEqual(["parse", "middleware", "schema"]);
  });
  it("does not ignore an absent explicit unwrap", async () => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body: { total: 5 } })),
      resources: {
        users: { path: "/users", operations: { count: { response: { unwrap: "data" } } } },
      },
    });
    await expect(api.users.count()).rejects.toBeInstanceOf(ResponseShapeError);
  });
});

describe("ADR-007 batch contract", () => {
  function batch(body: unknown = records) {
    const calls: TransportRequest[] = [];
    const api = defineApi({
      baseURL,
      transport: createFakeTransport((r) => {
        calls.push(r);
        return { body };
      }),
      resources: { products: { path: "/products" } },
    });
    return { api, calls };
  }
  it("skips empty input truthfully, deduplicates before dispatch, and restores requested order", async () => {
    const { api, calls } = batch();
    expect(await api.products.getMany([])).toEqual([]);
    expect(await api.products.getMany([], { full: true })).toEqual({
      data: [],
      skipped: true,
      reason: "empty-ids",
      status: null,
      headers: null,
    });
    expect(calls).toHaveLength(0);
    expect(await api.products.getMany([3, "1", 3, 2])).toEqual([
      records[2],
      records[0],
      records[1],
    ]);
    expect(new URL(calls[0]!.url).searchParams.getAll("id")).toEqual(["3", "1", "2"]);
    expect(await api.products.getMany([1, 2, 3], { full: true })).toMatchObject({
      skipped: false,
      status: 200,
    });
  });
  it.each([
    [[{ id: 1 }], [1, 2], { missingIds: [2] }],
    [[{ id: 1 }, { id: 2 }], [1], { extraIds: [2] }],
    [[{ id: 1 }, { id: "1" }], [1], { duplicateIds: ["1"] }],
    [[{ id: 1 }], ["001"], { missingIds: ["001"], extraIds: [1] }],
  ])("reports identity discrepancies", async (body, ids, details) => {
    await expect(
      batch(body).api.products.getMany(ids as Array<string | number>),
    ).rejects.toMatchObject({ code: "RESPONSE_SHAPE", ...details });
  });
  it.each([[{}], [{ id: null }], [{ id: Infinity }]])(
    "rejects unusable returned identities",
    async (body) => {
      await expect(batch(body).api.products.getMany([1])).rejects.toBeInstanceOf(
        ResponseShapeError,
      );
    },
  );
  it("sorts numerically only when requested and preserves original values and stable ties", async () => {
    const { api } = batch();
    expect(
      await api.products.getMany([1, 2, 3], { sortBy: { field: "price", type: "number" } }),
    ).toEqual([records[2], records[1], records[0]]);
    expect(await api.products.getMany([3, 2, 1], { sortBy: "name" })).toEqual([
      records[2],
      records[1],
      records[0],
    ]);
    const codes = batch([
      { id: 1, sku: "100" },
      { id: 2, sku: "20" },
      { id: 3, sku: "5" },
    ]);
    expect(await codes.api.products.getMany([3, 2, 1], { sortBy: "sku" })).toEqual([
      { id: 1, sku: "100" },
      { id: 2, sku: "20" },
      { id: 3, sku: "5" },
    ]);
  });
  it.each([undefined, null, "unknown", Infinity, Number.MAX_SAFE_INTEGER + 1, ""])(
    "rejects invalid numeric sort values",
    async (price) => {
      await expect(
        batch([{ id: 1, price }]).api.products.getMany([1], {
          sortBy: { field: "price", type: "number" },
        }),
      ).rejects.toBeInstanceOf(ResponseShapeError);
    },
  );
  it("checks identity after response schemas and middleware, in mock and live modes", async () => {
    for (const mock of [false, true]) {
      const api = defineApi({
        baseURL,
        transport: createFakeTransport(() => ({ body: records })),
        resources: {
          products: {
            path: "/products",
            ...(mock ? { mock: records } : {}),
            operations: {
              getMany: {
                schema: { response: z.array(z.object({ id: z.union([z.string(), z.number()]) })) },
                middleware: {
                  onResponse: [
                    (r) => {
                      r.data = [{ id: 1 }];
                    },
                  ],
                },
              },
            },
          },
        },
      });
      await expect(api.products.getMany([1, 2, 3])).rejects.toMatchObject({ missingIds: [2, 3] });
    }
  });
});

describe("ADR-007 response guarantees", () => {
  it("validates final middleware replacements in mock and live modes", async () => {
    for (const mock of [false, true]) {
      const api = defineApi({
        baseURL,
        transport: createFakeTransport(() => ({ body: { id: 1 } })),
        resources: {
          users: {
            path: "/users",
            ...(mock ? { mock: [{ id: 1 }] } : {}),
            operations: {
              getById: {
                schema: { response: z.object({ id: z.number() }) },
                middleware: {
                  onResponse: [
                    (r) => {
                      r.data = { id: "invalid" };
                    },
                  ],
                },
              },
            },
          },
        },
      });
      await expect(api.users.getById(1)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        phase: "response",
      });
    }
  });
  it("requires an explicit empty contract for an entity result and keeps delete void", async () => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ status: 204 })),
      resources: {
        users: { path: "/users", operations: { update: { schema: { response: emptyResponse } } } },
      },
    });
    await expect(api.users.getById(1)).rejects.toBeInstanceOf(ResponseShapeError);
    expect(await api.users.update(1, {})).toBeUndefined();
    expect(await api.users.delete(1)).toBeUndefined();
  });
  it("rejects a body under emptyResponse", async () => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body: { id: 1 } })),
      resources: {
        users: { path: "/users", operations: { update: { schema: { response: emptyResponse } } } },
      },
    });
    await expect(api.users.update(1, {})).rejects.toMatchObject({ phase: "response" });
  });
  it("supports non-JSON schemas and arbitrary custom values", async () => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({ body: "hello" })),
      resources: {
        users: {
          path: "/users",
          operations: {
            text: {
              method: "GET",
              responseType: "text",
              schema: { response: z.string().transform((s) => s.length) },
            },
          },
        },
      },
    });
    expect(await api.users.text()).toBe(5);
  });
});

describe("ADR-007 attempts and deadlines", () => {
  it("runs logical hooks once and attempt hooks on each actual response", async () => {
    const events: string[] = [];
    let attempt = 0;
    const api = defineApi({
      baseURL,
      retry: { count: 2, delay: 0, jitter: false },
      transport: createFakeTransport((r) => {
        expect(r.headers.get("x-attempt")).toBe(String(attempt));
        return { status: attempt++ < 2 ? 503 : 200, body: [] };
      }),
      middleware: {
        onRequest: [
          () => {
            events.push("request");
          },
        ],
        onAttempt: [
          ({ request, attempt }) => {
            events.push(`attempt${attempt}`);
            request.headers.set("x-attempt", String(attempt));
          },
        ],
        onAttemptResponse: [
          ({ attempt }) => {
            events.push(`received${attempt}`);
          },
        ],
        onResponse: [
          () => {
            events.push("response");
          },
        ],
        onError: [
          () => {
            events.push("error");
          },
        ],
      },
      resources: { users: { path: "/users" } },
    });
    expect(await api.users.getAll()).toEqual([]);
    expect(events).toEqual([
      "request",
      "attempt0",
      "received0",
      "attempt1",
      "received1",
      "attempt2",
      "received2",
      "response",
    ]);
  });
  it("bounds per-attempt timeouts and total backoff using the same logical deadline", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const api = defineApi({
      baseURL,
      timeout: { total: 100, perAttempt: 10 },
      retry: { count: 2, delay: 0, jitter: false },
      transport: createFakeTransport(() => {
        calls++;
        return calls === 1 ? new Promise(() => {}) : { body: [] };
      }),
      resources: { users: { path: "/users" } },
    });
    const result = api.users.getAll();
    await vi.advanceTimersByTimeAsync(11);
    expect(await result).toEqual([]);
    expect(calls).toBe(2);
    const slow = defineApi({
      baseURL,
      timeout: 20,
      retry: { count: 2, delay: 50, jitter: false },
      transport: createFakeTransport(() => ({ status: 503 })),
      resources: { users: { path: "/users" } },
    });
    const rejected = expect(slow.users.getAll()).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
  });
  it("bounds stalled middleware and preserves user abort classification", async () => {
    vi.useFakeTimers();
    const api = defineApi({
      baseURL,
      timeout: 10,
      middleware: { onRequest: [() => new Promise(() => {})] },
      resources: { users: { path: "/users" } },
    });
    const rejected = expect(api.users.getAll()).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(11);
    await rejected;
    const controller = new AbortController();
    const aborted = expect(api.users.getAll({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    controller.abort();
    await aborted;
  });
  it("bounds refresh to one and refuses unsafe POST refresh", async () => {
    for (const method of ["GET", "POST"] as const) {
      let calls = 0;
      const api = defineApi({
        baseURL,
        transport: createFakeTransport(() => {
          calls++;
          return { status: 401 };
        }),
        middleware: { onAttemptResponse: [({ retry }) => retry()] },
        resources: { users: { path: "/users", operations: { action: { method } } } },
      });
      await expect(api.users.action({})).rejects.toMatchObject({ status: 401 });
      expect(calls).toBe(method === "GET" ? 2 : 1);
    }
  });
  it("rechecks in-place body changes and attempt policy mutations", async () => {
    let calls = 0;
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => {
        calls++;
        return { body: {} };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            create: {
              schema: { body: z.object({ name: z.string() }) },
              middleware: {
                onRequest: [
                  (r) => {
                    (r.body as { name: unknown }).name = null;
                  },
                ],
              },
            },
          },
        },
      },
    });
    await expect(api.users.create({ name: "Ada" })).rejects.toBeInstanceOf(SchemaValidationError);
    expect(calls).toBe(0);
    const attempt = defineApi({
      baseURL,
      transport: createFakeTransport(() => {
        calls++;
        return { body: [] };
      }),
      middleware: {
        onAttempt: [
          ({ request }) => {
            request.url = "https://evil.example";
          },
        ],
      },
      resources: { users: { path: "/users" } },
    });
    await expect(attempt.users.getAll()).rejects.toBeInstanceOf(ConfigError);
    expect(calls).toBe(0);
  });
  it("rejects call-level decoding and policy overrides and size increases", async () => {
    const api = defineApi({
      baseURL,
      resources: { users: { path: "/users", operations: { getAll: { maxResponseSize: 5 } } } },
    });
    for (const options of [
      { responseType: "text" },
      { redirectOrigins: ["https://evil.example"] },
      { maxResponseSize: 6 },
    ]) {
      await expect(api.users.getAll(options as never)).rejects.toBeInstanceOf(ConfigError);
    }
  });
});

describe("ADR-007 post-audit remediation regressions", () => {
  it("preserves custom pagination wire mappings when schema.query and transforms.request are active", async () => {
    const urls: string[] = [];
    const api = defineApi<{ users: { id: number; fullName: string } }>()({
      baseURL,
      transforms: {
        request: { keys: "snake_case" },
        response: { keys: "camelCase" },
      },
      transport: createFakeTransport((r) => {
        urls.push(r.url);
        return {
          body: {
            data: [{ id: 1, full_name: "Ada Lovelace" }],
            total: 1,
            page: 0,
            pageSize: 5,
          },
        };
      }),
      resources: {
        users: {
          path: "/users",
          paginationConfig: {
            strategy: "page",
            params: { pageSize: "per_page" },
            pageBase: 0,
          },
          operations: {
            getAll: {
              schema: {
                query: z.object({
                  activeOnly: z.coerce.boolean().default(true),
                  roleFilter: z.string().transform((v) => v.toUpperCase()),
                }),
              },
            },
          },
        },
      },
    });

    const page = await api.users.getAll({
      query: { roleFilter: "admin" },
      pagination: { page: 1, pageSize: 5 },
    });
    expect(page.data).toEqual([{ id: 1, fullName: "Ada Lovelace" }]);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(5);
    const parsedUrl = new URL(urls[0]!);
    expect(parsedUrl.searchParams.get("per_page")).toBe("5");
    expect(parsedUrl.searchParams.get("page")).toBe("0");
    expect(parsedUrl.searchParams.get("active_only")).toBe("true");
    expect(parsedUrl.searchParams.get("role_filter")).toBe("ADMIN");
  });

  it("rejects caller query collision with mapped pagination wire key even when schema.query is present", async () => {
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => ({
        body: { data: [], total: 0, page: 1, pageSize: 10 },
      })),
      resources: {
        users: {
          path: "/users",
          paginationConfig: {
            strategy: "page",
            params: { pageSize: "per_page" },
          },
          operations: {
            getAll: {
              schema: {
                query: z.object({ tag: z.string().optional() }),
              },
            },
          },
        },
      },
    });

    await expect(
      api.users.getAll({
        query: { tag: "a", per_page: 99 } as never,
        pagination: { pageSize: 10 },
      }),
    ).rejects.toThrow(/pagination/i);
  });

  it("revalidates onRequest mutations to request.query and request.url without stripping custom pagination wire params", async () => {
    const urls: string[] = [];
    const api = defineApi({
      baseURL,
      transforms: { request: { keys: "snake_case" } },
      transport: createFakeTransport((r) => {
        urls.push(r.url);
        return {
          body: { data: [{ id: 1 }], total: 1, page: 0, pageSize: 10 },
        };
      }),
      resources: {
        users: {
          path: "/users",
          paginationConfig: {
            strategy: "page",
            params: { pageSize: "per_page" },
            pageBase: 0,
          },
          operations: {
            getAll: {
              schema: {
                query: z.object({
                  orgId: z.string().min(2),
                  traceId: z.string().optional(),
                }),
              },
              middleware: {
                onRequest: [
                  (req) => {
                    req.query = { ...req.query, traceId: "tr-1" };
                  },
                ],
              },
            },
          },
        },
      },
    });

    await api.users.getAll({
      query: { orgId: "acme" },
      pagination: { page: 2, pageSize: 10 },
    });
    const sent = new URL(urls[0]!);
    expect(sent.searchParams.get("per_page")).toBe("10");
    expect(sent.searchParams.get("page")).toBe("1");
    expect(sent.searchParams.get("org_id")).toBe("acme");
    expect(sent.searchParams.get("trace_id")).toBe("tr-1");
  });

  it("prevents onRequest mutations to request.url from bypassing schema.query validation", async () => {
    let calls = 0;
    const api = defineApi({
      baseURL,
      transport: createFakeTransport(() => {
        calls++;
        return { body: [] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: {
              schema: {
                query: z.object({
                  limit: z.number().int().positive().optional(),
                  extra: z.number().int().positive().optional(),
                }),
              },
              middleware: {
                onRequest: [
                  (req) => {
                    req.url = `${req.url}?extra=not-a-number`;
                  },
                ],
              },
            },
          },
        },
      },
    });

    await expect(api.users.getAll({ query: { limit: 5 } })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(calls).toBe(0);
  });

  it("allows page subsets on paginated getMany while still rejecting extra, duplicate, and invalid IDs", async () => {
    let nextBody: unknown = {
      data: [
        { id: 3, name: "Three" },
        { id: 1, name: "One" },
      ],
      total: 4,
      page: 1,
      pageSize: 2,
    };
    const api = defineApi<{ users: { id: number; name: string } }>()({
      baseURL,
      transport: createFakeTransport(() => ({ body: nextBody })),
      resources: {
        users: {
          path: "/users",
          operations: {
            getMany: {
              pagination: "page",
            },
          },
        },
      },
    });

    // Subset page (2 of 4 requested IDs) succeeds and reorders to match requested ID order (1 before 3)
    const page1 = await api.users.getMany([1, 2, 3, 4], {
      pagination: { page: 1, pageSize: 2 },
    });
    expect(page1.data).toEqual([
      { id: 1, name: "One" },
      { id: 3, name: "Three" },
    ]);
    expect(page1.total).toBe(4);

    // Local sortBy works on paginated getMany
    const sorted = await api.users.getMany([1, 2, 3, 4], {
      pagination: { page: 1, pageSize: 2 },
      sortBy: { field: "name", order: "desc" },
    });
    expect(sorted.data.map((u) => u.name)).toEqual(["Three", "One"]);

    // Extra ID on a paginated getMany page is still rejected with ResponseShapeError
    nextBody = {
      data: [
        { id: 1, name: "One" },
        { id: 999, name: "Unexpected" },
      ],
      total: 4,
      page: 1,
      pageSize: 2,
    };
    await expect(
      api.users.getMany([1, 2, 3, 4], { pagination: { page: 1, pageSize: 2 } }),
    ).rejects.toMatchObject({
      code: "RESPONSE_SHAPE",
      extraIds: [999],
    });

    // Duplicate ID on a paginated getMany page is still rejected with ResponseShapeError
    nextBody = {
      data: [
        { id: 1, name: "One" },
        { id: "1", name: "One duplicate" },
      ],
      total: 4,
      page: 1,
      pageSize: 2,
    };
    await expect(
      api.users.getMany([1, 2, 3, 4], { pagination: { page: 1, pageSize: 2 } }),
    ).rejects.toMatchObject({
      code: "RESPONSE_SHAPE",
      duplicateIds: ["1"],
    });
  });

  it("supports operation-level transforms.response: false at runtime and in TypeScript inference", async () => {
    type RawItem = { id: number; snake_field: string };
    const api = defineApi<{ items: RawItem }>()({
      baseURL,
      transforms: {
        response: { keys: "camelCase" },
      },
      transport: createFakeTransport(() => ({
        body: { id: 1, snake_field: "kept" },
      })),
      resources: {
        items: {
          path: "/items",
          operations: {
            getById: true,
            patch: {
              transforms: { response: false },
            },
          },
        },
      },
    });

    const transformed = await api.items.getById(1);
    expect(transformed).toEqual({ id: 1, snakeField: "kept" });
    const checkTransformed: { id: number; snakeField: string } = transformed;
    expect(checkTransformed.snakeField).toBe("kept");

    const raw = await api.items.patch(1, {});
    expect(raw).toEqual({ id: 1, snake_field: "kept" });
    const checkRaw: { id: number; snake_field: string } = raw;
    expect(checkRaw.snake_field).toBe("kept");
    if (false as boolean) {
      // @ts-expect-error snake_field was NOT camelCased when transforms.response is false
      const _bad: string = raw.snakeField;
      void _bad;
    }
  });

  it("enforces timeout and retry configuration contracts at runtime and compile time", async () => {
    // Runtime rejection of invalid timeout configurations (empty object, negative, non-finite, unknown keys)
    expect(() =>
      defineApi({
        baseURL,
        timeout: {} as never,
        resources: { users: { path: "/users" } },
      }),
    ).toThrow(ConfigError);

    expect(() =>
      defineApi({
        baseURL,
        timeout: { perAttempt: -5 },
        resources: { users: { path: "/users" } },
      }),
    ).toThrow(ConfigError);

    // Runtime rejection of invalid retry configurations (negative count, invalid backoff, legacy keys)
    expect(() =>
      defineApi({
        baseURL,
        retry: { count: -1 },
        resources: { users: { path: "/users" } },
      }),
    ).toThrow(ConfigError);

    expect(() =>
      defineApi({
        baseURL,
        retry: { retries: 2 } as never,
        resources: { users: { path: "/users" } },
      }),
    ).toThrow(/renamed to `count`/);

    const api = defineApi<{ users: { id: number } }>()({
      baseURL,
      timeout: { total: 500, perAttempt: 100 },
      retry: { count: 2, backoff: "linear", delay: 10, maxDelay: 50, jitter: "full" },
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: {
              retry: false,
            },
          },
        },
      },
    });

    await expect(api.users.getAll({ timeout: { perAttempt: -1 } })).rejects.toBeInstanceOf(
      ConfigError,
    );

    if (false as boolean) {
      defineApi({
        baseURL,
        // @ts-expect-error invalid backoff strategy
        retry: { count: 1, backoff: "quadratic" },
        resources: {},
      });
      defineApi({
        baseURL,
        // @ts-expect-error invalid jitter strategy
        retry: { count: 1, jitter: "random" },
        resources: {},
      });
    }
  });
});
