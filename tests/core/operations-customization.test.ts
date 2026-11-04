import { defineApi, isHttpError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type UsersApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

describe("operations customization", () => {
  it("removes a builtin when set to false", () => {
    const api = defineApi<UsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          delete: false,
        },
      },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "bulkCreate",
      "bulkDelete",
      "count",
      "create",
      "exists",
      "findFirst",
      "getAll",
      "getBy",
      "getById",
      "getBySlug",
      "getMany",
      "patch",
      "search",
      "update",
      "upsert",
    ]);
    expect((api.users as Record<string, unknown>).delete).toBeUndefined();
  });

  it("reflects removal and opt-in builtins in the client type when inferring from the literal config", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          delete: false,
          count: {},
        },
      },
    });

    expectTypeOf(api.users).not.toHaveProperty("delete");
    expectTypeOf(api.users).toHaveProperty("count");
    expectTypeOf(api.users.count).toBeFunction();
  });

  it("a false removal of a name that was never a builtin at all is a no-op", () => {
    const api = defineApi<UsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          neverExisted: false,
        },
      },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "bulkCreate",
      "bulkDelete",
      "count",
      "create",
      "delete",
      "exists",
      "findFirst",
      "getAll",
      "getBy",
      "getById",
      "getBySlug",
      "getMany",
      "patch",
      "search",
      "update",
      "upsert",
    ]);
  });

  it("calls a custom function operation exactly like a builtin, through the normal pipeline", async () => {
    type ArchiveApi = {
      users: {
        path: "/users";
        entity: User;
        operations?: {
          archive: (id: string) => Promise<{ archived: true }>;
        };
      };
    };

    const calls: Array<{ method: string; url: string }> = [];

    const api = defineApi<ArchiveApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push({ method: request.method, url: request.url });
        return { status: 200, body: { archived: true } };
      }),
      users: {
        path: "/users",
        operations: {
          archive: (ctx, id: string) => ctx.request({ method: "POST", path: `/${id}/archive` }),
        },
      },
    });

    const result = await api.users.archive("123");

    expect(result).toEqual({ archived: true });
    expect(calls).toEqual([{ method: "POST", url: "https://api.example.com/users/123/archive" }]);
    expectTypeOf(api.users.archive).parameter(0).toEqualTypeOf<string>();
  });

  it("classifies a function operation's failure the same way as a config-object operation", async () => {
    type ArchiveApi = {
      users: {
        path: "/users";
        entity: User;
        operations?: {
          archive: (id: string) => Promise<unknown>;
        };
      };
    };

    const api = defineApi<ArchiveApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ status: 404, body: { message: "not found" } })),
      users: {
        path: "/users",
        operations: {
          archive: (ctx, id: string) => ctx.request({ method: "POST", path: `/${id}/archive` }),
        },
      },
    });

    await expect(api.users.archive("123")).rejects.toSatisfy(
      (error) => isHttpError(error) && error.status === 404,
    );
  });

  it("a custom operation with a builtin's name overrides the convention", async () => {
    const urls: string[] = [];

    const api = defineApi<UsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { body: { id: "1", name: "Ada", email: "ada@example.com" } };
      }),
      users: {
        path: "/users",
        operations: {
          getById: { method: "GET", path: "/by-id/:id" },
        },
      },
    });

    await api.users.getById("1");
    expect(urls).toEqual(["https://api.example.com/users/by-id/1"]);
  });

  it("suggests known operation names while still accepting arbitrary custom keys", () => {
    type AppApi = {
      users: {
        path: "/users";
        entity: User;
        operations?: {
          getBySlug: { path: "/slug/:slug"; response: User };
          patch: {};
          archive: (id: string) => Promise<void>;
        };
      };
    };

    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          getBySlug: {},
          patch: {},
          archive: async (ctx, id: string) => {
            await ctx.request({ method: "POST", path: `/${id}/archive` });
          },
        },
      },
    });

    expectTypeOf(api.users.getBySlug).toBeFunction();
    expectTypeOf(api.users.patch).toBeFunction();
    expectTypeOf(api.users.archive).toBeFunction();
  });
});
