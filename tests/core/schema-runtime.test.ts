import {
  ConfigError,
  defineApi,
  HttpError,
  SchemaValidationError,
  ValidationError,
} from "@apixa/core";
import type { StandardSchemaV1, TransportRequest } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFakeTransport } from "../helpers/fake-transport.js";
import type { FakeResult } from "../helpers/fake-transport.js";

const Product = z.object({ id: z.number(), name: z.string() });

function recorder(handler: (request: TransportRequest) => FakeResult = () => ({ body: {} })) {
  const requests: TransportRequest[] = [];
  const transport = createFakeTransport((request) => {
    requests.push(request);
    return handler(request);
  });
  return { requests, transport };
}

const bodyOf = (request: TransportRequest | undefined) => JSON.parse(String(request?.body));

function counting<T>(inner: StandardSchemaV1<unknown, T>) {
  const stats = { calls: 0 };
  const schema: StandardSchemaV1<unknown, T> = {
    "~standard": {
      ...inner["~standard"],
      validate: (value, options) => {
        stats.calls++;
        return inner["~standard"].validate(value, options);
      },
    },
  };
  return { schema, stats };
}

describe("schema.body", () => {
  const Create = z.object({ name: z.string().min(2), price: z.coerce.number() });

  function setup(extra: Record<string, unknown> = {}) {
    const rec = recorder(() => ({ body: { id: 1, name: "Pen" } }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            create: { schema: { body: Create, response: Product }, ...extra },
          },
        },
      },
    });
    return { api, ...rec };
  }

  it("sends the parsed (transformed) body, not the caller's input", async () => {
    const { api, requests } = setup();
    await api.products.create({ name: "Pen", price: "12" as never });
    expect(bodyOf(requests[0])).toEqual({ name: "Pen", price: 12 });
  });

  it("rejects an invalid body with zero transport dispatches", async () => {
    const { api, requests } = setup();
    const error = await api.products.create({ name: "x", price: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ phase: "body", operation: "create" });
    expect(requests).toHaveLength(0);
  });

  it("validates `undefined` when the caller omits a required body (no silent `{}`)", async () => {
    const { api, requests } = setup();
    const error = await (api.products.create as (...a: unknown[]) => Promise<unknown>)().catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect((error as SchemaValidationError).issues.length).toBeGreaterThan(0);
    expect(requests).toHaveLength(0);
  });

  it("lets the schema accept a missing body", async () => {
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: { body: z.object({ n: z.number() }).optional() },
            },
          },
        },
      },
    });
    await expect(api.jobs.run()).resolves.toEqual({});
    expect(rec.requests).toHaveLength(1);
  });

  it("applies schema defaults", async () => {
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: { body: z.object({ mode: z.string().default("fast") }) },
            },
          },
        },
      },
    });
    await api.jobs.run({});
    expect(bodyOf(rec.requests[0])).toEqual({ mode: "fast" });
  });

  it("supports asynchronous body validators", async () => {
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: {
                body: z.object({ code: z.string().refine(async (c) => c === "ok", "bad code") }),
              },
            },
          },
        },
      },
    });
    await api.jobs.run({ code: "ok" });
    expect(rec.requests).toHaveLength(1);
    await expect(api.jobs.run({ code: "no" })).rejects.toBeInstanceOf(SchemaValidationError);
    expect(rec.requests).toHaveLength(1);
  });

  it("feeds request middleware and key transforms the parsed value", async () => {
    const seen: unknown[] = [];
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      transforms: { request: { keys: "snake_case" } },
      middleware: {
        onRequest: [
          (request) => {
            seen.push(request.body);
            return undefined;
          },
        ],
      },
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: { body: z.object({ itemCount: z.coerce.number() }) },
            },
          },
        },
      },
    });
    await api.jobs.run({ itemCount: "3" as never });
    expect(seen).toEqual([{ itemCount: 3 }]);
    expect(bodyOf(rec.requests[0])).toEqual({ item_count: 3 });
  });

  it("validates once per logical call, not once per retry attempt", async () => {
    const { schema, stats } = counting(Create);
    let attempts = 0;
    const rec = recorder(() => (++attempts < 3 ? { status: 503, body: {} } : { body: {} }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              retry: { count: 3, methods: ["POST"], delay: 1, jitter: false },
              schema: { body: schema },
            },
          },
        },
      },
    });
    await api.jobs.run({ name: "Pen", price: 1 });
    expect(rec.requests).toHaveLength(3);
    expect(stats.calls).toBe(1);
  });

  it("does not retry validation errors and sends them through error middleware", async () => {
    const onError = vi.fn();
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      middleware: { onError: [onError] },
      resources: {
        jobs: {
          path: "/jobs",
          retry: 3,
          operations: {
            run: {
              method: "POST",
              path: "/run",
              retry: { count: 3, methods: ["POST"] },
              schema: { body: Create },
            },
          },
        },
      },
    });
    await expect(api.jobs.run({ name: "", price: 1 })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(SchemaValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it("does not re-run a transforming schema on an error-middleware replay", async () => {
    // "12" -> 12 only parses once: the replayed call must reuse the parsed value.
    const toNumber = z.object({ n: z.string().transform(Number) });
    const { schema, stats } = counting(toNumber);
    let first = true;
    const rec = recorder(() => {
      if (first) {
        first = false;
        return { status: 500, body: {} };
      }
      return { body: { ok: true } };
    });
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      middleware: {
        onError: [(error, { replay }) => (error instanceof HttpError ? replay?.() : undefined)],
      },
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: { method: "POST", path: "/run", idempotency: true, schema: { body: schema } },
          },
        },
      },
    });
    await expect(api.jobs.run({ n: "12" } as never)).resolves.toEqual({ ok: true });
    expect(stats.calls).toBe(1);
    expect(bodyOf(rec.requests[1])).toEqual({ n: 12 });
  });

  it("never mutates a mocked store for an invalid body, and stores the parsed one", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        products: {
          path: "/products",
          mock: [{ id: 1, name: "Pen", price: 1 }],
          operations: { preset: "all", create: { schema: { body: Create } } },
        },
      },
    });
    await expect(api.products.create({ name: "x", price: 1 } as never)).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(await api.products.getAll()).toHaveLength(1);
    const created = await api.products.create({ name: "Ink", price: "5" } as never);
    expect(created).toMatchObject({ name: "Ink", price: 5 });
    expect(await api.products.getAll()).toHaveLength(2);
  });

  it("applies to built-in update bodies passed through positional arguments", async () => {
    const rec = recorder();
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            update: { schema: { body: z.object({ name: z.string() }) } },
          },
        },
      },
    });
    await expect(api.products.update(1, { name: 5 } as never)).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(rec.requests).toHaveLength(0);
    await api.products.update(1, { name: "ok" });
    expect(bodyOf(rec.requests[0])).toEqual({ name: "ok" });
  });
});

