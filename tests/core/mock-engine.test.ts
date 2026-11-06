import "../../packages/mocking/src/register.js";
import {
  ConfigError,
  defineApi,
  isMockError,
  MockError,
  resetMock,
  type Transport,
  type TransportRequest,
} from "@apixa/core";
import { users as usersDataset } from "@apixa/mocking/data";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

/** A transport that fails the test if anything reaches it. */
function forbiddenTransport(hits: TransportRequest[] = []): Transport {
  return {
    async request(input) {
      hits.push(input);
      throw new Error(
        `network must not be used for mocked resources: ${input.method} ${input.url}`,
      );
    },
  };
}

const inline = () => [
  { id: 1, name: "Ali", email: "ali@example.com" },
  { id: 2, name: "Omar", email: "omar@example.com" },
  { id: 3, name: "Sara", email: "sara@example.com" },
];

describe("mock data sources", () => {
  it('mock: "users-mock" loads the named dataset lazily with catalog types', async () => {
    const api = defineApi({
      baseURL: "https://example.com/v1",
      transport: forbiddenTransport(),
      resources: { users: { path: "/users", mock: "users-mock" } },
    });
    const all = await api.users.getAll();
    expect(all).toEqual(usersDataset);
    expectTypeOf(api.users.getById).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(all[0]!).toHaveProperty("username").toEqualTypeOf<string>();
  });

  it("mock: inline array infers widened entity types and number ids", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: inline() } },
    });
    const user = await api.users.getById(2);
    expectTypeOf(user).toEqualTypeOf<{ id: number; name: string; email: string }>();
    expect(user).toEqual({ id: 2, name: "Omar", email: "omar@example.com" });
    expectTypeOf(api.users.create)
      .parameter(0)
      .toEqualTypeOf<{ name: string; email: string; id?: number }>();
  });

  it("mock: lazy provider loads on first use only, once, even under concurrency", async () => {
    const provider = vi.fn(async () => inline());
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: provider } },
    });
    expect(provider).not.toHaveBeenCalled();
    const [a, b, c] = await Promise.all([
      api.users.getAll(),
      api.users.count(),
      api.users.getById(1),
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(a).toHaveLength(3);
    expect(b).toBe(3);
    expect(c.name).toBe("Ali");
    expectTypeOf(a).toEqualTypeOf<{ id: number; name: string; email: string }[]>();
  });

  it("a synchronous provider works too", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: () => inline() } },
    });
    expect(await api.users.count()).toBe(3);
  });

  it("a failed provider load reports the cause and is retried on the next call", async () => {
    let calls = 0;
    const api = defineApi({
      baseURL: "/api",
      resources: {
        users: {
          path: "/users",
          mock: async () => {
            calls += 1;
            if (calls === 1) throw new Error("disk on fire");
            return inline();
          },
        },
      },
    });
    const error = await api.users.getAll().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockError);
    expect(error).toMatchObject({
      code: "MOCK_LOAD",
      message: expect.stringMatching(/disk on fire/),
    });
    expect(await api.users.getAll()).toHaveLength(3);
    expect(calls).toBe(2);
  });

  it("advanced { data, idKey, seed } uses a custom identity and a seed window", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: {
        sessions: {
          path: "/sessions",
          mock: {
            data: [
              { uuid: "a1", user_id: 1, active: true },
              { uuid: "b2", user_id: 2, active: false },
              { uuid: "c3", user_id: 3, active: true },
            ],
            idKey: "uuid",
            seed: { limit: 2 },
          },
        },
      },
    });
    expect(await api.sessions.getById("b2")).toMatchObject({ user_id: 2 });
    expect(await api.sessions.count()).toBe(2);
    expectTypeOf(api.sessions.getById).parameter(0).toEqualTypeOf<string>();
    // the seed limit is not a cap: creates grow the store
    await api.sessions.create({ uuid: "d4", user_id: 4, active: true });
    expect(await api.sessions.count()).toBe(3);
  });

  it("rejects duplicate and missing ids in inline data at construction", () => {
    expect(() =>
      defineApi({
        baseURL: "/api",
        resources: { u: { path: "/u", mock: [{ id: 1 }, { id: 1 }] } },
      }),
    ).toThrow(/duplicate id "1"/);
    expect(() =>
      defineApi({
        baseURL: "/api",
        resources: { u: { path: "/u", mock: [{ id: 1 }, { name: "x" }] as never } },
      }),
    ).toThrow(/missing identity field "id"/);
    expect(() =>
      defineApi({
        baseURL: "/api",
        resources: { u: { path: "/u", mock: { data: [{ id: 1 }], idKey: "uuid" } as never } },
      }),
    ).toThrow(ConfigError);
  });

  it("rejects duplicate ids returned by a provider when it loads", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { u: { path: "/u", mock: async () => [{ id: 1 }, { id: 1 }] } },
    });
    await expect(api.u.getAll()).rejects.toThrow(/duplicate id "1"/);
  });
});

