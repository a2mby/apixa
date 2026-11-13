import "../../packages/mocking/src/register.js";
import { defineApi } from "@apixa/core";
import { defineMockApi, MockApiError, type MockOperationContext } from "@apixa/mocking";
import { describe, expect, it } from "vitest";

describe("defineMockApi: operations customization (v0.10.0)", () => {
  it("removes a builtin when set to false", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { delete: false } },
    });

    expect(Object.keys(api.users).sort()).toEqual([
      "count",
      "create",
      "createMany",
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

  it("builtins added in v0.10.0 are present by default, same as the original 6", async () => {
    const api = defineMockApi({ users: "users-mock" });
    const all = await api.users.getAll();
    expect(await (api.users as any).count()).toBe(all.length);
  });

  it("explicit true is a no-op (the default is already on)", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { count: true } },
    });

    const all = await api.users.getAll();
    expect(await (api.users as any).count()).toBe(all.length);
  });

  it("getBy is a general lookup by any field name and returns null when missing", async () => {
    const api = defineMockApi({ users: "users-mock" });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    const target = all[0]!;
    const found = await anyUsers.getBy("username", target.username);
    expect(found.id).toBe(target.id);

    await expect(anyUsers.getBy("username", "no-such-username")).resolves.toBeNull();
  });

  it("createMany and deleteMany operate on many records in one call", async () => {
    const api = defineMockApi({
      users: {
        type: "users-mock",
        operations: { createMany: true, deleteMany: true },
      },
    });
    const anyUsers = api.users as any;

    const created = await anyUsers.createMany([
      { name: "A", email: "a@example.com", username: "a", companyId: "1" },
      { name: "B", email: "b@example.com", username: "b", companyId: "1" },
    ]);
    expect(created).toHaveLength(2);

    await anyUsers.deleteMany(created.map((row: { id: string }) => row.id));

    for (const row of created) {
      await expect(api.users.getById(row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("getMany fetches several records by id in one call", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { getMany: true } },
    });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    const ids = all.slice(0, 2).map((row: { id: string }) => row.id);
    const result = await anyUsers.getMany(ids);
    expect(result.map((row: { id: string }) => row.id).sort()).toEqual([...ids].sort());
  });

  it("exists maps a missing record to false without throwing", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { exists: true } },
    });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    expect(await anyUsers.exists(all[0]!.id)).toBe(true);
    expect(await anyUsers.exists("does-not-exist")).toBe(false);
  });

  it("findFirst returns the first match or null", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { findFirst: true } },
    });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    expect(await anyUsers.findFirst({ query: { name: all[0]!.name } })).toMatchObject({ id: all[0]!.id });
    expect(await anyUsers.findFirst({ query: { name: "no-such-name" } })).toBeNull();
  });

  it("a custom function operation can read and write the resource's in-memory rows", async () => {
    const api = defineMockApi({
      users: {
        type: "users-mock",
        operations: {
          archiveAll: async (ctx: MockOperationContext) => {
            const rows = await ctx.rows();
            for (const row of rows) row.archived = true;
            return rows.length;
          },
        },
      },
    });
    const anyUsers = api.users as any;

    const archivedCount = await anyUsers.archiveAll();
    const all = (await api.users.getAll()) as unknown as Array<{ archived?: boolean }>;
    expect(all.every((row) => row.archived === true)).toBe(true);
    expect(archivedCount).toBe(all.length);
  });

  it("a custom function operation can reuse ctx.defaults instead of reimplementing CRUD", async () => {
    const api = defineMockApi({
      users: {
        type: "users-mock",
        operations: {
          getOrCreate: async (ctx: MockOperationContext, id: string, fallback: unknown) => {
            try {
              return await ctx.defaults.getById(id);
            } catch (error) {
              if (error instanceof MockApiError && error.code === "NOT_FOUND") {
                return ctx.defaults.create({ ...(fallback as object), id });
              }
              throw error;
            }
          },
        },
      },
    });
    const anyUsers = api.users as any;

    const created = await anyUsers.getOrCreate("new-id", {
      name: "New",
      email: "new@example.com",
      username: "new",
      companyId: "1",
    });
    expect(created.id).toBe("new-id");

    const fetchedAgain = await anyUsers.getOrCreate("new-id", { name: "Different" });
    expect(fetchedAgain.id).toBe("new-id");
    expect(fetchedAgain.name).toBe("New");
  });

  it('mirrors the same operations surface on a Core mock: "<dataset-id>" resource', async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          mock: "users-mock",
          operations: { patch: {}, count: {}, findFirst: {}, exists: {} },
        },
      },
    });

    expect(typeof api.users.patch).toBe("function");
    expect(typeof api.users.count).toBe("function");

    const all = await api.users.getAll();
    const first = (all as Array<{ id: string; name: string }>)[0]!;
    const patched = await api.users.patch(first.id, { body: { name: "Patched" } });
    expect((patched as { name: string }).name).toBe("Patched");

    expect(await api.users.count()).toBe(100);
    const match = (await api.users.findFirst({ query: { username: "user001" } })) as {
      username: string;
    } | null;
    expect(match?.username).toBe("user001");

    expect(await api.users.exists(first.id)).toBe(true);
    expect(await api.users.exists("no-such-id")).toBe(false);
  });

  it('simulates getBy, createMany, and deleteMany on a Core mock: "<dataset-id>" resource', async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        companies: {
          path: "/companies",
          mock: "companies-mock",
          operations: { getBy: {}, createMany: {}, deleteMany: {} },
        },
      },
    });

    const before = (await api.companies.getAll()) as Array<{ id: string }>;

    const created = (await (api.companies as any).createMany([
      { name: "Acme", slug: "acme" },
      { name: "Globex", slug: "globex" },
    ])) as Array<{ id: string; slug: string }>;
    expect(created).toHaveLength(2);

    const bySlug = await (api.companies as any).getBy("slug", "acme");
    expect((bySlug as { slug: string }).slug).toBe("acme");

    await (api.companies as any).deleteMany(created.map((c) => c.id));
    const after = (await api.companies.getAll()) as Array<{ id: string }>;
    expect(after).toHaveLength(before.length);
  });

  it('never leaks a live store reference through a Core mock: "<dataset-id>" resource', async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", mock: "users-mock" },
      },
    });

    const first = (await api.users.getAll()) as Array<{ id: string; name: string }>;
    first[0]!.name = "mutated locally";

    const second = (await api.users.getAll()) as Array<{ id: string; name: string }>;
    expect(second[0]!.name).not.toBe("mutated locally");

    const byId = (await api.users.getById(second[0]!.id)) as { name: string };
    byId.name = "mutated via getById";
    const byIdAgain = (await api.users.getById(second[0]!.id)) as { name: string };
    expect(byIdAgain.name).not.toBe("mutated via getById");
  });
});

describe("Core inline mock operation routes", () => {
  it("filters getMany by requested IDs instead of returning the entire mock dataset", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", mock: "users-mock" },
      },
    });
    const all = (await api.users.getAll()) as Array<{ id: string }>;
    const ids = [all[2]!.id, all[4]!.id];
    const selected = (await api.users.getMany(ids)) as Array<{ id: string }>;
    expect(selected.map((row) => row.id)).toEqual(ids);
  });

  it("honors a declarative extended-route path override", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          mock: "users-mock",
          operations: { count: { path: "/stats/count" } },
        },
      },
    });
    expect(await api.users.count()).toBe(100);
  });
});
