import { createResource, defineApi, defineApis, type ValidateConfig } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createFakeTransport } from "../helpers/fake-transport.js";

const transport = createFakeTransport(() => ({ body: {} }));
const baseURL = "https://api.example.com";
const Product = z.object({ id: z.number(), name: z.string() });
const Snake = z.object({ user_id: z.number() });

describe("settings and schema types", () => {
  it("infers the entity from a resource response schema without converting those keys again", () => {
    const api = defineApi({
      baseURL,
      transport,
      transforms: { response: { keys: "camelCase" } },
      resources: {
        products: {
          path: "/products",
          schema: { response: Product },
          operations: {
            preset: "all",
            stats: { path: "/stats" },
            search: { path: "/search", schema: { response: z.array(Product) } },
            detail: { path: "/:id" },
          },
        },
        accounts: {
          path: "/accounts",
          schema: { response: Snake },
        },
      },
    });
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
    }>();
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<
      { id: number; name: string }[]
    >();
    expectTypeOf(api.products.count).returns.resolves.toEqualTypeOf<number>();
    expectTypeOf(api.products.exists).returns.resolves.toEqualTypeOf<boolean>();
    expectTypeOf(api.products.stats).returns.resolves.toEqualTypeOf<unknown>();
    expectTypeOf(api.products.search).returns.resolves.toEqualTypeOf<
      { id: number; name: string }[]
    >();
    expectTypeOf(api.products.detail)
      .parameter(0)
      .toMatchTypeOf<{ params: { id: string | number } }>();
    expectTypeOf(api.products.stats).toBeCallableWith();
    expectTypeOf(api.accounts.getById).returns.resolves.toEqualTypeOf<{ user_id: number }>();
  });

  it("infers a schema-first createResource and still lets an explicit entity win when it matches", () => {
    const resource = createResource({
      path: "/products",
      schema: { response: Product },
    });
    const api = defineApi({ baseURL, transport, resources: { products: resource } });
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
    }>();

    const explicit = defineApi<{ products: { id: number; name: string } }>()({
      baseURL,
      transport,
      resources: { products: { path: "/products", schema: { response: Product } } },
    });
    expectTypeOf(explicit.products.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string; id?: number }>();
  });

  it("reports a schema that contradicts the declared entity", () => {
    type Bad = ValidateConfig<
      { products: { id: string } },
      {
        baseURL: string;
        resources: { products: { path: "/products"; schema: { response: typeof Product } } };
      }
    >;
    type Message = Bad["resources"]["products"]["schema"]["response"]["apixa config error"];
    expectTypeOf<Message>().toEqualTypeOf<"schema.response output is incompatible with the declared entity">();
  });

  it("requires a known response type only when strict is literally true", () => {
    type Strict = ValidateConfig<
      {},
      {
        baseURL: string;
        settings: { validation: { strict: true } };
        resources: {
          products: { path: "/products"; operations: { stats: { path: "/stats" } } };
        };
      }
    >;
    type Message = Strict["resources"]["products"]["operations"]["stats"]["apixa config error"];
    expectTypeOf<Message>().toMatchTypeOf<string>();

    const loose = defineApi({
      baseURL,
      transport,
      resources: { products: { path: "/products", operations: { stats: { path: "/stats" } } } },
    });
    expectTypeOf(loose.products.stats).returns.resolves.toEqualTypeOf<unknown>();
  });

  it("types settings.response.parse like response.parse, and keeps schema output ahead of it", () => {
    const trim = (data: unknown) => {
      const row = data as { id: number; name: string };
      return { id: row.id, name: row.name.trim() };
    };
    const Labeled = z.object({ id: z.number(), name: z.string() }).transform((row) => ({
      id: row.id,
      label: row.name.toUpperCase(),
    }));
    const legacy = defineApi({
      baseURL,
      transport,
      resources: {
        products: { path: "/products", response: { parse: trim } },
      },
    });
    const modern = defineApi({
      baseURL,
      transport,
      resources: {
        products: { path: "/products", settings: { response: { parse: trim } } },
      },
    });
    expectTypeOf(legacy.products.getById).returns.resolves.toEqualTypeOf<
      Awaited<ReturnType<typeof modern.products.getById>>
    >();
    expectTypeOf(modern.products.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
    }>();

    const mixed = defineApi({
      baseURL,
      transport,
      resources: {
        products: {
          path: "/products",
          schema: { response: Labeled },
          settings: { response: { parse: trim } },
          operations: {
            getById: { schema: { entity: false } },
            search: { path: "/search", schema: { response: z.object({ ok: z.literal(true) }) } },
          },
        },
      },
    });
    expectTypeOf(mixed.products.create).returns.resolves.toEqualTypeOf<{
      id: number;
      label: string;
    }>();
    expectTypeOf(mixed.products.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      name: string;
    }>();
    expectTypeOf(mixed.products.getById).returns.resolves.not.toEqualTypeOf<{
      id: number;
      label: string;
    }>();
    expectTypeOf(mixed.products.search).returns.resolves.toEqualTypeOf<{ ok: true }>();
    expectTypeOf(mixed.products.findFirst).returns.resolves.toEqualTypeOf<{
      id: number;
      label: string;
    } | null>();
  });

  it("rejects same-scope response and query duplicates and allows a deeper override", () => {
    type UnwrapConflict = ValidateConfig<
      {},
      {
        baseURL: string;
        response: { unwrap: "data" };
        settings: { response: { unwrap: "item" } };
        resources: { products: { path: "/products" } };
      }
    >;
    expectTypeOf<
      UnwrapConflict["response"]["apixa config error"]
    >().toEqualTypeOf<"response.unwrap and settings.response.unwrap both set the same option at this scope">();

    type ParseConflict = ValidateConfig<
      {},
      {
        baseURL: string;
        resources: {
          products: {
            path: "/products";
            response: { parse: (data: unknown) => unknown };
            settings: { response: { parse: (data: unknown) => unknown } };
          };
        };
      }
    >;
    expectTypeOf<
      ParseConflict["resources"]["products"]["response"]["apixa config error"]
    >().toEqualTypeOf<"response.parse and settings.response.parse both set the same option at this scope">();

    type QueryConflict = ValidateConfig<
      {},
      {
        baseURL: string;
        query: { nulls: "omit" };
        settings: { serialization: { query: { booleans: "number" } } };
        resources: { products: { path: "/products" } };
      }
    >;
    expectTypeOf<
      QueryConflict["query"]["apixa config error"]
    >().toEqualTypeOf<"query and settings.serialization.query both set the same option at this scope">();

    type SerializerConflict = ValidateConfig<
      {},
      {
        baseURL: string;
        querySerializer: () => "";
        settings: { serialization: { querySerializer: () => "" } };
        resources: { products: { path: "/products" } };
      }
    >;
    expectTypeOf<
      SerializerConflict["querySerializer"]["apixa config error"]
    >().toEqualTypeOf<"querySerializer and settings.serialization.querySerializer both set the same option at this scope">();

    const override = defineApi({
      baseURL,
      transport,
      response: { unwrap: "data" },
      query: { nulls: "omit" },
      resources: {
        products: {
          path: "/products",
          settings: { response: { unwrap: "item", validate: (data: unknown) => data } },
        },
      },
    });
    expectTypeOf(override.products.getAll).returns.resolves.toEqualTypeOf<unknown[]>();
    defineApis(
      {
        store: {
          baseURL,
          transport,
          query: { nulls: "omit" },
          resources: { products: { path: "/products" } },
        },
      },
      { settings: { serialization: { query: { booleans: "number" } } } },
    );
  });

  it("types collection strict mode through the second defineApis argument", () => {
    defineApis(
      {
        store: {
          baseURL,
          transport,
          resources: {
            products: {
              path: "/products",
              operations: {
                stats: { path: "/stats", schema: { response: z.object({ n: z.number() }) } },
              },
            },
          },
        },
      },
      { settings: { validation: { strict: true } } },
    );
    expect(true).toBe(true);
  });
});
