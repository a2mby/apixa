import { defineApi } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type TypedUsersApi = {
  users: {
    path: "/users";
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

describe("resource client TypeScript surface", () => {
  it("embeds builtin ops on a path-only resource", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
      },
    });

    expectTypeOf(api.users.getAll).toBeFunction();
    expectTypeOf(api.users.getById).toBeFunction();
    expectTypeOf(api.users.create).toBeFunction();
    expectTypeOf(api.users.update).toBeFunction();
    expectTypeOf(api.users.delete).toBeFunction();

    expectTypeOf(api.users.getById).parameter(0).toEqualTypeOf<string | number>();
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(api.users.update).parameter(0).toEqualTypeOf<string | number>();
    expectTypeOf(api.users.update).parameter(1).toEqualTypeOf<unknown>();
    expectTypeOf(api.users.delete).parameter(0).toEqualTypeOf<string | number>();
  });

  it("embeds the same builtins when operations is an empty object", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {},
      },
    });

    expectTypeOf(api.users).toHaveProperty("getAll");
    expectTypeOf(api.users).toHaveProperty("getById");
    expectTypeOf(api.users).toHaveProperty("create");
    expectTypeOf(api.users).toHaveProperty("update");
    expectTypeOf(api.users).toHaveProperty("delete");
    expectTypeOf(api.users.getAll).toBeFunction();
  });

  it("keeps custom ops alongside builtins with refined override signatures", () => {
    const api = defineApi<TypedUsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          search: {
            method: "GET",
            path: "/search",
          },
        },
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<Omit<User, "id">>();
    expectTypeOf(api.users.getById).toBeFunction();
    expectTypeOf(api.users.search).toBeFunction();
    expectTypeOf(api.users.search)
      .parameter(0)
      .toMatchTypeOf<{ query?: { q: string } } | undefined>();
  });
});
