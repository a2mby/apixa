import { defineApi, HttpError, ResponseShapeError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type Product = { sku: `sku-${number}`; name: string };
type State = { products: { entity: Product } };

describe("resource identity", () => {
  it("uses the resource identity key for live lookup and call types", async () => {
    let url = "";
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        url = request.url;
        return { body: [{ sku: "sku-1", name: "Cable" }] };
      }),
      resources: { products: { path: "/products", idKey: "sku" } },
    });
    await api.products.getMany(["sku-1"]);
    expect(url).toBe("https://api.example.com/products?sku=sku-1");
    expectTypeOf(api.products.getById).parameter(0).toEqualTypeOf<`sku-${number}`>();
    if (false as boolean) {
      // @ts-expect-error identity values use the configured field's type
      api.products.getById("unknown");
    }
  });

  it("uses the same identity field for inline mock data", async () => {
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      resources: {
        products: {
          path: "/products",
          idKey: "sku",
          mock: [
            { sku: "sku-1", name: "Cable" },
            { sku: "sku-2", name: "Mouse" },
          ],
        },
      },
    });
    await expect(api.products.getById("sku-2")).resolves.toEqual({ sku: "sku-2", name: "Mouse" });
    await expect(api.products.getMany(["sku-1"])).resolves.toEqual([
      { sku: "sku-1", name: "Cable" },
    ]);
  });

  it("rejects inconsistent or invalid identity settings", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          products: {
            path: "/products",
            idKey: "sku",
            mock: { idKey: "id", data: [{ id: 1, sku: "sku-1" }] },
          },
        },
      }),
    ).toThrow(/idKey must match/);

    if (false as boolean) {
      defineApi<State>()({
        baseURL: "https://api.example.com",
        // @ts-expect-error identity keys must name a field on the declared entity
        resources: { products: { path: "/products", idKey: "missing" } },
      });
    }
  });

  it("types getBy with keyof Entity and handles query default, template override, nullables, and errors", async () => {
    let nextResponse: { status?: number; body?: unknown } = {
      body: { sku: "sku-1", name: "Cable" },
    };
    const urls: string[] = [];
    const api = defineApi<State>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return nextResponse;
      }),
      resources: {
        products: { path: "/products", idKey: "sku" },
        templated: {
          path: "/products",
          idKey: "sku",
          operations: { getBy: { path: "/by/:field/:value" } },
        },
      },
    });

    expectTypeOf(api.products.getBy).parameter(0).toEqualTypeOf<"sku" | "name">();
    expectTypeOf(api.products.getBy).returns.resolves.toEqualTypeOf<Product | null>();

    await expect(api.products.getBy("name", "Cable")).resolves.toEqual({
      sku: "sku-1",
      name: "Cable",
    });
    await expect(api.templated.getBy("sku", "sku-1")).resolves.toEqual({
      sku: "sku-1",
      name: "Cable",
    });
    expect(urls).toEqual([
      "https://api.example.com/products?name=Cable",
      "https://api.example.com/products/by/sku/sku-1",
    ]);

    nextResponse = { body: [{ sku: "sku-2", name: "Mouse" }] };
    await expect(api.products.getBy("name", "Mouse")).resolves.toEqual({
      sku: "sku-2",
      name: "Mouse",
    });

    for (const empty of [
      { status: 404, body: { error: "not found" } },
      { body: [] },
      { body: null },
    ]) {
      nextResponse = empty;
      await expect(api.products.getBy("name", "Missing")).resolves.toBeNull();
    }

    nextResponse = { body: "bad-shape" };
    await expect(api.products.getBy("name", "Cable")).rejects.toBeInstanceOf(ResponseShapeError);

    nextResponse = { status: 500, body: { message: "boom" } };
    await expect(api.products.getBy("name", "Cable")).rejects.toBeInstanceOf(HttpError);

    if (false as boolean) {
      // @ts-expect-error getBy field must be keyof Entity
      api.products.getBy("unknownField", "x");
    }
  });
});
