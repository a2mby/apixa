import { defineApi, isHttpError, ResponseShapeError } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type UsersApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

describe("builtins added in v0.10.0", () => {
  it.each(["getMany", "findFirst"] as const)(
    "%s rejects an invalid collection instead of reporting no results",
    async (operation) => {
      const invalid = { items: [{ id: "1" }], trace: "response-42" };
      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport(() => ({ status: 200, body: invalid })),
        resources: { users: { path: "/users" } },
      });

      const result = operation === "getMany" ? api.users.getMany(["1"]) : api.users.findFirst();
      await expect(result).rejects.toBeInstanceOf(ResponseShapeError);
      await expect(result).rejects.toMatchObject({
        code: "RESPONSE_SHAPE",
        status: 200,
        data: invalid,
        response: { data: invalid, status: 200, raw: expect.any(Response) },
      });
    },
  );

  it("keeps genuinely empty collection results valid", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: { users: { path: "/users" } },
    });
    await expect(api.users.getMany(["1"])).resolves.toEqual([]);
    await expect(api.users.findFirst()).resolves.toBeNull();
  });

  it("are present by default for a path-only resource, same as the original 5", () => {
    const api = defineApi<UsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: { path: "/users" },
      },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "count",
      "create",
      "createMany",
      "delete",
      "deleteMany",
      "exists",
      "findFirst",
      "getAll",
      "getBy",
      "getById",
      "getMany",
      "patch",
      "update",
    ]);
  });

  it("call without referencing operations at all, using the documented default wire shape", async () => {
    const calls: Array<{ method: string; url: string }> = [];

    const api = defineApi<UsersApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push({ method: request.method, url: request.url });
        return { status: 200, body: { id: "1", name: "Ada", email: "a@example.com" } };
      }),
      resources: {
        users: { path: "/users" },
      }, // no `operations` at all
    });

    await api.users.patch("1", { body: { name: "Ada" } });
    await api.users.getBy("email", "a@example.com");

    expect(calls).toEqual([
      { method: "PATCH", url: "https://api.example.com/users/1" },
      { method: "GET", url: "https://api.example.com/users?email=a%40example.com" },
    ]);
  });

  const staticRouteCases: Array<{
    name: string;
    call: (api: any) => Promise<unknown>;
    expectedMethod: string;
    expectedUrl: string;
  }> = [
    {
      name: "patch",
      call: (api) => api.users.patch("1", { body: { name: "Ada" } }),
      expectedMethod: "PATCH",
      expectedUrl: "https://api.example.com/users/1",
    },
    {
      name: "count",
      call: (api) => api.users.count(),
      expectedMethod: "GET",
      expectedUrl: "https://api.example.com/users/count",
    },
    {
      name: "createMany",
      call: (api) => api.users.createMany([{ name: "Ada", email: "a@example.com" }]),
      expectedMethod: "POST",
      expectedUrl: "https://api.example.com/users/bulk",
    },
    {
      name: "deleteMany",
      call: (api) => api.users.deleteMany(["1", "2"]),
      expectedMethod: "DELETE",
      expectedUrl: "https://api.example.com/users/bulk",
    },
  ];

  for (const testCase of staticRouteCases) {
    it(`${testCase.name} has a documented default method/path`, async () => {
      const calls: Array<{ method: string; url: string }> = [];

      const api = defineApi({
        baseURL: "https://api.example.com",
        transport: createFakeTransport((request) => {
          calls.push({ method: request.method, url: request.url });
          if (request.url.endsWith("/count")) return { status: 200, body: 3 };
          if (request.method === "POST" && request.url.endsWith("/bulk"))
            return { status: 200, body: [] };
          return { status: 200, body: {} };
        }),
        resources: {
          users: { path: "/users" },
        },
      });

      await testCase.call(api);

      expect(calls).toEqual([{ method: testCase.expectedMethod, url: testCase.expectedUrl }]);
    });
  }

  it("an overridden path on a builtin replaces the default", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { status: 200, body: 3 };
      }),
      resources: {
        users: {
          path: "/users",
          operations: {
            count: { path: "/total" },
          },
        },
      },
    });

    await api.users.count();
    expect(urls).toEqual(["https://api.example.com/users/total"]);
  });

  it("false removes a builtin, same as the original 5", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: {
          path: "/users",
          operations: { count: false, findFirst: false },
        },
      },
    });

    expect(Object.keys(api.users)).not.toContain("count");
    expect(Object.keys(api.users)).not.toContain("findFirst");
    expect(api.users).toHaveProperty("getAll");
  });

  it("exists composes over getById and maps a 404 to false, without a new backend route", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        if (request.url.endsWith("/users/1")) {
          return { status: 200, body: { id: "1", name: "Ada", email: "a@example.com" } };
        }
        return { status: 404, body: { message: "not found" } };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    expect(await api.users.exists("1")).toBe(true);
    expect(await api.users.exists("missing")).toBe(false);
  });

  it("exists rethrows non-404 failures", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ status: 500, body: { message: "boom" } })),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.exists("1")).rejects.toSatisfy(
      (error) => isHttpError(error) && error.status === 500,
    );
  });

  it("findFirst composes over getAll and returns the first match or null", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        if (request.url.includes("empty=true")) return { status: 200, body: [] };
        return {
          status: 200,
          body: [{ id: "1", name: "Ada", email: "a@example.com" }],
        };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    expect(await api.users.findFirst()).toEqual({ id: "1", name: "Ada", email: "a@example.com" });
    expect(await api.users.findFirst({ query: { empty: true } })).toBeNull();
  });

  it("getMany composes over the collection endpoint with an id query", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return {
          status: 200,
          body: [
            { id: "1", name: "Ada", email: "a@example.com" },
            { id: "2", name: "Bob", email: "b@example.com" },
          ],
        };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    const result = await api.users.getMany(["1", "2"]);
    expect(result).toHaveLength(2);
    expect(urls).toEqual(["https://api.example.com/users?id=1&id=2"]);
  });

  it("getBy uses query params by default or interpolates a :field/:value override", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { status: 200, body: { id: "1", name: "Ada", email: "a@example.com" } };
      }),
      resources: {
        users: { path: "/users" },
        templated: {
          path: "/templated",
          operations: { getBy: { path: "/by/:field/:value" } },
        },
      },
    });

    await api.users.getBy("code", "ABC123");
    await api.templated.getBy("code", "ABC123");

    expect(urls).toEqual([
      "https://api.example.com/users?code=ABC123",
      "https://api.example.com/templated/by/code/ABC123",
    ]);
  });

  it("exists uses its own path when getById is overridden", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        if (request.url.endsWith("/u/1")) {
          return { status: 200, body: { id: "1" } };
        }
        return { status: 404, body: { message: "not found" } };
      }),
      resources: {
        users: {
          path: "/users",
          operations: { getById: { path: "/u/:id" } },
        },
      },
    });

    expect(await api.users.exists("1")).toBe(false);
    expect(urls).toEqual(["https://api.example.com/users/1"]);
  });

  it("findFirst / getMany use their own paths when getAll is overridden", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { status: 200, body: [{ id: "1", name: "Ada" }] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: { getAll: { path: "/all" } },
        },
      },
    });

    expect(await api.users.findFirst()).toEqual({ id: "1", name: "Ada" });
    expect(await api.users.getMany(["1"])).toEqual([{ id: "1", name: "Ada" }]);
    expect(urls.every((url) => url.startsWith("https://api.example.com/users"))).toBe(true);
    expect(urls.every((url) => !url.includes("/all"))).toBe(true);
  });

  it("exists / getMany keep their convention paths when getById / getAll is removed", async () => {
    const urls: string[] = [];

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        if (request.url.endsWith("/users/1")) return { status: 200, body: { id: "1" } };
        return { status: 200, body: [{ id: "1" }] };
      }),
      resources: {
        users: {
          path: "/users",
          operations: { getById: false, getAll: false },
        },
      },
    });

    expect(await api.users.exists("1")).toBe(true);
    expect(await api.users.getMany(["1"])).toEqual([{ id: "1" }]);
  });

  it("does not implicitly unwrap an envelope for findFirst or getMany", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        status: 200,
        body: { data: [{ id: "1" }, { id: "2" }], total: 2, page: 1, pageSize: 20 },
      })),
      resources: {
        users: { path: "/users" },
      },
    });

    await expect(api.users.findFirst()).rejects.toBeInstanceOf(ResponseShapeError);
    await expect(api.users.getMany(["1", "2"])).rejects.toBeInstanceOf(ResponseShapeError);
  });

  it("types exists / findFirst / getMany / getBy as their composed public signature", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(api.users.exists).parameter(0).toEqualTypeOf<string | number>();
    expectTypeOf(api.users.getMany).parameter(0).toEqualTypeOf<(string | number)[]>();
    expectTypeOf(api.users.getBy).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(api.users.getBy).parameter(1).toEqualTypeOf<string | number>();
  });
});

