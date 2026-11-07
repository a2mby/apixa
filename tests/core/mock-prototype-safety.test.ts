import { defineApi, MockStore, resetMock } from "@apixa/core";
import { describe, expect, it } from "vitest";

const api = () =>
  defineApi({
    baseURL: "https://x.dev",
    resources: {
      users: {
        path: "/users",
        mock: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
      },
    },
  });

const evil = (payload: string) => JSON.parse(payload) as Record<string, unknown>;
const PAYLOADS = [
  '{"__proto__":{"isAdmin":"yes"}}',
  '{"constructor":{"prototype":{"isAdmin":"yes"}}}',
  '{"prototype":{"isAdmin":"yes"}}',
  '{"nested":{"deep":[{"__proto__":{"isAdmin":"yes"}}]}}',
];

describe("mock writes reject prototype-changing keys", () => {
  it.each(PAYLOADS)("create/update/patch/upsert/createMany refuse %s", async (payload) => {
    const a = api();
    const calls = [
      () => a.users.create({ id: "9", ...evil(payload) } as never),
      () => a.users.update("1", evil(payload) as never),
      () => a.users.patch("1", evil(payload) as never),
      () => a.users.upsert("7", evil(payload) as never),
      () => a.users.createMany([evil(payload)] as never),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
    }
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(await a.users.getAll()).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]);
    expect(await a.users.getAll({ query: { isAdmin: "yes" } })).toEqual([]);
  });

  it("a rejected bulk write stores nothing", async () => {
    const a = api();
    await expect(
      a.users.createMany([
        { id: "5", name: "ok" },
        evil('{"id":"6","__proto__":{"x":1}}'),
      ] as never),
    ).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
    expect(await a.users.count()).toBe(2);
  });

  it("ordinary nested objects are still fine", async () => {
    const a = api();
    const row = await a.users.patch("1", { profile: { city: "London" } } as never);
    expect(row).toMatchObject({ profile: { city: "London" } });
  });
});

describe("queries read own properties only", () => {
  it("a record cannot match a filter through an inherited field", async () => {
    // `immutable` keeps the source objects as they are, prototype included.
    const row = Object.assign(Object.create({ role: "admin" }) as object, { id: "1", name: "A" });
    const store = new MockStore({ label: "m", idKey: "id", load: () => [row], immutable: true });
    await store.ready();
    expect(store.list({ role: "admin" })).toEqual([]);
    expect(store.count({ role: "admin" })).toBe(0);
    expect(store.search({ role: "adm" })).toEqual([]);
    expect(store.findFirst({ role: "admin" })).toBeNull();
    expect(() => store.getBy("role", "admin")).toThrow(/no record/);
    expect(store.count({ name: "A" })).toBe(1);
  });

  it("reset restores the seeded rows", async () => {
    const a = api();
    await a.users.patch("1", { name: "changed" });
    resetMock(a);
    expect(await a.users.getById("1")).toEqual({ id: "1", name: "A" });
  });
});
