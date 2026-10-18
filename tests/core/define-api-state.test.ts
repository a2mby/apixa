import { defineApi, type BuiltinHeaders } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

describe("defineApi<T> entity-only state typing", () => {
  it("derives CRUD from entity without create/update on the state type", async () => {
    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      headers: { Accept: "application/json", Authorization: "Bearer t" },
      transport: createFakeTransport(() => ({
        body: [{ id: "1", name: "Ada", email: "ada@example.com" }],
      })),
      users: { path: "/users" },
    });

    expectTypeOf(api.users.getAll).returns.toEqualTypeOf<Promise<User[]>>();
    expectTypeOf(api.users.getByID).returns.toEqualTypeOf<Promise<User>>();
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<Omit<User, "id">>();
    expectTypeOf(api.users.create).returns.toEqualTypeOf<Promise<User>>();
    expectTypeOf(api.users.update).parameter(1).toEqualTypeOf<Partial<User>>();
    expectTypeOf(api.users.delete).returns.toEqualTypeOf<Promise<void>>();

    const users = await api.users.getAll();
    expect(users[0]?.name).toBe("Ada");
  });

  it("does not require root keys on AppApi", () => {
    type ResourcesOnly = {
      users: { path: string; entity: User };
    };

    const api = defineApi<ResourcesOnly>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: { path: "/users" },
    });

    expectTypeOf(api.users.getByID).returns.toEqualTypeOf<Promise<User>>();
    expect(api.users).toHaveProperty("create");
  });

  it("accepts BuiltinHeaders common keys and custom names", () => {
    const headers = {
      Accept: "application/json",
      "X-Api-Key": "k",
      "X-Custom-Shop": "apixa",
    } satisfies BuiltinHeaders;

    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      headers,
      transport: createFakeTransport(() => ({ body: null })),
      users: { path: "/users" },
    });

    expectTypeOf(headers).toMatchTypeOf<BuiltinHeaders>();
    expect(api.users).toHaveProperty("getAll");
  });

  it("yields unknown payloads when entity is omitted", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: { path: "/users" },
    });

    expectTypeOf(api.users.getAll).returns.toEqualTypeOf<Promise<unknown[]>>();
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<unknown>();
  });

  it("refines custom operations from state operations bag", async () => {
    type SearchApi = {
      users: {
        path: string;
        entity: User;
        operations: {
          search: {
            method: "GET";
            path: "/search";
            query: { q: string };
            response: User[];
          };
        };
      };
    };

    const api = defineApi<SearchApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      users: {
        path: "/users",
        operations: {
          search: { method: "GET", path: "/search" },
        },
      },
    });

    expectTypeOf(api.users.search)
      .parameter(0)
      .toMatchTypeOf<{ query?: { q: string } } | undefined>();
    expectTypeOf(api.users.search).returns.toEqualTypeOf<Promise<User[]>>();
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<Omit<User, "id">>();

    await api.users.search({ query: { q: "ada" } });
  });
});
