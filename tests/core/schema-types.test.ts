import { defineApi, defineApis } from "@apixa/core";
import type { ApiStateOf, PageResult } from "@apixa/core";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Product = { id: number; name: string; price: number };
interface ApiState {
  products: Product;
}

const ProductSchema = z.object({ id: z.number(), name: z.string(), price: z.number() });
const CreateProduct = z.object({ name: z.string(), price: z.coerce.number() });
const StockSchema = z.object({ qty: z.number() });
const Filters = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().optional(),
});
const transport = createFakeTransport(() => ({ body: {} }));
const baseURL = "https://api.example.com";
/** Compile-time only: the callback is type-checked but never executed. */
const noRun = (_check: () => unknown): void => undefined;

describe("ApiState (flat entity map)", () => {
  it("infers built-in operation types from the entity", () => {
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: { products: { path: "/products" } },
    });
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<Product>();
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<Product[]>();
    expectTypeOf(api.products.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string; price: number; id?: number }>();
    expect(api.products).toBeDefined();
  });

  it("does not require an entry for every runtime resource", () => {
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: {
        products: { path: "/products" },
        tags: { path: "/tags" },
      },
    });
    expectTypeOf(api.tags.getById).returns.resolves.toEqualTypeOf<unknown>();
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<Product>();
  });

  it("still infers entities from mock data for entity-less resources", () => {
    const api = defineApi({
      baseURL,
      resources: { pets: { path: "/pets", mock: [{ id: 1, name: "Rex" }] } },
    });
    expectTypeOf(api.pets.getById).returns.resolves.toEqualTypeOf<{ id: number; name: string }>();
  });

  it("rejects a resource declared in state but missing at runtime", () => {
    noRun(() =>
      defineApi<ApiState>()({
        baseURL,
        // @ts-expect-error `products` is declared in ApiState but not defined at runtime
        resources: { other: { path: "/other" } },
      }),
    );
  });

  it("gives entity-less resources fully typed schema-driven operations", () => {
    const api = defineApi({
      baseURL,
      transport,
      resources: {
        reports: {
          path: "/reports",
          operations: {
            run: {
              method: "POST",
              path: "/run",
              schema: {
                body: z.object({ from: z.string() }),
                response: z.object({ rows: z.number() }),
              },
            },
          },
        },
      },
    });
    expectTypeOf(api.reports.run).parameter(0).toEqualTypeOf<{ from: string }>();
    expectTypeOf(api.reports.run).returns.resolves.toEqualTypeOf<{ rows: number }>();
  });

  it("accepts domain entities that merely contain an `entity` property", () => {
    type Link = { id: number; entity: string; label: string };
    type Wrapper = { entity: string; query: string; note: string };
    const api = defineApi<{ links: Link; wrappers: Wrapper }>()({
      baseURL,
      transport,
      resources: { links: { path: "/links" }, wrappers: { path: "/wrappers" } },
    });
    expectTypeOf(api.links.getById).returns.resolves.toEqualTypeOf<Link>();
    expectTypeOf(api.wrappers.getById).returns.resolves.toEqualTypeOf<Wrapper>();
  });

  it("rejects the removed { entity, operations } wrapper with a migration message", () => {
    type Old = {
      products: { entity: Product; operations: { setStock: { body: { qty: number } } } };
    };
    type OldOnlyEntity = { products: { entity: Product } };
    type Check<T> = T extends ApiStateOf<T> ? "accepted" : "rejected";
    expectTypeOf<Check<Old>>().toEqualTypeOf<"rejected">();
    expectTypeOf<Check<OldOnlyEntity>>().toEqualTypeOf<"rejected">();
    expectTypeOf<Check<ApiState>>().toEqualTypeOf<"accepted">();
    type Message = ApiStateOf<Old>["products"]["apixa config error"];
    expectTypeOf<Message>().toMatchTypeOf<string>();
    // The diagnostic points at the migration.
    const message: Message = null as never;
    expect(message).toBeNull();
  });

  it("removes ResourceState query/list/operations typing", () => {
    // `list` and `query` metadata are gone: the old keys are not special any more.
    type Check<T> = T extends ApiStateOf<T> ? "accepted" : "rejected";
    expectTypeOf<
      Check<{ users: { list: Product[]; entity: Product } }>
    >().toEqualTypeOf<"rejected">();
    expectTypeOf<
      Check<{ users: { query: { q: string }; entity: Product } }>
    >().toEqualTypeOf<"rejected">();
  });

  it("works with defineApis", () => {
    const apis = defineApis<{ shop: ApiState }>()({
      shop: { baseURL, transport, resources: { products: { path: "/products" } } },
    });
    expectTypeOf(apis.shop.products.getById).returns.resolves.toEqualTypeOf<Product>();
  });
});