describe("mock state lifecycle", () => {
  it("subsequent reads see writes; source arrays are never mutated", async () => {
    const source = inline();
    const snapshot = structuredClone(source);
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: source } },
    });
    const created = await api.users.create({ name: "New", email: "n@example.com" });
    expect(created.id).toBe(4);
    await api.users.patch(1, { name: "Ali 2" });
    await api.users.delete(2);
    expect((await api.users.getAll()).map((u) => u.name)).toEqual(["Ali 2", "Sara", "New"]);
    expect(source).toEqual(snapshot);
  });

  it("two clients from the same config have isolated stores", async () => {
    const config = {
      baseURL: "/api",
      resources: { users: { path: "/users", mock: inline() } },
    } as const;
    const a = defineApi(config);
    const b = defineApi(config);
    await a.users.delete(1);
    expect(await a.users.count()).toBe(2);
    expect(await b.users.count()).toBe(3);
  });

  it("resetMock restores the seeded state for one resource or a whole client", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: {
        users: { path: "/users", mock: inline() },
        posts: { path: "/posts", mock: [{ id: "p1" }] },
      },
    });
    await api.users.deleteMany([1, 2, 3]);
    await api.posts.create({ id: "p2" });
    resetMock(api.users);
    expect(await api.users.count()).toBe(3);
    expect(await api.posts.count()).toBe(2);
    resetMock(api);
    expect(await api.posts.count()).toBe(1);
  });

  it("returns copies — callers cannot mutate stored records", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: inline() } },
    });
    const first = await api.users.getById(1);
    first.name = "changed";
    expect((await api.users.getById(1)).name).toBe("Ali");
  });
});

describe("mock builtins", () => {
  const make = () =>
    defineApi({
      baseURL: "https://example.com/v1",
      transport: forbiddenTransport(),
      resources: { users: { path: "/users", mock: inline() } },
    });

  it("getMany returns only requested ids, in request order, skipping missing ones", async () => {
    const api = make();
    expect((await api.users.getMany([3, 1, 99, 3])).map((u) => u.id)).toEqual([3, 1]);
  });

  it("exists inspects the store directly", async () => {
    const api = make();
    expect(await api.users.exists(1)).toBe(true);
    expect(await api.users.exists(42)).toBe(false);
  });

  it("findFirst uses exact matching; search uses case-insensitive substrings", async () => {
    const api = make();
    expect(await api.users.findFirst({ name: "Omar" })).toMatchObject({ id: 2 });
    expect(await api.users.findFirst({ name: "omar" })).toBeNull();
    expect((await api.users.search({ query: { name: "a" } })).map((u) => u.id)).toEqual([1, 2, 3]);
    expect((await api.users.search({ query: { email: "SARA" } })).map((u) => u.id)).toEqual([3]);
  });

  it("count filters exactly; getBy and getBySlug look up by field", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: {
        posts: {
          path: "/posts",
          mock: [
            { id: 1, slug: "hello", tag: "a" },
            { id: 2, slug: "world", tag: "b" },
          ],
        },
      },
    });
    expect(await api.posts.count({ query: { tag: "a" } })).toBe(1);
    expect(await api.posts.getBy("tag", "b")).toMatchObject({ id: 2 });
    expect(await api.posts.getBySlug("hello")).toMatchObject({ id: 1 });
  });

  it("update replaces, patch merges, upsert inserts or replaces", async () => {
    const api = make();
    expect(await api.users.update(1, { name: "X", email: "x@x" })).toEqual({
      id: 1,
      name: "X",
      email: "x@x",
    });
    expect(await api.users.patch(2, { name: "Y" })).toEqual({
      id: 2,
      name: "Y",
      email: "omar@example.com",
    });
    expect(await api.users.upsert(9, { name: "Z", email: "z@z" })).toEqual({
      id: 9,
      name: "Z",
      email: "z@z",
    });
    expect(await api.users.upsert(9, { name: "Z2", email: "z@z" })).toMatchObject({ name: "Z2" });
  });

  it("createMany is atomic on duplicates; deleteMany ignores missing ids", async () => {
    const api = make();
    await expect(
      api.users.createMany([
        { name: "a", email: "a" },
        { id: 1, name: "dup", email: "d" },
      ]),
    ).rejects.toMatchObject({
      code: "MOCK_DUPLICATE_ID",
      status: 409,
    });
    expect(await api.users.count()).toBe(3);
    const created = await api.users.createMany([
      { name: "a", email: "a" },
      { name: "b", email: "b" },
    ]);
    expect(created.map((u) => u.id)).toEqual([4, 5]);
    await api.users.deleteMany([4, 5, 404]);
    expect(await api.users.count()).toBe(3);
  });

  it("missing records and invalid ids produce consistent mock errors", async () => {
    const api = make();
    const missing = await api.users.getById(404).catch((e: unknown) => e);
    expect(isMockError(missing)).toBe(true);
    expect(missing).toMatchObject({ code: "MOCK_NOT_FOUND", status: 404 });
    await expect(api.users.delete(404)).rejects.toMatchObject({ code: "MOCK_NOT_FOUND" });
    await expect(api.users.getById("" as never)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(api.users.create("nope" as never)).rejects.toMatchObject({
      code: "MOCK_INVALID_INPUT",
    });
  });
});

