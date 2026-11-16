import { defineApi, type BuiltinHeaders } from "@apixa/core";
import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: User;
};

describe("defineApi<T> entity-only state typing", () => {
  it("derives CRUD from entity without create/update on the state type", async () => {
    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      headers: { Accept: "application/json", Authorization: "Bearer t" },
      transport: createFakeTransport((request) => ({
        body: request.url.endsWith("/users/1")
          ? { id: "1", name: "Ada", email: "ada@example.com" }
          : [{ id: "1", name: "Ada", email: "ada@example.com" }],
      })),
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf<Parameters<typeof api.users.update>[1]>().toEqualTypeOf<Partial<User>>();

    const users = await api.users.getAll();
    expectTypeOf(users).toEqualTypeOf<User[]>();
    const user = await api.users.getById("1");
    expectTypeOf(user).toEqualTypeOf<User>();
    expect(users[0]?.name).toBe("Ada");
  });

  it("does not require root keys on AppApi", async () => {
    type ResourcesOnly = {
      users: User;
    };

    const api = defineApi<ResourcesOnly>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { id: "1", name: "Ada", email: "a@b.c" } })),
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(await api.users.getById("1")).toEqualTypeOf<User>();
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
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(headers).toMatchTypeOf<BuiltinHeaders>();
    expect(api.users).toHaveProperty("getAll");
  });

  it("yields unknown payloads when entity is omitted", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(await api.users.getAll()).toEqualTypeOf<unknown[]>();
  });

  it("types custom operations from their runtime schema, not from state", async () => {
    type SearchApi = { users: User };

    const api = defineApi<SearchApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          operations: {
            search: {
              method: "GET",
              path: "/search",
              schema: {
                query: z.object({ q: z.string() }),
                response: z.array(
                  z.object({ id: z.string(), name: z.string(), email: z.string() }),
                ),
              },
            },
          },
        },
      },
    });

    expectTypeOf(api.users.search)
      .parameter(0)
      .toMatchTypeOf<{ query?: { q: string } } | undefined>();
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf(await api.users.search({ query: { q: "ada" } })).toEqualTypeOf<User[]>();
  });
});

describe("defineApi<T> accepts interfaces", () => {
  it("works with interface state, not just type aliases", async () => {
    interface User {
      id: string;
      name: string;
    }
    interface AppApi {
      users: User;
    }

    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users" },
      },
      transport: {
        async request() {
          return {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            raw: new Response(),
            body: { id: "1", name: "Ada" },
          };
        },
      },
    });

    const user = await api.users.getById("1");
    expect(user.name).toBe("Ada");
  });
});
