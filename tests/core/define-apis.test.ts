import "../../packages/mocking/src/register.js";
import { ConfigError, defineApis, type TransportRequest } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: number; name: string };
type Product = { id: string; title: string };

function recorder() {
  const seen: TransportRequest[] = [];
  return { seen, transport: createFakeTransport((r) => (seen.push(r), { body: [] })) };
}

describe("defineApis", () => {
  it("builds independent clients with separate origins, headers, and custom operations", async () => {
    const google = recorder();
    const backend = recorder();
    const apis = defineApis({
      googleApi: {
        baseURL: "https://www.googleapis.com",
        headers: { "X-Key": "google" },
        transport: google.transport,
        resources: { books: { path: "/books/v1/volumes" } },
      },
      backend: {
        baseURL: "http://localhost:3000",
        headers: async () => ({ Authorization: "Bearer backend" }),
        transport: backend.transport,
        resources: {
          users: {
            path: "/users",
            operations: { archive: { method: "POST", path: "/:id/archive" } },
          },
        },
      },
    });
    const { googleApi } = apis;
    await googleApi.books.getAll();
    await apis.backend.users.getById(123);
    await apis.backend.users.archive(1, {});
    expect(google.seen.map((r) => r.url)).toEqual(["https://www.googleapis.com/books/v1/volumes"]);
    expect(google.seen[0]!.headers.has("authorization")).toBe(false);
    expect(backend.seen.map((r) => r.url)).toEqual([
      "http://localhost:3000/users/123",
      "http://localhost:3000/users/1/archive",
    ]);
    expect(backend.seen[0]!.headers.has("x-key")).toBe(false);
    expect("archive" in apis.googleApi.books).toBe(false);
  });

  it("keeps mock stores independent and never uses the network for mocked clients (spec Example 5)", async () => {
    const commerce = recorder();
    const apis = defineApis({
      backend: { baseURL: "/api", resources: { users: { path: "/users", mock: "users-mock" } } },
      backend2: { baseURL: "/api", resources: { users: { path: "/users", mock: "users-mock" } } },
      commerce: {
        baseURL: "https://api.example.com",
        transport: commerce.transport,
        resources: { products: { path: "/products", pagination: "cursor" } },
      },
    });
    await apis.backend.users.delete("1");
    expect(await apis.backend.users.count()).toBe(99);
    expect(await apis.backend2.users.count()).toBe(100);
    await apis.commerce.products.getAll();
    expect(commerce.seen).toHaveLength(1);
    expectTypeOf(apis.commerce.products.getAll).returns.resolves.toEqualTypeOf<{
      data: unknown[];
      nextCursor: string | null;
    }>();
  });

  it("accepts explicit per-client metadata through the curried form", () => {
    type Defs = {
      backend: { users: { entity: User } };
      commerce: { products: { entity: Product } };
    };
    const apis = defineApis<Defs>()({
      backend: { baseURL: "/api", resources: { users: { path: "/users", readOnly: true } } },
      commerce: {
        baseURL: "https://api.example.com",
        resources: { products: { path: "/products" } },
      },
    });
    expectTypeOf(apis.backend.users.getById).returns.resolves.toEqualTypeOf<User>();
    expectTypeOf(apis.commerce.products.getAll).returns.resolves.toEqualTypeOf<Product[]>();
    // @ts-expect-error readOnly removes writes
    void apis.backend.users.create;
  });

  it("names the failing client in configuration errors", () => {
    expect(() =>
      defineApis({
        ok: { baseURL: "/api", resources: {} },
        bad: { baseURL: "nope", resources: {} },
      }),
    ).toThrow(/defineApis\.bad: baseURL "nope"/);
    expect(() =>
      defineApis({
        ok: { baseURL: "/api", resources: {} },
        bad: { baseURL: "nope", resources: {} },
      }),
    ).toThrow(ConfigError);
  });

  it("is a frozen aggregation with no network calls at construction", () => {
    const r = recorder();
    const apis = defineApis({
      a: { baseURL: "https://a.dev", transport: r.transport, resources: { x: { path: "/x" } } },
    });
    expect(Object.isFrozen(apis)).toBe(true);
    expect(r.seen).toEqual([]);
  });
});
