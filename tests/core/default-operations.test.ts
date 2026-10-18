import { defineApi, type } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

describe("default-first operations", () => {
  it("exposes all built-in CRUD ops for a path-only resource", async () => {
    const calls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push(`${request.method} ${request.url}`);
        if (request.method === "POST") {
          return { status: 201, body: { id: "9", name: "Ada", email: "ada@example.com" } };
        }
        if (request.method === "DELETE") {
          return { status: 204, body: null };
        }
        return { body: { id: "1", name: "Ada", email: "ada@example.com" } };
      }),
      users: {
        path: "/users",
      },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "create",
      "delete",
      "getAll",
      "getByID",
      "update",
    ]);

    expectTypeOf(api.users).toHaveProperty("getAll");
    expectTypeOf(api.users).toHaveProperty("getByID");
    expectTypeOf(api.users).toHaveProperty("create");
    expectTypeOf(api.users).toHaveProperty("update");
    expectTypeOf(api.users).toHaveProperty("delete");

    await api.users.getAll();
    await api.users.getByID("1");
    await api.users.create({ name: "Ada", email: "ada@example.com" });
    await api.users.update("1", { name: "Ada Lovelace" });
    await api.users.delete("1");

    expect(calls).toEqual([
      "GET https://api.example.com/users",
      "GET https://api.example.com/users/1",
      "POST https://api.example.com/users",
      "PUT https://api.example.com/users/1",
      "DELETE https://api.example.com/users/1",
    ]);
  });

  it("keeps other builtins after a partial operation override", async () => {
    const calls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push(`${request.method} ${request.url}`);
        return { body: [] };
      }),
      users: {
        path: "/users",
        operations: {
          getAll: { path: "/active", response: type<User[]>() },
          update: { method: "PATCH", body: type<Partial<User>>(), response: type<User>() },
        },
      },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "create",
      "delete",
      "getAll",
      "getByID",
      "update",
    ]);

    await api.users.getAll();
    await api.users.getByID("1");
    await api.users.update("1", { name: "Ada" });

    expect(calls).toEqual([
      "GET https://api.example.com/users/active",
      "GET https://api.example.com/users/1",
      "PATCH https://api.example.com/users/1",
    ]);
  });

  it("lets custom operations coexist with builtins", async () => {
    const calls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push(`${request.method} ${request.url}`);
        return { body: [] };
      }),
      users: {
        path: "/users",
        operations: {
          search: {
            method: "GET",
            path: "/search",
            query: {} as { q: string },
            response: type<User[]>(),
          },
        },
      },
    });

    expect(api.users).toHaveProperty("getAll");
    expect(api.users).toHaveProperty("search");
    expectTypeOf(api.users.search)
      .parameter(0)
      .toMatchTypeOf<{ query?: { q: string } } | undefined>();

    await api.users.getAll();
    await api.users.search({ query: { q: "ada" } });

    expect(calls).toEqual([
      "GET https://api.example.com/users",
      "GET https://api.example.com/users/search?q=ada",
    ]);
  });
});
