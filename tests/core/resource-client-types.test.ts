import { defineApi, ResponseShapeError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";
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
  it("does not let envelope list metadata override the builtin array contract", async () => {
    type Page = { data: User[]; total: number };
    const api = defineApi<{
      users: { entity: User; list: Page };
      unknownUsers: { list: Page };
      disabled: { entity: User; list: Page };
    }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { data: [], total: 0 } })),
      resources: {
        users: { path: "/users" },
        unknownUsers: { path: "/unknown" },
        disabled: {
          path: "/disabled",
          pagination: "page",
          operations: { getAll: { pagination: false } },
        },
      },
    });
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(api.unknownUsers.getAll).returns.resolves.toEqualTypeOf<unknown[]>();
    expectTypeOf(api.disabled.getAll).returns.resolves.toEqualTypeOf<User[]>();
    await expect(api.users.getAll()).rejects.toBeInstanceOf(ResponseShapeError);
  });

  it("keeps array list metadata and applies response transforms", async () => {
    const api = defineApi<{ users: { list: { user_id: number }[] } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [{ user_id: 1 }] })),
      transforms: { response: { keys: "camelCase" } },
      resources: { users: { path: "/users" } },
    });
    const users = await api.users.getAll();
    expectTypeOf(users).toEqualTypeOf<{ userId: number }[]>();
    expect(users).toEqual([{ userId: 1 }]);
  });

  it("wraps array items once when pagination is enabled", async () => {
    type Page = { data: User[]; total: number; page: number; pageSize: number };
    const page: Page = { data: [], total: 0, page: 1, pageSize: 20 };
    const api = defineApi<{ users: { entity: User; list: Page } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: page })),
      resources: { users: { path: "/users", pagination: "page" } },
    });
    const users = await api.users.getAll();
    expectTypeOf(users).toEqualTypeOf<Page>();
    expect(users).toEqual(page);
  });

  it("embeds builtin ops on a path-only resource", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: {
          path: "/users",
        },
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
    expectTypeOf<Parameters<typeof api.users.update>[1]["body"]>().toEqualTypeOf<unknown>();
    expectTypeOf(api.users.delete).parameter(0).toEqualTypeOf<string | number>();
  });

  it("embeds the same builtins when operations is an empty object", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: {
          path: "/users",
          operations: {},
        },
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
      resources: {
        users: {
          path: "/users",
          operations: {
            search: {
              method: "GET",
              path: "/search",
            },
          },
        },
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf(api.users.getById).toBeFunction();
    expectTypeOf(api.users.search).toBeFunction();
    expectTypeOf(api.users.search)
      .parameter(0)
      .toMatchTypeOf<{ query?: { q: string } } | undefined>();
  });
});

describe("final parsed builtin return types", () => {
  it("infers shaped entities/scalars and full responses rather than intermediate arrays", async () => {
    const row = { id: 1, display: "Ada" };
    const api = defineApi({
      baseURL: "https://example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          operations: {
            findFirst: { response: { parse: async () => [row] } },
            getBy: { response: { parse: () => [row] } },
            getAll: { response: { parse: () => [row] } },
            getById: { response: { parse: () => row } },
            count: { response: { parse: () => 3 } },
            exists: { response: { parse: () => [row] } },
          },
        },
        unrelated: { path: "/other", mock: [{ id: "other" }] },
      },
    });
    const first = await api.users.findFirst();
    expectTypeOf(first).toEqualTypeOf<typeof row | null>();
    expect(first).toEqual(row);
    const full = await api.users.findFirst({ full: true });
    expectTypeOf(full.data).toEqualTypeOf<typeof row | null>();
    const lookup = await api.users.getBy("id", 1);
    expectTypeOf(lookup).toEqualTypeOf<typeof row | null>();
    expectTypeOf(await api.users.getAll()).toEqualTypeOf<(typeof row)[]>();
    expectTypeOf(await api.users.getById(1)).toEqualTypeOf<typeof row>();
    expectTypeOf(await api.users.count()).toEqualTypeOf<number>();
    expectTypeOf(await api.users.exists(1)).toEqualTypeOf<boolean>();
    expectTypeOf(await api.unrelated.getAll()).toEqualTypeOf<{ id: string }[]>();
    if (false as boolean) {
      // @ts-expect-error findFirst is not an array operation
      const wrong: (typeof row)[] = await api.users.findFirst();
      void wrong;
    }
  });
  it("infers inherited parser transformations and respects parser opt-out", async () => {
    const row = { id: 1, display: "Ada" };
    const api = defineApi({
      baseURL: "https://example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      response: { parse: () => [row] },
      resources: {
        users: { path: "/users", operations: { custom: { method: "GET" } } },
        disabled: { path: "/disabled", response: { parse: false } },
      },
    });
    expectTypeOf(await api.users.findFirst()).toEqualTypeOf<typeof row | null>();
    expectTypeOf(await api.users.getAll()).toEqualTypeOf<(typeof row)[]>();
    expectTypeOf(await api.disabled.getAll()).toEqualTypeOf<unknown[]>();
    expectTypeOf(await api.users.custom()).toEqualTypeOf<(typeof row)[]>();
  });
});

describe("impossible parsed builtin shapes", () => {
  it("does not promise object collections or array entities from invalid parser outputs", () => {
    const api = defineApi({
      baseURL: "/api",
      resources: {
        users: {
          path: "/users",
          operations: {
            getAll: { response: { parse: () => ({ data: [] }) } },
            getById: { response: { parse: () => [{ id: 1 }] } },
            createMany: { response: { parse: () => ({ data: [] }) } },
          },
        },
      },
    });
    if (false as boolean) {
      expectTypeOf(api.users.getAll()).resolves.toBeNever();
      expectTypeOf(api.users.getById(1)).resolves.toBeNever();
      expectTypeOf(api.users.createMany([])).resolves.toBeNever();
    }
  });
});