describe("read preset", () => {
  it("removes the write ops; getAll/getById/exists stay", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      resources: {
        users: { path: "/users", operations: "read" },
      },
    });

    for (const name of [
      "create",
      "update",
      "patch",
      "delete",
      "createMany",
      "deleteMany",
    ]) {
      expect(Object.keys(api.users)).not.toContain(name);
    }
    expect(Object.keys(api.users)).toContain("getAll");
    expect(Object.keys(api.users)).toContain("getById");
    expect(Object.keys(api.users)).toContain("exists");
  });

  it("an explicit operation entry still wins over the read preset", async () => {
    const urls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        urls.push(request.url);
        return { status: 200, body: { id: "1" } };
      }),
      resources: {
        users: {
          path: "/users",
          operations: { preset: "read", patch: {} },
        },
      },
    });

    expect(Object.keys(api.users)).toContain("patch");
    expect(Object.keys(api.users)).not.toContain("delete");
    await api.users.patch("1", { body: { name: "Ada" } });
    expect(urls).toEqual(["https://api.example.com/users/1"]);
  });
});

describe("pagination convention (v0.11.0, type-only)", () => {
  it("does not change runtime behavior when absent", async () => {
    const calls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push(request.url);
        return { status: 200, body: [{ id: "1" }] };
      }),
      resources: {
        users: { path: "/users" },
      },
    });

    const all = await api.users.getAll();
    expect(all).toEqual([{ id: "1" }]);
    expect(calls).toEqual(["https://api.example.com/users"]);
  });

  it("passes page/pageSize through as ordinary query params when declared", async () => {
    const calls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        calls.push(request.url);
        return { status: 200, body: { data: [{ id: "1" }], total: 1, page: 1, pageSize: 20 } };
      }),
      resources: {
        users: { path: "/users", pagination: "page" },
      },
    });

    const page = (await api.users.getAll({ query: { page: 1, pageSize: 20 } })) as {
      data: unknown[];
      total: number;
    };
    expect(page.data).toEqual([{ id: "1" }]);
    expect(page.total).toBe(1);
    expect(calls).toEqual(["https://api.example.com/users?page=1&pageSize=20"]);
  });
});