describe("schema.query", () => {
  const Filters = z.object({
    category: z.string().optional(),
    inStock: z.coerce.boolean().default(false),
    tags: z.array(z.string()).optional(),
    range: z.object({ min: z.coerce.number() }).optional(),
  });

  function setup(extra: Record<string, unknown> = {}, root: Record<string, unknown> = {}) {
    const rec = recorder(() => ({ body: [] }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      ...root,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            getAll: { schema: { query: Filters }, ...extra },
          },
        },
      },
    });
    return { api, ...rec };
  }

  it("serializes the parsed query (defaults, transforms, arrays, nested objects)", async () => {
    const { api, requests } = setup();
    await api.products.getAll({
      query: { category: "pens", tags: ["a", "b"], range: { min: "3" as never } },
    });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("category")).toBe("pens");
    expect(url.searchParams.getAll("tags")).toEqual(["a", "b"]);
    expect(url.searchParams.get("inStock")).toBe("false");
  });

  it("validates a missing query as `undefined`: the schema decides (no silent `{}`)", async () => {
    const strict = setup();
    const error = await strict.api.products.getAll().catch((e: unknown) => e);
    expect(error).toMatchObject({ phase: "query" });
    expect(strict.requests).toHaveLength(0);
    // A schema that treats a missing query as "no filters" still gets its defaults applied.
    const lenient = setup({
      schema: { query: z.preprocess((value) => value ?? {}, Filters) },
    });
    await lenient.api.products.getAll();
    expect(new URL(lenient.requests[0]!.url).searchParams.get("inStock")).toBe("false");
    // An optional schema accepts a missing query and sends nothing.
    const optional = setup({ schema: { query: Filters.optional() } });
    await optional.api.products.getAll();
    expect(new URL(optional.requests[0]!.url).search).toBe("");
  });

  it("rejects an invalid query before any dispatch", async () => {
    const { api, requests } = setup();
    const error = await api.products
      .getAll({ query: { tags: "nope" as never } })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ phase: "query" });
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(requests).toHaveLength(0);
  });

  it("rejects an asynchronous query validator deterministically", async () => {
    const asyncSchema: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "t",
        validate: (value) => Promise.resolve({ value }),
      },
    };
    const { api, requests } = setup({ schema: { query: asyncSchema } });
    await expect(api.products.getAll({ query: {} })).rejects.toBeInstanceOf(ConfigError);
    expect(requests).toHaveLength(0);
  });

  it("respects existing serialization settings on the parsed output", async () => {
    const { api, requests } = setup({}, { query: { booleans: "number" } });
    await api.products.getAll({ query: { inStock: true } });
    expect(new URL(requests[0]!.url).searchParams.get("inStock")).toBe("1");
  });

  it("keeps pagination controls working beside a strict application schema", async () => {
    const rec = recorder(() => ({
      body: { data: [], total: 0, page: 2, pageSize: 5 },
    }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: {
            getAll: { schema: { query: z.object({ category: z.string() }).strict() } },
          },
        },
      },
    });
    await api.products.getAll({ query: { category: "pens", page: 2, pageSize: 5 } });
    const url = new URL(rec.requests[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: "pens",
      page: "2",
      pageSize: "5",
    });
  });

  it("validates only caller input for builtins that add their own query (getBy)", async () => {
    const rec = recorder(() => ({ body: [{ id: 1, name: "Pen" }] }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            getBy: { schema: { query: z.object({ lang: z.string() }).strict() } },
          },
        },
      },
    });
    await api.products.getBy("name", "Pen", { query: { lang: "en" } });
    const url = new URL(rec.requests[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ lang: "en", name: "Pen" });
  });

  it("does not call the mock handler for an invalid query", async () => {
    const handler = vi.fn(() => [] as unknown[]);
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        products: {
          path: "/products",
          mock: [{ id: 1, name: "Pen" }],
          operations: {
            search: {
              method: "GET",
              path: "/search",
              schema: { query: z.object({ q: z.string() }) },
              mock: handler,
            },
          },
        },
      },
    });
    await expect(api.products.search({ query: { q: 3 as never } })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(handler).not.toHaveBeenCalled();
    await api.products.search({ query: { q: "x" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("schema.response", () => {
  function make(
    body: unknown,
    schema: StandardSchemaV1 | undefined,
    config: Record<string, unknown> = {},
    root: Record<string, unknown> = {},
    status = 200,
  ) {
    const rec = recorder(() => ({ body, status }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      ...root,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            getById: { ...(schema ? { schema: { response: schema } } : {}), ...config },
          },
        },
      },
    });
    return { api, ...rec };
  }

  it("returns the parsed (transformed) response", async () => {
    const out = z.object({ id: z.number(), name: z.string().transform((s) => s.toUpperCase()) });
    const { api } = make({ id: 1, name: "pen" }, out);
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: "PEN" });
  });

  it("rejects an invalid response as a response-phase SchemaValidationError", async () => {
    const { api } = make({ id: "no", name: "pen" }, Product);
    const error = await api.products.getById(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toMatchObject({
      phase: "response",
      resource: "products",
      operation: "getById",
      status: 200,
    });
    expect((error as SchemaValidationError).data).toEqual({ id: "no", name: "pen" });
  });

  it("does not retry a failed response schema", async () => {
    const rec = recorder(() => ({ body: { id: "no" } }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          retry: 3,
          operations: { getById: { retry: 3, schema: { response: Product } } },
        },
      },
    });
    await expect(api.products.getById(1)).rejects.toBeInstanceOf(SchemaValidationError);
    expect(rec.requests).toHaveLength(1);
  });

  it("supports asynchronous response schemas", async () => {
    const schema = z.object({ id: z.number() }).refine(async (v) => v.id > 0, "bad id");
    const { api } = make({ id: 1 }, schema);
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1 });
    const failing = make({ id: 0 }, schema);
    await expect(failing.api.products.getById(1)).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("validates after unwrap and response key transforms", async () => {
    const { api } = make(
      { data: { product_id: 4, product_name: "Pen" } },
      z.object({ productId: z.number(), productName: z.string() }),
      {},
      { response: { unwrap: "data" }, transforms: { response: { keys: "camelCase" } } },
    );
    await expect(api.products.getById(1)).resolves.toEqual({ productId: 4, productName: "Pen" });
  });

  it("runs response.validate first (replacement included), then the schema", async () => {
    const { api } = make({ id: 1 }, z.object({ id: z.number(), extra: z.boolean() }), {
      response: { validate: (data: unknown) => ({ ...(data as object), extra: true }) },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, extra: true });
  });

  it("composes the declared and inherited parser with final schema validation", async () => {
    for (const root of [false, true]) {
      const response = { parse: () => ({ id: 1, name: "Pen" }) };
      const { api } = make({}, Product, root ? {} : { response }, root ? { response } : {});
      await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: "Pen" });
    }
  });

  it("allows it when the inherited parser is explicitly disabled with parse: false", async () => {
    const { api } = make(
      { id: 1, name: "Pen" },
      Product,
      { response: { parse: false } },
      { response: { parse: () => ({ replaced: true }) } },
    );
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: "Pen" });
  });

  it("keeps existing response.parse behavior without a schema", async () => {
    const { api } = make({ id: 1 }, undefined, {
      response: { parse: (d: unknown) => ({ ...(d as object), parsed: true }) },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, parsed: true });
  });

  it("validates an empty successful response as `undefined`", async () => {
    const rec = recorder(() => ({ status: 204 }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            stop: { method: "POST", path: "/stop", schema: { response: z.undefined() } },
            strict: { method: "POST", path: "/strict", schema: { response: z.object({}) } },
          },
        },
      },
    });
    await expect(api.jobs.stop()).resolves.toBeUndefined();
    await expect(api.jobs.strict()).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("validates decoded binary responses", async () => {
    const blob = new Blob(["abc"], { type: "text/plain" });
    const rec = recorder(() => ({ body: "abc", headers: { "content-type": "text/plain" } }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        request: async (input) => ({
          ...(await rec.transport.request(input)),
          body: blob,
        }),
      },
      resources: {
        files: {
          path: "/files",
          operations: {
            download: {
              method: "GET",
              path: "/d",
              responseType: "blob",
              schema: { response: z.instanceof(Blob) },
            },
            wrong: {
              method: "GET",
              path: "/w",
              responseType: "blob",
              schema: { response: z.instanceof(ArrayBuffer) },
            },
          },
        },
      },
    });
    await expect(api.files.download()).resolves.toBeInstanceOf(Blob);
    await expect(api.files.wrong()).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("validates the stream object without consuming it", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        request: async () => ({
          status: 200,
          headers: new Headers(),
          raw: new Response(null),
          body: stream,
        }),
      },
      resources: {
        files: {
          path: "/files",
          operations: {
            tail: {
              method: "GET",
              path: "/t",
              responseType: "stream",
              schema: { response: z.instanceof(ReadableStream) },
            },
          },
        },
      },
    });
    const result = await api.files.tail();
    expect(result).toBeInstanceOf(ReadableStream);
    expect(pulled).toBe(0);
    await (result as ReadableStream).cancel();
  });

  it("validates the normalized page envelope of a paginated operation, keeping metadata", async () => {
    const Page = z.object({
      data: z.array(Product),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    });
    const rec = recorder(() => ({
      body: { data: [{ id: 1, name: "Pen" }], total: 9, page: 1, pageSize: 1 },
    }));
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: { getAll: { schema: { response: Page } } },
        },
      },
    });
    await expect(api.products.getAll({ query: { page: 1, pageSize: 1 } })).resolves.toEqual({
      data: [{ id: 1, name: "Pen" }],
      total: 9,
      page: 1,
      pageSize: 1,
    });
    // A schema that drops the envelope metadata fails loudly through the pagination contract.
    const bare = defineApi({
      baseURL: "https://api.example.com",
      transport: rec.transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: { getAll: { schema: { response: z.object({ data: z.array(Product) }) } } },
        },
      },
    });
    await expect(bare.products.getAll({ query: { page: 1, pageSize: 1 } })).rejects.toBeInstanceOf(
      Error,
    );
  });

  it("validates mocked results through the same boundary", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        products: {
          path: "/products",
          mock: [{ id: 1, name: "Pen" }],
          operations: {
            preset: "all",
            getById: {
              schema: { response: z.object({ id: z.number(), label: z.string() }) },
            },
          },
        },
      },
    });
    await expect(api.products.getById(1)).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("is a response-phase error for HTTP errors? No: HTTP failures keep their HttpError", async () => {
    const { api } = make({ message: "gone" }, Product, {}, {}, 404);
    await expect(api.products.getById(1)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("custom transports", () => {
  it("receive already-prepared values", async () => {
    const seen: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        request: async (input) => {
          seen.push(input);
          return {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            raw: new Response("{}"),
            body: { id: 1, name: "Pen" },
          };
        },
      },
      resources: {
        products: {
          path: "/products",
          operations: {
            create: { schema: { body: z.object({ n: z.coerce.number() }), response: Product } },
          },
        },
      },
    });
    await api.products.create({ n: "7" } as never);
    expect(JSON.parse(String(seen[0]?.body))).toEqual({ n: 7 });
  });
});