describe("schema inference on built-in operations", () => {
  const api = defineApi<ApiState>()({
    baseURL,
    transport,
    resources: {
      products: {
        path: "/products",
        operations: {
          preset: "all",
          getAll: { schema: { query: Filters, response: z.array(ProductSchema) } },
          getById: { schema: { response: ProductSchema.extend({ label: z.string() }) } },
          create: { schema: { body: CreateProduct, response: ProductSchema } },
          update: { schema: { body: z.object({ name: z.string() }) } },
          patch: { schema: { body: StockSchema, response: z.object({ ok: z.boolean() }) } },
        },
      },
    },
  });

  it("getAll: query input and response output come from the schema", () => {
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<Product[]>();
    // @ts-expect-error `category` must be a string
    noRun(() => api.products.getAll({ query: { category: 3 } }));
  });

  it("getById: the response schema replaces the entity type", () => {
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
      price: number;
      label: string;
    }>();
  });

  it("create: body is the schema INPUT (coerced fields accept unknown), response its OUTPUT", () => {
    expectTypeOf(api.products.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string; price: unknown }>();
    expectTypeOf(api.products.create).returns.resolves.toEqualTypeOf<Product>();
    // @ts-expect-error `name` is required by the body schema
    noRun(() => api.products.create({ price: 1 }));
    // @ts-expect-error unknown keys are not part of the schema input
    noRun(() => api.products.create({ name: "x", price: 1, extra: true }));
  });

  it("update / patch: options.body follows the schema", () => {
    // @ts-expect-error body.name must be a string
    noRun(() => api.products.update(1, { name: 1 }));
    noRun(() => api.products.update(1, { name: "ok" }));
    noRun(() => api.products.patch(1, { qty: 2 }));
    // @ts-expect-error patch has its own schema
    noRun(() => api.products.patch(1, { name: "ok" }));
    expectTypeOf(api.products.patch).returns.resolves.toEqualTypeOf<{ ok: boolean }>();
  });

  it("keeps built-in types without schemas", () => {
    const plain = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: { products: { path: "/products", operations: "all" } },
    });
    expectTypeOf(plain.products.getById).returns.resolves.toEqualTypeOf<Product>();
    expectTypeOf(plain.products.update).returns.resolves.toEqualTypeOf<Product>();
  });

  it("schema input and output types differ where the schema transforms", () => {
    const Transforming = z.object({ at: z.string().transform((s) => new Date(s)) });
    const t = defineApi({
      baseURL,
      transport,
      resources: {
        events: {
          path: "/events",
          operations: {
            log: {
              method: "POST",
              path: "/log",
              schema: { body: Transforming, response: Transforming },
            },
          },
        },
      },
    });
    expectTypeOf(t.events.log).parameter(0).toEqualTypeOf<{ at: string }>();
    expectTypeOf(t.events.log).returns.resolves.toEqualTypeOf<{ at: Date }>();
  });

  it("is library-neutral (Valibot)", () => {
    const vb = defineApi({
      baseURL,
      transport,
      resources: {
        items: {
          path: "/items",
          operations: {
            add: {
              method: "POST",
              path: "/add",
              schema: {
                body: v.object({ n: v.number() }),
                response: v.object({ ok: v.boolean() }),
              },
            },
          },
        },
      },
    });
    expectTypeOf(vb.items.add).parameter(0).toEqualTypeOf<{ n: number }>();
    expectTypeOf(vb.items.add).returns.resolves.toEqualTypeOf<{ ok: boolean }>();
  });
});

