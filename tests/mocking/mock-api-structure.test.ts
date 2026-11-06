import { defineMockApi, MockApiError, type MockOperationContext, type Page } from "@apixa/mocking";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("defineMockApi mirrors the defineApi structure", () => {
  it("builds the documented target example from `resources`", async () => {
    const api = defineMockApi({
      resources: {
        users: {
          type: "users-mock",
          slice: 20,
          readOnly: true,
          operations: { getById: true, getBySlug: false },
        },
        products: {
          type: "products-mock",
          pagination: true,
          operations: { delete: false },
        },
      },
    });

    const user = await api.users.getById("1");
    expect(user.id).toBe("1");
    expect(await api.users.getAll()).toHaveLength(20);
    expectTypeOf(user.email).toBeString();

    const page = await api.products.getAll({ page: 1, pageSize: 5 });
    expect(page.data).toHaveLength(5);
    expectTypeOf(page).toEqualTypeOf<Page<(typeof page)["data"][number]>>();

    // readOnly removes the write builtins, getBySlug: false removes that read builtin.
    expect(Object.keys(api.users)).not.toContain("create");
    expect(Object.keys(api.users)).not.toContain("getBySlug");
    expect(Object.keys(api.products)).not.toContain("delete");
    expect(Object.keys(api.products)).toContain("create");

    // @ts-expect-error `delete` is disabled on products
    api.products.delete;
    // @ts-expect-error `create` is removed by readOnly
    api.users.create;
    // @ts-expect-error `getBySlug` is disabled on users
    api.users.getBySlug;
  });

  it("keeps the flat compatibility form working", async () => {
    const api = defineMockApi({
      users: "users-mock",
      products: { type: "products-mock", pagination: true, operations: { delete: false } },
    });
    expect((await api.users.getAll()).length).toBeGreaterThan(0);
    expect((await api.products.getAll({ page: 2, pageSize: 3 })).page).toBe(2);
    expect(Object.keys(api.products)).not.toContain("delete");
    // @ts-expect-error disabled in the flat form too
    api.products.delete;
  });

  it("rejects unknown keys at root and resource level (types and runtime)", () => {
    expect(() =>
      defineMockApi({
        // @ts-expect-error unknown root option
        nope: true,
        resources: { users: { type: "users-mock" } },
      }),
    ).toThrow(MockApiError);
    expect(() =>
      defineMockApi({
        resources: {
          // @ts-expect-error unknown resource option
          users: { type: "users-mock", handlers: {} },
        },
      }),
    ).toThrow(/unsupported option "handlers"/);
    expect(() =>
      defineMockApi({
        // @ts-expect-error unknown dataset id
        resources: { users: { type: "nope-mock" } },
      }),
    ).toThrow(/unknown dataset/);
  });

  it("rejects HTTP-shaped operation forms in a standalone mock", () => {
    expect(() =>
      defineMockApi({
        resources: {
          // @ts-expect-error { method, path } needs HTTP; not supported locally
          users: { type: "users-mock", operations: { archive: { method: "POST" } } },
        },
      }),
    ).toThrow(/not supported by a standalone mock/);
  });
});

describe("root settings and precedence", () => {
  it("root readOnly applies to every resource; a resource can override it", () => {
    const api = defineMockApi({
      readOnly: true,
      resources: {
        users: { type: "users-mock" },
        products: { type: "products-mock", readOnly: false },
      },
    });
    expect(Object.keys(api.users)).not.toContain("create");
    expect(Object.keys(api.products)).toContain("create");

    // @ts-expect-error removed by the root readOnly
    api.users.delete;
    expectTypeOf(api.products.delete).toBeFunction();
  });

  it("root defaultOperations: false starts empty; groups and operations opt in", async () => {
    const api = defineMockApi({
      defaultOperations: false,
      operationGroups: { read: true },
      resources: {
        users: { type: "users-mock", operations: { count: false } },
        products: {
          type: "products-mock",
          operationGroups: { read: false },
          operations: { getAll: true },
        },
      },
    });
    expect(Object.keys(api.users)).not.toContain("create");
    expect(Object.keys(api.users)).not.toContain("count");
    expect(Object.keys(api.users)).toContain("getById");
    expect(Object.keys(api.products)).toEqual(["getAll"]);
    expect((await api.products.getAll()).length).toBeGreaterThan(0);

    // @ts-expect-error not enabled by any group
    api.users.create;
    // @ts-expect-error count: false beats the read group
    api.users.count;
    // @ts-expect-error the resource turned the read group off
    api.products.getById;
  });

  it("groups merge per group: a resource overrides only the groups it names", () => {
    const api = defineMockApi({
      operationGroups: { many: false, extended: false },
      resources: {
        users: { type: "users-mock", operationGroups: { many: true } },
      },
    });
    const keys = Object.keys(api.users);
    expect(keys).toContain("getMany");
    expect(keys).toContain("createMany");
    expect(keys).not.toContain("search");
    expect(keys).toContain("getAll");
  });

  it("validates the root settings", () => {
    expect(() =>
      defineMockApi({
        readOnly: true,
        // @ts-expect-error readOnly and writeOnly cannot both be true
        writeOnly: true,
        resources: { users: { type: "users-mock" } },
      }),
    ).toThrow(/cannot both be true/);
    expect(() =>
      defineMockApi({
        // @ts-expect-error unknown group
        operationGroups: { nope: true },
        resources: { users: { type: "users-mock" } },
      }),
    ).toThrow(/unknown operation group/);
  });
});