describe("mock routing never falls back to the network", () => {
  it("baseURL prefixes (/v1), overridden paths, and custom operations stay in memory", async () => {
    const hits: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://example.com/v1",
      transport: forbiddenTransport(hits),
      resources: {
        users: {
          path: "/users",
          mock: "users-mock",
          operations: {
            search: { path: "/custom-search", method: "POST" },
            count: { path: "https://example.com/stats/count" },
            archive: { method: "POST", path: "/:id/archive" },
            byName: (ctx, name: string) => ctx.request({ method: "GET", query: { name } }),
          },
        },
      },
    });
    expect(await api.users.getAll()).toHaveLength(100);
    // POST override: the filter travels as the body, and the mock still runs `search` semantics
    expect(await api.users.search({ username: "user001" })).toHaveLength(1);
    expect(await api.users.count()).toBe(100);
    expect(await api.users.byName(usersDataset[0]!.name)).toHaveLength(1);
    const unsupported = await api.users.archive("1", {}).catch((e: unknown) => e);
    expect(unsupported).toMatchObject({ code: "MOCK_UNSUPPORTED", status: 501 });
    expect(hits).toEqual([]);
  });

  it("ctx.request on a mocked resource is simulated or rejected — never sent (spec Example 6)", async () => {
    const hits: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com/v1",
      transport: forbiddenTransport(hits),
      resources: {
        users: {
          path: "/users",
          mock: [{ id: 1, name: "Ali" }],
          operations: {
            getById: async (ctx, id) => ctx.request({ method: "GET", path: `/${String(id)}` }),
            wrongPath: async (ctx, id) =>
              ctx.request({ method: "GET", path: `/users/${String(id)}` }),
            external: async (ctx) => ctx.request({ method: "GET", path: "https://evil.example/x" }),
          },
        },
      },
    });
    expect(await api.users.getById(1)).toEqual({ id: 1, name: "Ali" });
    await expect(api.users.wrongPath(1)).rejects.toMatchObject({ code: "MOCK_UNSUPPORTED" });
    await expect(api.users.external()).rejects.toMatchObject({ code: "MOCK_UNSUPPORTED" });
    expect(hits).toEqual([]);
  });

  it("works in Node with a relative baseURL because no origin is needed", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { users: { path: "/users", mock: inline() } },
    });
    expect(await api.users.count()).toBe(3);
  });
});

describe("mock pagination (shared live/mock contract)", () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, n: i }));

  it('pagination: "page" returns { data, total, page, pageSize }', async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { r: { path: "/r", mock: rows, pagination: "page" } },
    });
    const page = await api.r.getAll({ query: { page: 3, pageSize: 20 } });
    expectTypeOf(page).toEqualTypeOf<{
      data: { id: number; n: number }[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(page).toMatchObject({ total: 45, page: 3, pageSize: 20 });
    expect(page.data.map((r) => r.id)).toEqual([41, 42, 43, 44, 45]);
    expect(await api.r.getAll()).toMatchObject({ page: 1, pageSize: 20, total: 45 });
    await expect(api.r.getAll({ query: { page: 0 } })).rejects.toMatchObject({
      code: "MOCK_INVALID_INPUT",
    });
  });

  it('pagination: "cursor" returns { data, nextCursor }', async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { r: { path: "/r", mock: rows, pagination: "cursor" } },
    });
    const first = await api.r.getAll({ query: { pageSize: 40 } });
    expectTypeOf(first).toEqualTypeOf<{
      data: { id: number; n: number }[];
      nextCursor: string | null;
    }>();
    expect(first.data).toHaveLength(40);
    expect(first.nextCursor).toBe("40");
    const second = await api.r.getAll({ query: { cursor: first.nextCursor!, pageSize: 40 } });
    expect(second.data.map((r) => r.id)).toEqual([41, 42, 43, 44, 45]);
    expect(second.nextCursor).toBeNull();
  });

  it("response slicing is separate from seeding", async () => {
    const api = defineApi({
      baseURL: "/api",
      resources: { r: { path: "/r", mock: rows, slice: 5 } },
    });
    expect(await api.r.getAll()).toHaveLength(5);
    expect(await api.r.count()).toBe(45);
  });
});
