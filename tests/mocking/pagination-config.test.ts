import { MockApiError, defineMockApi } from "apixa";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("defineMockApi pagination strategies", () => {
  it("accepts paginationConfig consistently", async () => {
    const a = defineMockApi({ users: { type: "users-mock", paginationConfig: "page" } });
    const b = defineMockApi({ users: { type: "users-mock", paginationConfig: "page" } });
    const [x, y] = await Promise.all([
      a.users.getAll({ pageSize: 2 }),
      b.users.getAll({ pageSize: 2 }),
    ]);
    expect(x).toEqual(y);
    expect(x).toMatchObject({ page: 1, pageSize: 2 });
  });

  it("rejects supplying both", () => {
    expect(() =>
      defineMockApi({
        // @ts-expect-error the resource alias was removed
        users: { type: "users-mock", paginationConfig: "page", pagination: "page" },
      }),
    ).toThrow(MockApiError);
  });

  it("supports offset pagination with the shared contract and typed result", async () => {
    const api = defineMockApi({ users: { type: "users-mock", paginationConfig: "offset" } });
    const page = await api.users.getAll({ offset: 2, pageSize: 3 });
    expect(page).toMatchObject({ offset: 2, pageSize: 3 });
    expect(page.data).toHaveLength(3);
    expect(page.nextOffset).toBe(5);
    expectTypeOf(page.nextOffset).toEqualTypeOf<number | null>();
    await expect(api.users.getAll({ offset: -1 })).rejects.toMatchObject({
      code: "INVALID_PAGINATION",
    });
  });

  it("rejects slice beside either property", () => {
    expect(() =>
      defineMockApi({ users: { type: "users-mock", paginationConfig: "page", slice: 2 } }),
    ).toThrow(/slice cannot be combined/);
  });

  it("infers Page, CursorPage, and OffsetPage when paginationConfig uses { strategy } object form", async () => {
    const api = defineMockApi({
      pageUsers: { type: "users-mock", seed: { limit: 4 }, paginationConfig: { strategy: "page" } },
      cursorUsers: {
        type: "users-mock",
        seed: { limit: 4 },
        paginationConfig: { strategy: "cursor" },
      },
      offsetUsers: {
        type: "users-mock",
        seed: { limit: 4 },
        paginationConfig: { strategy: "offset" },
      },
    });

    const p = await api.pageUsers.getAll({ page: 1, pageSize: 2 });
    expectTypeOf(p.total).toEqualTypeOf<number>();
    expect(p.data).toHaveLength(2);

    const c = await api.cursorUsers.getAll({ pageSize: 2 });
    expectTypeOf(c.nextCursor).toEqualTypeOf<string | null>();
    expect(c.data).toHaveLength(2);
    expect(c.nextCursor).toBe("2");

    const o = await api.offsetUsers.getAll({ offset: 1, pageSize: 2 });
    expectTypeOf(o.nextOffset).toEqualTypeOf<number | null>();
    expect(o.data).toHaveLength(2);
    expect(o.nextOffset).toBe(3);
  });

  it("accepts Core-style RequestOptions on getAll, count, findFirst, and getMany without treating option keys as row filters", async () => {
    const api = defineMockApi({
      posts: { type: "posts-mock", seed: { limit: 10 }, paginationConfig: "page" },
      users: { type: "users-mock", seed: { limit: 5 } },
    });

    const controller = new AbortController();
    const pageViaOptions = await api.posts.getAll({
      query: { userId: "1" },
      pagination: { page: 1, pageSize: 5 },
      signal: controller.signal,
      headers: { "x-test": "1" },
    });
    const pageViaFlat = await api.posts.getAll({ userId: "1", page: 1, pageSize: 5 });
    expect(pageViaOptions).toEqual(pageViaFlat);
    expect(pageViaOptions.data.length).toBeGreaterThan(0);

    const totalViaOptions = await api.users.count({
      query: { companyId: "1" },
      signal: controller.signal,
    });
    const totalViaFlat = await api.users.count({ companyId: "1" });
    expect(totalViaOptions).toBe(totalViaFlat);
    expect(totalViaOptions).toBeGreaterThan(0);

    const batchSorted = await api.users.getMany(["3", "1", "2"], {
      sortBy: { field: "name", order: "asc" },
      signal: controller.signal,
    });
    expect(batchSorted.map((u) => u.name)).toEqual(
      [...batchSorted.map((u) => u.name)].sort((a, b) => a.localeCompare(b)),
    );

    // Disambiguates RequestOptions with `full: false` or `headers` from flat entity filters
    const firstViaOptions = await api.users.findFirst({
      query: { username: "user001" },
      headers: { "x-trace": "1" },
      full: false,
    });
    const firstViaFlat = await api.users.findFirst({ username: "user001" });
    expect(firstViaOptions).toEqual(firstViaFlat);
    expect(firstViaOptions?.username).toBe("user001");

    if (false as boolean) {
      // @ts-expect-error cursor is not valid on a page-paginated mock resource
      await api.posts.getAll({ cursor: "abc" });
      // @ts-expect-error offset is not valid on a page-paginated mock resource
      await api.posts.getAll({ pagination: { offset: 5 } });
    }
  });
});