describe("typed operations", () => {
  it("types every enabled builtin from the dataset", async () => {
    const api = defineMockApi({
      resources: { users: { type: "users-mock", operations: { getMany: true } } },
    });
    const many = await api.users.getMany(["1", "2"]);
    expect(many.map((row) => row.id)).toEqual(["1", "2"]);
    expectTypeOf(many[0]!.email).toBeString();

    expect(await api.users.exists("1")).toBe(true);
    expect(await api.users.count()).toBeGreaterThan(0);
    expect((await api.users.findFirst({ username: "nobody" }))?.id).toBeUndefined();
    expectTypeOf(api.users.exists).returns.resolves.toBeBoolean();
    expectTypeOf(api.users.count).returns.resolves.toBeNumber();
    expectTypeOf(api.users.deleteMany).parameter(0).toEqualTypeOf<(string | number)[]>();
  });

  it("returns a plain list without pagination and a typed page with it", async () => {
    const api = defineMockApi({
      resources: {
        users: { type: "users-mock", slice: 3 },
        products: { type: "products-mock", pagination: true },
      },
    });
    expectTypeOf(api.users.getAll).parameters.toEqualTypeOf<[]>();
    expectTypeOf(await api.users.getAll()).toBeArray();
    const page = await api.products.getAll({ pageSize: 2 });
    expect(page).toMatchObject({ pageSize: 2, page: 1, previous: null });
    expectTypeOf(page.total).toBeNumber();
    expectTypeOf(page.next).toEqualTypeOf<number | null>();
  });

  it("gives a builtin override a typed ctx and typed arguments, no annotations", async () => {
    const api = defineMockApi({
      resources: {
        users: {
          type: "users-mock",
          operations: {
            getById: async (ctx, id) => {
              expectTypeOf(id).toEqualTypeOf<string | number>();
              expectTypeOf(ctx).toEqualTypeOf<MockOperationContext<(typeof rows)[number]>>();
              const rows = await ctx.rows();
              const found = rows.find((row) => row.id === id);
              if (!found) throw ctx.fail("NOT_FOUND", "nope");
              return { ...found, name: found.name.toUpperCase() };
            },
          },
        },
      },
    });
    const user = await api.users.getById("1");
    expect(user.name).toBe(user.name.toUpperCase());
    expectTypeOf(user.name).toBeString();
    await expect(api.users.getById("missing")).rejects.toThrow(MockApiError);
  });

  it("infers custom operation arguments and returns from the handler", async () => {
    const api = defineMockApi({
      resources: {
        users: {
          type: "users-mock",
          operations: {
            total: async (ctx) => (await ctx.rows()).length,
            byEmail: async (ctx, email: string) =>
              (await ctx.rows()).find((r) => r.email === email),
            withDefaults: async (ctx, id: string) => ctx.defaults.getById(id),
          },
        },
      },
    });
    const total = await api.users.total();
    expectTypeOf(total).toBeNumber();
    expect(total).toBeGreaterThan(0);

    const first = (await api.users.getAll())[0]!;
    const found = await api.users.byEmail(first.email);
    expect(found?.id).toBe(first.id);
    expectTypeOf(found).toEqualTypeOf<typeof first | undefined>();
    expect((await api.users.withDefaults(first.id)).id).toBe(first.id);

    // @ts-expect-error the handler declares `email: string`
    api.users.byEmail(1);
    // @ts-expect-error `total` takes no arguments
    api.users.total("x");
  });

  it("a custom operation may be sync and may disable a builtin it replaces", async () => {
    const api = defineMockApi({
      resources: {
        users: {
          type: "users-mock",
          operations: { ping: () => "pong", delete: false },
        },
      },
    });
    expect(await api.users.ping()).toBe("pong");
    expectTypeOf(api.users.ping).returns.resolves.toBeString();
  });

  it("rejects `true` for a name that is not a builtin", () => {
    expect(() =>
      defineMockApi({
        resources: {
          // @ts-expect-error `true` cannot create a custom operation
          users: { type: "users-mock", operations: { archive: true } },
        },
      }),
    ).toThrow(/unknown builtin operation "archive"/);
  });
});

describe("isolation", () => {
  it("keeps state per client and per resource", async () => {
    const config = { resources: { users: { type: "users-mock", slice: 2 } } } as const;
    const a = defineMockApi(config);
    const b = defineMockApi(config);
    await a.users.create({ name: "N", email: "n@x.io", username: "n", companyId: "1" });
    expect(await a.users.getAll()).toHaveLength(3);
    expect(await b.users.getAll()).toHaveLength(2);
  });
});
