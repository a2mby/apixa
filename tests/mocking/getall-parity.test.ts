import "../../packages/mocking/src/register.js";
import { defineApi, resetMock } from "@apixa/core";
import { defineMockApi } from "@apixa/mocking";
import { describe, expect, it } from "vitest";

/** The same dataset behind both APIs; every assertion compares them, not hard-coded output. */
function pair(
  options: { pagination?: "page" | "cursor"; slice?: number | { start: number; end: number } } = {},
) {
  const core = defineApi({
    baseURL: "https://x.dev",
    resources: { users: { path: "/users", mock: "users-mock", ...options } },
  }).users;
  const mock = defineMockApi({ users: { type: "users-mock", ...options } }).users;
  return { core, mock };
}

describe("getAll: defineMockApi follows the Core mocked contract", () => {
  it("returns the same plain list, filters, id filters and array filters", async () => {
    const { core, mock } = pair();
    expect(await mock.getAll()).toEqual(await core.getAll());
    for (const query of [{ companyId: "1" }, { id: ["3", "1"] }, { companyId: ["1", "2"] }]) {
      expect(await mock.getAll(query as never)).toEqual(await core.getAll({ query }));
    }
    expect((await mock.getAll({ companyId: "1" })).length).toBeGreaterThan(0);
    expect(await mock.getAll({ companyId: "no-such" } as never)).toEqual([]);
  });

  it("page pagination: same envelope, out-of-range page, empty result", async () => {
    const { core, mock } = pair({ pagination: "page" });
    for (const query of [
      undefined,
      { page: 2, pageSize: 10 },
      { page: 10, pageSize: 10 },
      { page: 11, pageSize: 10 },
      { page: 99 },
      { companyId: "1", pageSize: 3 },
      { companyId: "no-such" },
    ]) {
      expect(await mock.getAll(query as never)).toEqual(await core.getAll({ query }));
    }
    expect(Object.keys((await mock.getAll()) as object).sort()).toEqual([
      "data",
      "page",
      "pageSize",
      "total",
    ]);
  });

  it("cursor pagination matches too", async () => {
    const { core, mock } = pair({ pagination: "cursor" });
    for (const query of [
      { pageSize: 30 },
      { cursor: 30, pageSize: 30 },
      { cursor: 90, pageSize: 30 },
    ]) {
      expect(await mock.getAll(query as never)).toEqual(await core.getAll({ query }));
    }
  });

  it("invalid paging values fail with the same cause", async () => {
    const { core, mock } = pair({ pagination: "page" });
    for (const query of [{ page: 0 }, { pageSize: -1 }, { page: "x" }]) {
      await expect(core.getAll({ query } as never)).rejects.toMatchObject({
        code: "MOCK_INVALID_INPUT",
      });
      await expect(mock.getAll(query as never)).rejects.toMatchObject({
        code: "INVALID_PAGINATION",
      });
    }
  });

  it("slice caps the list result only; count, lookups and writes ignore it", async () => {
    const slice = { start: 2, end: 5 };
    const { core, mock } = pair({ slice });
    expect(await mock.getAll()).toEqual(await core.getAll());
    expect((await mock.getAll()).map((u) => u.id)).toEqual(["3", "4", "5"]);
    expect(await mock.count()).toBe(100);
    expect(await mock.count()).toBe(await core.count());
    expect((await mock.getById("50")).id).toBe("50");
    const created = await mock.create({ name: "n", email: "e", username: "u", companyId: "1" });
    expect(created.id).toBe("101");
    expect((await mock.getAll()).map((u) => u.id)).toEqual(["3", "4", "5"]);
  });

  it("count, search and findFirst agree on the same query", async () => {
    const { core, mock } = pair();
    expect(await mock.count({ companyId: "1" })).toBe(
      await core.count({ query: { companyId: "1" } }),
    );
    expect(await mock.search({ name: "an" })).toEqual(await core.search({ query: { name: "an" } }));
    expect(await mock.findFirst({ companyId: "2" })).toEqual(
      await core.findFirst({ companyId: "2" }),
    );
  });

  it("reset restores the seeded state on both", async () => {
    const { core, mock } = pair();
    await core.delete("1");
    await mock.delete("1");
    expect(await core.count()).toBe(99);
    expect(await mock.count()).toBe(99);
    resetMock(core);
    // Adapter reset now resolves the same client-scoped lifecycle as Core.
    resetMock(mock);
    expect(await mock.count()).toBe(100);
    expect(await core.count()).toBe(100);
    expect(await defineMockApi({ users: "users-mock" }).users.count()).toBe(100);
  });

  it("both use the one shared engine (no second implementation)", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../packages/mocking/src/resource.ts", import.meta.url), "utf8"),
    );
    const client = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../packages/mocking/src/mock-api.ts", import.meta.url), "utf8"),
    );
    expect(client).toMatch(/defineApi\(/);
    expect(source).not.toMatch(/new MockStore/);
    expect(source).not.toMatch(/Math\.ceil|lastPage|pageSize \*/);
  });
});
