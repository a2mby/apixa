import { ConfigError, SchemaValidationError } from "@apixa/core";
import type { TransportRequest } from "@apixa/core";
import { defineApi, z } from "apixa/validation";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

const baseURL = "https://api.example.com";
const noRun = (_check: () => unknown): void => undefined;

type Product = { id: number; name: string };
interface ApiState {
  products: Product;
}

function recorded(body: unknown = { id: 1, name: "Pen" }) {
  const requests: TransportRequest[] = [];
  const transport = createFakeTransport((request) => {
    requests.push(request);
    return { body };
  });
  return { requests, transport };
}

describe("apixa/validation: plain object shapes become z.object", () => {
  it("re-exports z and a working defineApi", () => {
    expect(typeof z.object).toBe("function");
    expect(typeof defineApi).toBe("function");
  });

  it("reads schema.body / schema.response shapes (inference, validation, transforms)", async () => {
    const { requests, transport } = recorded();
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          operations: {
            preset: "all",
            create: {
              schema: {
                body: {
                  name: z.string().min(2),
                  price: z.coerce.number(),
                  note: z.string().optional(),
                },
                response: { id: z.number(), name: z.string().transform((s) => s.toUpperCase()) },
              },
            },
          },
        },
      },
    });
    expectTypeOf(api.products.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string; price: unknown; note?: string | undefined }>();
    expectTypeOf(api.products.create).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
    }>();
    const created = await api.products.create({ name: "Pen", price: "5" });
    expect(created).toEqual({ id: 1, name: "PEN" });
    expect(JSON.parse(String(requests[0]?.body))).toEqual({ name: "Pen", price: 5 });
    await expect(api.products.create({ name: "x", price: 1 })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(requests).toHaveLength(1);
  });

  it("supports nested objects at any depth", async () => {
    const { requests, transport } = recorded({ ok: true });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        orders: {
          path: "/orders",
          operations: {
            place: {
              method: "POST",
              path: "/place",
              schema: {
                body: {
                  customer: {
                    name: z.string(),
                    address: { city: z.string(), zip: z.string().optional() },
                  },
                  items: z.array(z.object({ sku: z.string(), qty: z.number() })),
                },
                response: { ok: z.boolean() },
              },
            },
          },
        },
      },
    });
    expectTypeOf(api.orders.place).parameter(0).toEqualTypeOf<{
      customer: { name: string; address: { city: string; zip?: string | undefined } };
      items: { sku: string; qty: number }[];
    }>();
    expectTypeOf(api.orders.place).returns.resolves.toEqualTypeOf<{ ok: boolean }>();
    await api.orders.place({
      customer: { name: "Ada", address: { city: "London" } },
      items: [{ sku: "a", qty: 1 }],
    });
    expect(requests).toHaveLength(1);
    const error = await api.orders
      .place({ customer: { name: "Ada", address: { city: 3 as never } }, items: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect((error as SchemaValidationError).issues[0]?.path).toEqual([
      "customer",
      "address",
      "city",
    ]);
  });

  it("reads schema.query shapes synchronously, with defaults, before pagination composition", async () => {
    const requestsSeen: string[] = [];
    const transport = createFakeTransport((request) => {
      requestsSeen.push(request.url);
      return { body: { data: [], total: 0, page: 2, pageSize: 5 } };
    });
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: {
            getAll: {
              schema: {
                query: { category: z.string(), sort: z.enum(["asc", "desc"]).default("asc") },
              },
            },
          },
        },
      },
    });
    await api.products.getAll({ query: { category: "pens", page: 2, pageSize: 5 } });
    const url = new URL(requestsSeen[0]!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: "pens",
      sort: "asc",
      page: "2",
      pageSize: "5",
    });
    noRun(() =>
      // @ts-expect-error category must be a string
      api.products.getAll({ query: { category: 1 } }),
    );
  });

  it("keeps explicit Zod schemas for arrays, primitives, unions, nullable, files and blobs", async () => {
    const { requests, transport } = recorded([1, 2]);
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        misc: {
          path: "/misc",
          operations: {
            ids: {
              method: "POST",
              path: "/ids",
              schema: { body: z.array(z.number()), response: z.array(z.number()) },
            },
            label: {
              method: "POST",
              path: "/label",
              schema: { body: z.string(), response: z.string().nullable() },
            },
            either: {
              method: "POST",
              path: "/either",
              schema: { body: z.union([z.string(), z.number()]) },
            },
            upload: {
              method: "POST",
              path: "/upload",
              schema: { body: z.object({ file: z.instanceof(File), title: z.string() }) },
            },
            blob: { method: "POST", path: "/blob", schema: { body: z.instanceof(Blob) } },
          },
        },
      },
    });
    expectTypeOf(api.misc.ids).parameter(0).toEqualTypeOf<number[]>();
    expectTypeOf(api.misc.ids).returns.resolves.toEqualTypeOf<number[]>();
    expectTypeOf(api.misc.label).returns.resolves.toEqualTypeOf<string | null>();
    expectTypeOf(api.misc.either).parameter(0).toEqualTypeOf<string | number>();
    expectTypeOf(api.misc.upload).parameter(0).toEqualTypeOf<{ file: File; title: string }>();
    expectTypeOf(api.misc.blob).parameter(0).toEqualTypeOf<Blob>();
    await api.misc.ids([1, 2]);
    await expect(api.misc.ids(["x"] as never)).rejects.toBeInstanceOf(SchemaValidationError);
    await api.misc.blob(new Blob(["abc"]));
    await api.misc.upload({ file: new File(["x"], "a.txt"), title: "t" });
    await expect(api.misc.upload({ file: "no" as never, title: "t" })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(requests.length).toBe(3);
  });

  it("validates non-JSON bodies by their data type and never buffers a stream", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled++;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const received: unknown[] = [];
    const api = defineApi({
      baseURL,
      transport: {
        request: async (input) => {
          received.push(input.body);
          return {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            raw: new Response("{}"),
            body: {},
          };
        },
      },
      resources: {
        media: {
          path: "/media",
          operations: {
            push: { method: "POST", path: "/push", schema: { body: z.instanceof(ReadableStream) } },
          },
        },
      },
    });
    await api.media.push(stream);
    // Validation only checked the object; the transport still receives the same unconsumed stream.
    expect(pulled).toBe(0);
    expect(received[0]).toBeInstanceOf(ReadableStream);
    await expect(api.media.push("text" as never)).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("passes any Standard Schema validator through untouched (Core stays validator-neutral)", async () => {
    const { transport } = recorded({ n: 2 });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        calc: {
          path: "/calc",
          operations: {
            double: {
              method: "POST",
              path: "/double",
              schema: { body: v.object({ n: v.number() }), response: { n: z.number() } },
            },
          },
        },
      },
    });
    expectTypeOf(api.calc.double).parameter(0).toEqualTypeOf<{ n: number }>();
    expectTypeOf(api.calc.double).returns.resolves.toEqualTypeOf<{ n: number }>();
    await expect(api.calc.double({ n: 1 })).resolves.toEqual({ n: 2 });
    await expect(api.calc.double({ n: "1" as never })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });

  it("keeps ADR-006 timing: query synchronous, body and response asynchronous", async () => {
    const { requests, transport } = recorded({ ok: true });
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        jobs: {
          path: "/jobs",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: {
                body: z.object({ code: z.string().refine(async (c) => c === "ok", "bad") }),
                response: z.object({ ok: z.boolean() }).refine(async (r) => r.ok, "not ok"),
              },
            },
            find: {
              method: "GET",
              path: "/find",
              schema: { query: z.object({ q: z.string().refine(async () => true) }) },
            },
          },
        },
      },
    });
    await expect(api.jobs.run({ code: "ok" })).resolves.toEqual({ ok: true });
    await expect(api.jobs.run({ code: "no" })).rejects.toBeInstanceOf(SchemaValidationError);
    // zod runs async refinements only through its async path, which the Standard Schema returns as a Promise.
    await expect(api.jobs.find({ query: { q: "x" } })).rejects.toBeInstanceOf(ConfigError);
    expect(requests).toHaveLength(1);
  });

  it("rejects arrays and primitives written as shape values, naming the path", () => {
    const build = (body: unknown) => () =>
      defineApi({
        baseURL,
        resources: {
          a: {
            path: "/a",
            operations: { x: { method: "POST", path: "/x", schema: { body } as never } },
          },
        },
      } as never);
    expect(build({ tags: ["a"] })).toThrowError(/resources\.a\.operations\.x\.schema\.body\.tags/);
    expect(build({ nested: { deep: 5 } })).toThrowError(/schema\.body\.nested\.deep/);
    expect(build({ ok: z.string() })).not.toThrow();
  });

  it("does not mutate the caller's configuration object", () => {
    const body = { name: z.string() };
    const config = {
      baseURL,
      resources: {
        a: { path: "/a", operations: { x: { method: "POST", path: "/x", schema: { body } } } },
      },
    } as const;
    defineApi(config);
    expect(config.resources.a.operations.x.schema.body).toBe(body);
  });

  it("works on the facade type level for ApiState and runtime-only resources", () => {
    const api = defineApi<ApiState>()({
      baseURL,
      resources: {
        products: { path: "/products" },
        reports: {
          path: "/reports",
          operations: {
            run: { method: "POST", path: "/run", schema: { response: { rows: z.number() } } },
          },
        },
      },
    });
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<Product>();
    expectTypeOf(api.reports.run).returns.resolves.toEqualTypeOf<{ rows: number }>();
  });
});
