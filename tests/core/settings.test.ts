import {
  ConfigError,
  HttpError,
  SchemaValidationError,
  defineApi,
  defineApis,
  getOperationMetadata,
  inspectSettings,
  isHttpError,
} from "@apixa/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeTransport } from "../helpers/fake-transport.js";

const baseURL = "https://api.example.com";

function message(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("unified settings", () => {
  it("keeps an API named settings and reads collection defaults from the second argument", async () => {
    const seen: string[] = [];
    const transport = createFakeTransport((request) => {
      seen.push(request.url);
      return { status: request.url.endsWith("/products") ? 500 : 200, body: [] };
    });
    const apis = defineApis(
      {
        settings: {
          baseURL,
          transport,
          resources: { products: { path: "/products" } },
        },
        apis: {
          baseURL,
          transport,
          resources: { items: { path: "/items" } },
        },
      },
      { settings: { retry: { count: 1, delay: 0, jitter: false } } },
    );
    await expect(apis.settings.products.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(seen.filter((url) => url.endsWith("/products"))).toHaveLength(2);
    seen.length = 0;
    await apis.apis.items.getAll();
    expect(seen).toHaveLength(1);
  });

  it("lets a deeper scope replace retry and timeout without merging retry objects", async () => {
    const attempts: number[] = [];
    const transport = createFakeTransport(() => {
      attempts.push(1);
      return { status: 500, body: { message: "no" } };
    });
    const api = defineApis(
      {
        store: {
          baseURL,
          transport,
          retry: false,
          resources: {
            products: {
              path: "/products",
              settings: { retry: { count: 2, delay: 0, jitter: false } },
            },
            notes: { path: "/notes" },
          },
        },
      },
      { settings: { retry: { count: 5, delay: 0, jitter: false } } },
    );
    await expect(api.store.products.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toHaveLength(3);
    attempts.length = 0;
    await expect(api.store.notes.getAll()).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toHaveLength(1);
  });

  it("rejects a same-scope duplicate and accepts a cross-scope override", () => {
    expect(
      message(() =>
        defineApi({
          baseURL,
          retry: { count: 1 },
          settings: { retry: { count: 2 } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("retry");
    expect(
      message(() =>
        defineApi({
          baseURL,
          timeout: 1000,
          settings: { request: { timeout: { total: 1000, perAttempt: 100 } } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("timeout");
    expect(() =>
      defineApi({
        baseURL,
        retry: { count: 1 },
        resources: {
          products: { path: "/products", settings: { retry: false } },
        },
      }),
    ).not.toThrow();
  });

  it("rejects unknown, unsafe and convenience keys that are not the existing types", () => {
    expect(
      message(() =>
        defineApi({
          baseURL,
          settings: { cache: true },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("cache");
    expect(
      message(() =>
        defineApi({
          baseURL,
          settings: { request: { timeoutMs: 5 } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("timeout");
    expect(
      message(() =>
        defineApi({
          baseURL,
          settings: { retry: { attempts: 3, count: 3 } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("count");
    const poisoned = JSON.parse('{"__proto__": {"polluted": true}, "retry": false}') as object;
    expect(
      message(() =>
        defineApi({
          baseURL,
          settings: poisoned,
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("unsafe");
  });

  it("does not mutate the caller's config and keeps collections independent", async () => {
    const shared = { retry: { count: 0 } as const };
    const transport = createFakeTransport(() => ({ body: [] }));
    const first = defineApi({
      baseURL,
      transport,
      settings: shared,
      resources: { products: { path: "/products" } },
    });
    const second = defineApi({
      baseURL,
      transport,
      settings: { retry: false },
      resources: { products: { path: "/products" } },
    });
    await first.products.getAll();
    await second.products.getAll();
    expect(shared).toEqual({ retry: { count: 0 } });
    expect(inspectSettings(first.products).retry?.count).toBe(0);
    expect(inspectSettings(second.products).retry).toBeUndefined();
  });

  it("omits headers and function sources from inspectSettings", () => {
    const api = defineApi({
      baseURL,
      headers: { Authorization: "secret-token" },
      settings: {
        retry: { count: 1, shouldRetry: () => false },
        validation: { strict: false },
      },
      resources: { products: { path: "/products" } },
    });
    const view = inspectSettings(api.products);
    expect(JSON.stringify(view)).not.toContain("secret-token");
    expect(view.retry?.shouldRetry).toBe(true);
    expect(view.validation.strict).toBe(false);
    expect(view.response.order).toEqual(["unwrap", "transform", "parse", "normalize", "validate"]);
    expect(Object.isFrozen(api.products)).toBe(true);
  });

  it("runs a custom response order and rejects an invalid or paginated one", async () => {
    const seen: string[] = [];
    const transport = createFakeTransport(() => ({ body: { data: { id: 1, name: "Pen" } } }));
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          settings: {
            response: {
              order: ["parse", "unwrap", "transform", "normalize", "validate"],
              unwrap: (data: unknown) => {
                seen.push("unwrap");
                return (data as { data: unknown }).data;
              },
              parse: (data: unknown) => {
                seen.push("parse");
                return data;
              },
            },
          },
        },
      },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: "Pen" });
    expect(seen).toEqual(["parse", "unwrap"]);

    expect(
      message(() =>
        defineApi({
          baseURL,
          resources: {
            products: {
              path: "/products",
              settings: { response: { order: ["unwrap", "unwrap"] } },
            },
          },
        } as never),
      ),
    ).toContain("exactly once");
    expect(
      message(() =>
        defineApi({
          baseURL,
          resources: {
            products: {
              path: "/products",
              paginationConfig: "laravel",
              settings: {
                response: { order: ["validate", "normalize", "parse", "transform", "unwrap"] },
              },
            },
          },
        }),
      ),
    ).toContain("paginated");
  });

  it("keeps the historical pipeline when order is omitted", async () => {
    const seen: string[] = [];
    const transport = createFakeTransport(() => ({ body: { data: { id: 1 } } }));
    const api = defineApi({
      baseURL,
      transport,
      response: {
        unwrap: (data: unknown) => {
          seen.push("unwrap");
          return (data as { data: unknown }).data;
        },
        parse: (data: unknown) => {
          seen.push("parse");
          return data;
        },
      },
      resources: { products: { path: "/products" } },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1 });
    expect(seen).toEqual(["unwrap", "parse"]);
  });

  it("applies a resource entity schema to entity and list results, not to count", async () => {
    const Product = z.object({ id: z.number(), name: z.string() }).transform((row) => ({
      ...row,
      name: row.name.toUpperCase(),
    }));
    const transport = createFakeTransport((request) => {
      if (request.url.endsWith("/count")) return { body: 4 };
      if (request.url.endsWith("/products")) {
        return { body: [{ id: 1, name: "pen" }] };
      }
      return { body: { id: 1, name: "pen" } };
    });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          schema: { response: Product },
          operations: {
            preview: { path: "/preview" },
            plain: { path: "/plain", schema: { entity: false } },
          },
        },
      },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: "PEN" });
    await expect(api.products.getAll()).resolves.toEqual([{ id: 1, name: "PEN" }]);
    await expect(api.products.count()).resolves.toBe(4);
    await expect(api.products.preview()).resolves.toEqual({ id: 1, name: "pen" });
    await expect(api.products.plain()).resolves.toEqual({ id: 1, name: "pen" });
    expect(
      message(() =>
        defineApi({
          baseURL,
          resources: {
            products: { path: "/products", schema: { body: Product } },
          },
        } as never),
      ),
    ).toContain("body");
  });

  it("validates HTTP error bodies without turning them into request validation errors", async () => {
    const Laravel = z.object({
      message: z.string(),
      errors: z.record(z.string(), z.array(z.string())),
    });
    let mode: "ok" | "bad" | "raw" = "ok";
    const transport = createFakeTransport(() => {
      if (mode === "raw")
        return { status: 422, body: { message: "no", errors: { email: ["bad"] } } };
      if (mode === "bad") return { status: 422, body: { message: 5 } };
      return {
        status: 422,
        body: { message: "Validation failed", errors: { email: ["Invalid email address"] } },
      };
    });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        products: { path: "/products", schema: { error: Laravel } },
      },
    });
    try {
      await api.products.getAll();
      throw new Error("expected an HTTP error");
    } catch (error) {
      expect(isHttpError(error)).toBe(true);
      if (!isHttpError(error)) return;
      expect(error.status).toBe(422);
      expect(error.data).toEqual({
        message: "Validation failed",
        errors: { email: ["Invalid email address"] },
      });
      expect(error).not.toBeInstanceOf(SchemaValidationError);
    }
    mode = "bad";
    try {
      await api.products.getAll();
      throw new Error("expected a schema error");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).phase).toBe("error");
      expect((error as SchemaValidationError).status).toBe(422);
    }
    mode = "raw";
    const plain = defineApi({
      baseURL,
      transport,
      resources: { products: { path: "/products" } },
    });
    try {
      await plain.products.getAll();
      throw new Error("expected an HTTP error");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).not.toBeInstanceOf(SchemaValidationError);
    }
  });

  it("defaults a custom operation without a method to GET and does not infer a write from a body schema", async () => {
    const methods: string[] = [];
    const transport = createFakeTransport((request) => {
      methods.push(request.method);
      return { body: { ok: true } };
    });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          operations: {
            stats: { path: "/stats" },
            labeled: {
              method: "POST",
              path: "/labeled",
              schema: { body: z.object({ name: z.string() }) },
            },
          },
        },
      },
    });
    await api.products.stats();
    await api.products.labeled({ name: "Pen" });
    expect(methods).toEqual(["GET", "POST"]);
    expect(getOperationMetadata(api.products)?.stats?.kind).toBe("read");
    expect(
      message(() =>
        defineApi({
          baseURL,
          resources: {
            products: {
              path: "/products",
              operations: {
                stats: { path: "/stats", schema: { body: z.object({ n: z.number() }) } },
              },
            },
          },
        } as never),
      ),
    ).toContain("no request body");
  });

  it("merges collection and API query options without sharing state between clients", async () => {
    const queries: string[] = [];
    const transport = createFakeTransport((request) => {
      queries.push(request.url);
      return { body: [] };
    });
    const apis = defineApis(
      {
        store: {
          baseURL,
          transport,
          settings: { serialization: { query: { booleans: "number" } } },
          resources: { products: { path: "/products" } },
        },
      },
      {
        settings: {
          serialization: { queryArrayFormat: "comma", query: { nulls: "empty" } },
        },
      },
    );
    await apis.store.products.getAll({ query: { active: true, empty: null, tags: ["a", "b"] } });
    expect(queries[0]).toContain("active=1");
    expect(queries[0]).toContain("empty=");
    expect(queries[0]).toContain("tags=a%2Cb");
    expect(
      message(() =>
        defineApi({
          baseURL,
          resources: {
            products: {
              path: "/products",
              settings: { serialization: { queryArrayFormat: "comma" } },
            },
          },
        } as never),
      ),
    ).toContain("client-wide");
  });

  it("returns the entity schema output after a transforming settings parser", async () => {
    const Product = z.object({ id: z.number(), name: z.string() }).transform((row) => ({
      id: row.id,
      label: row.name.toUpperCase(),
    }));
    const transport = createFakeTransport(() => ({ body: { id: 1, name: "pen" } }));
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          schema: { response: Product },
          settings: {
            response: {
              parse: (data: unknown) => {
                const row = data as { id: number; name: string };
                return { id: row.id, name: ` ${row.name}` };
              },
            },
          },
          operations: { getById: { schema: { entity: false } } },
        },
      },
    });
    await expect(api.products.getById(1)).resolves.toEqual({ id: 1, name: " pen" });
    await expect(api.products.create({ label: "pen" })).resolves.toEqual({
      id: 1,
      label: " PEN",
    });
  });

  it("reports a string unwrap path and ignores later mutation of retry arrays", () => {
    const methods: Array<"GET" | "POST"> = ["GET"];
    const statusCodes = [503];
    const api = defineApi({
      baseURL,
      response: { unwrap: "data.item" },
      retry: { count: 0, methods, statusCodes },
      resources: { products: { path: "/products" } },
    });
    methods.push("POST");
    statusCodes.push(404);
    const view = inspectSettings(api.products);
    expect(view.response.unwrap).toBe("data.item");
    expect(view.retry?.methods).toEqual(["GET"]);
    expect(view.retry?.statusCodes).toEqual([503]);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("rejects same-scope response and query duplicates and allows a deeper override", () => {
    expect(
      message(() =>
        defineApi({
          baseURL,
          response: { unwrap: "data" },
          settings: { response: { unwrap: "item" } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("response.unwrap");
    expect(
      message(() =>
        defineApi({
          baseURL,
          query: { nulls: "omit" },
          settings: { serialization: { query: { booleans: "number" } } },
          resources: { products: { path: "/products" } },
        } as never),
      ),
    ).toContain("query");
    expect(() =>
      defineApi({
        baseURL,
        response: { parse: (data: unknown) => data },
        resources: {
          products: { path: "/products", settings: { response: { parse: false } } },
        },
      }),
    ).not.toThrow();
  });

  it("stores strict mode without rejecting an untyped operation at runtime", async () => {
    const transport = createFakeTransport(() => ({ body: { n: 1 } }));
    const api = defineApi({
      baseURL,
      transport,
      settings: { validation: { strict: true } },
      resources: {
        products: { path: "/products", operations: { stats: { path: "/stats" } } },
      },
    } as never) as unknown as { products: { stats: () => Promise<unknown> } };
    await expect(api.products.stats()).resolves.toEqual({ n: 1 });
    expect(inspectSettings(api.products).validation.strict).toBe(true);
  });
});