describe("custom operations", () => {
  const api = defineApi<ApiState>()({
    baseURL,
    transport,
    resources: {
      products: {
        path: "/products",
        operations: {
          setStock: {
            method: "PATCH",
            path: "/:id/stock",
            schema: { body: StockSchema, response: ProductSchema },
          },
          search: {
            method: "GET",
            path: "/search",
            schema: { query: Filters, response: z.array(ProductSchema) },
          },
          ping: { method: "GET", path: "/ping" },
          raw: { method: "POST", path: "/raw" },
          parsed: {
            method: "GET",
            path: "/parsed",
            response: { parse: (data: unknown) => data as { ok: true } },
          },
          noBody: { method: "GET", path: "/no-body", schema: { response: z.string() } },
          download: {
            method: "GET",
            path: "/file",
            responseType: "blob",
            schema: { response: z.instanceof(Blob) },
          },
        },
      },
    },
  });

  it("custom PATCH with body/response schema and path params", () => {
    expectTypeOf(api.products.setStock).parameter(0).toEqualTypeOf<{ qty: number }>();
    expectTypeOf(api.products.setStock).returns.resolves.toEqualTypeOf<Product>();
    // @ts-expect-error the :id path param is required
    noRun(() => api.products.setStock({ qty: 1 }));
    // @ts-expect-error qty is a number
    noRun(() => api.products.setStock({ qty: "1" }, { params: { id: 1 } }));
    noRun(() => api.products.setStock({ qty: 1 }, { params: { id: 1 } }));
  });

  it("custom GET with query/response schema", () => {
    expectTypeOf(api.products.search).returns.resolves.toEqualTypeOf<Product[]>();
    // @ts-expect-error unknown query value type
    noRun(() => api.products.search({ query: { category: 1 } }));
  });

  it("unschematized payloads stay unknown", () => {
    expectTypeOf(api.products.ping).returns.resolves.toEqualTypeOf<unknown>();
    expectTypeOf(api.products.raw).parameter(0).toEqualTypeOf<unknown>();
  });

  it("keeps response.parse inference", () => {
    expectTypeOf(api.products.parsed).returns.resolves.toEqualTypeOf<{ ok: true }>();
  });

  it("a response schema overrides a literal responseType", () => {
    expectTypeOf(api.products.download).returns.resolves.toEqualTypeOf<Blob>();
  });

  it("an operation with only a response schema keeps its other defaults", () => {
    expectTypeOf(api.products.noBody).returns.resolves.toEqualTypeOf<string>();
  });

  it("keeps method-derived kind classification", async () => {
    const { getOperationMetadata } = await import("@apixa/core");
    const metadata = getOperationMetadata(api.products)!;
    expect(metadata.setStock?.kind).toBe("write");
    expect(metadata.search?.kind).toBe("read");
  });

  it("rejects invalid schema declarations at compile time", () => {
    noRun(() =>
      defineApi({
        baseURL,
        resources: {
          a: {
            path: "/a",
            operations: {
              // @ts-expect-error unknown schema key
              x: { method: "POST", path: "/x", schema: { bodyy: z.string() } },
            },
          },
        },
      }),
    );
    noRun(() =>
      defineApi({
        baseURL,
        resources: {
          a: {
            path: "/a",
            operations: {
              // @ts-expect-error a bare validator is not accepted
              x: { method: "POST", path: "/x", schema: z.string() },
            },
          },
        },
      }),
    );
    noRun(() =>
      defineApi({
        baseURL,
        resources: {
          a: {
            path: "/a",
            operations: {
              // @ts-expect-error `parse` is not a Standard Schema interface
              x: { method: "POST", path: "/x", schema: { body: { parse: () => 1 } } },
            },
          },
        },
      }),
    );
    noRun(() =>
      defineApi({
        baseURL,
        resources: {
          a: {
            path: "/a",
            operations: {
              // @ts-expect-error run operations cannot declare schemas
              x: { kind: "read", run: async () => 1, schema: { response: z.number() } },
            },
          },
        },
      }),
    );
  });
});

describe("pagination and schemas", () => {
  it("keeps pagination controls typed beside a schema query, and the page contract without a schema", () => {
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: { getAll: { schema: { query: Filters } } },
        },
      },
    });
    noRun(() => api.products.getAll({ query: { category: "a", page: 2, pageSize: 10 } }));
    // @ts-expect-error page must be a number
    noRun(() => api.products.getAll({ query: { page: "2" } }));
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<PageResult<Product>>();
  });

  it("a response schema describes the whole public page, not the items", () => {
    const Page = z.object({
      data: z.array(ProductSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      extra: z.literal("x"),
    });
    const api = defineApi<ApiState>()({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          paginationConfig: "page",
          operations: { getAll: { schema: { response: Page } } },
        },
      },
    });
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<z.output<typeof Page>>();
  });
});
