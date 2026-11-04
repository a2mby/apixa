import { clearDefineApiProcessors, defineApi } from "@apixa/core";
import {
  defineMockApi,
  disableResourceMocks,
  enableResourceMocks,
  MockApiError,
  type MockOperationContext,
} from "@apixa/mocking";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  enableResourceMocks();
});

afterEach(() => {
  disableResourceMocks();
  clearDefineApiProcessors();
});

describe("defineMockApi: operations customization (v0.10.0)", () => {
  it("removes a builtin when set to false", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { delete: false } },
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

  it("getBySlug finds a record by its slug field", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { getBySlug: true } },
    });
    const anyUsers = api.users as any;

    const created = await api.users.create({
      name: "Ada",
      email: "ada@example.com",
      username: "ada",
      companyId: "1",
      slug: "ada-lovelace",
    } as never);

    const found = await anyUsers.getBySlug("ada-lovelace");
    expect(found.id).toBe(created.id);

    await expect(anyUsers.getBySlug("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getBy is a general lookup by any field name", async () => {
    const api = defineMockApi({ users: "users-mock" });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    const target = all[0]!;
    const found = await anyUsers.getBy("username", target.username);
    expect(found.id).toBe(target.id);

    await expect(anyUsers.getBy("username", "no-such-username")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("search filters rows by substring match across the given fields", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", operations: { search: true } },
    });
    const anyUsers = api.users as any;

    const all = await api.users.getAll();
    const target = all[0]!;
    const results = await anyUsers.search({ name: target.name });
    expect(results.every((row: { name: string }) => row.name === target.name)).toBe(true);
    expect(results.some((row: { id: string }) => row.id === target.id)).toBe(true);
  });

  it("bulkCreate and bulkDelete operate on many records in one call", async () => {
    const api = defineMockApi({
      users: {
        type: "users-mock",
        operations: { bulkCreate: true, bulkDelete: true },
      },
    });
    const anyUsers = api.users as any;

    const created = await anyUsers.bulkCreate([
      { name: "A", email: "a@example.com", username: "a", companyId: "1" },
      { name: "B", email: "b@example.com", username: "b", companyId: "1" },
    ]);
    expect(created).toHaveLength(2);

    await anyUsers.bulkDelete(created.map((row: { id: string }) => row.id));

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
    expect(await anyUsers.findFirst({ name: all[0]!.name })).toMatchObject({ id: all[0]!.id });
    expect(await anyUsers.findFirst({ name: "no-such-name" })).toBeNull();
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
    // Operation generation (Core's resource-client pipeline) is transport-agnostic: a
    // `mock: "<id>"` resource gets exactly the same `operations` surface as a live one —
    // `mock` only swaps the transport, not which methods exist.
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: "users-mock",
        operations: { patch: {}, count: {}, search: {}, exists: {} },
      },
    });

    expect(typeof api.users.patch).toBe("function");
    expect(typeof api.users.count).toBe("function");

    // `patch` reuses the already-supported `/:id` route (the generic mock REST store already
    // treats PATCH as a merge, same as `update`), so it works against the mock bridge for free.
    const all = await api.users.getAll();
    const first = (all as Array<{ id: string; name: string }>)[0]!;
    const patched = await api.users.patch(first.id, { name: "Patched" });
    expect((patched as { name: string }).name).toBe("Patched");

    // `count` / `search` are simulated by the mock bridge too (v0.11.0) — closing the gap where
    // these previously 404'd against it; `getBySlug` / `bulkCreate` / `bulkDelete` get the same
    // treatment, same as `defineMockApi` already offered.
    expect(await api.users.count()).toBe(100);
    const matches = (await api.users.search({ query: { username: "user001" } })) as Array<{
      username: string;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]!.username).toBe("user001");

    // `exists` is composed over `getById`, which already reaches the mock bridge for free.
    expect(await api.users.exists(first.id)).toBe(true);
    expect(await api.users.exists("no-such-id")).toBe(false);
  });

  it('simulates getBySlug, bulkCreate, and bulkDelete on a Core mock: "<dataset-id>" resource', async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      companies: {
        path: "/companies",
        mock: "companies-mock",
        operations: { getBySlug: {}, bulkCreate: {}, bulkDelete: {} },
      },
    });

    const before = (await api.companies.getAll()) as Array<{ id: string }>;

    const created = (await (api.companies as any).bulkCreate([
      { name: "Acme", slug: "acme" },
      { name: "Globex", slug: "globex" },
    ])) as Array<{ id: string; slug: string }>;
    expect(created).toHaveLength(2);

    const bySlug = await (api.companies as any).getBySlug("acme");
    expect((bySlug as { slug: string }).slug).toBe("acme");

    await (api.companies as any).bulkDelete(created.map((c) => c.id));
    const after = (await api.companies.getAll()) as Array<{ id: string }>;
    expect(after).toHaveLength(before.length);
  });

  it('never leaks a live store reference through a Core mock: "<dataset-id>" resource', async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: { path: "/users", mock: "users-mock" },
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
