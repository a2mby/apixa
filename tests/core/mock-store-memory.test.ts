import { defineApi, MockStore, resetMock } from "@apixa/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `u${i}`, tags: ["a"] }));

const store = (data: unknown[], immutable = false) =>
  new MockStore({ label: "m", idKey: "id", load: () => data, immutable });

afterEach(() => vi.restoreAllMocks());

describe("paginated reads copy only the returned page", () => {
  it("clones the page, not the dataset", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", mock: rows(2000), pagination: "page" } },
    }).users;
    await api.getById("1"); // load + seed first
    const spy = vi.spyOn(globalThis, "structuredClone");
    const page = await api.getAll({ query: { page: 3, pageSize: 20 } });
    expect(page.data).toHaveLength(20);
    expect(page.total).toBe(2000);
    expect(page.data[0]).toMatchObject({ id: "41" });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it("filtered pages copy only the page too, and keep total and order", async () => {
    const data = rows(500).map((r, i) => ({ ...r, group: i % 5 === 0 ? "x" : "y" }));
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", mock: data, pagination: "page" } },
    }).users;
    await api.getById("1");
    const spy = vi.spyOn(globalThis, "structuredClone");
    const page = await api.getAll({ query: { group: "x", page: 2, pageSize: 10 } });
    expect(page.total).toBe(100);
    expect(page.data.map((r) => r.id)).toEqual(
      data
        .filter((r) => r.group === "x")
        .slice(10, 20)
        .map((r) => r.id),
    );
    expect(spy.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("returned rows are copies: editing them never reaches the store", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", mock: rows(30), pagination: "page" } },
    }).users;
    const page = await api.getAll();
    page.data[0]!.name = "HACKED";
    (page.data[0] as { tags: string[] }).tags.push("z");
    expect(await api.getById("1")).toEqual({ id: "1", name: "u0", tags: ["a"] });
    const list = await api.getAll({ query: { page: 1, pageSize: 5 } });
    expect(list.data[0]).toEqual({ id: "1", name: "u0", tags: ["a"] });
  });
});

describe("working rows share objects with the seed until a write replaces them", () => {
  it("writes never touch the seed or the caller's source array", async () => {
    const source = rows(5);
    const frozen = JSON.stringify(source);
    const s = store(source);
    await s.ready();
    s.update("1", { name: "U" });
    s.patch("2", { name: "P" });
    s.upsert("3", { name: "S" });
    s.delete("4");
    s.create({ name: "new" });
    s.deleteMany(["5"]);
    expect(JSON.stringify(source)).toBe(frozen);
    expect(s.list().map((r) => r.name)).toEqual(["U", "P", "S", "new"]);
    s.reset();
    expect(s.list()).toEqual(source);
    expect(s.list()).not.toBe(source);
  });

  it("an immutable source is shared by many stores and stays pristine", async () => {
    const shared = rows(50);
    const frozen = JSON.stringify(shared);
    const a = store(shared, true);
    const b = store(shared, true);
    await Promise.all([a.ready(), b.ready()]);
    a.delete("1");
    a.patch("2", { name: "A-only" });
    expect(b.count()).toBe(50);
    expect(b.get("2").name).toBe("u1");
    expect(JSON.stringify(shared)).toBe(frozen);
    a.reset();
    expect(a.get("2").name).toBe("u1");
  });

  it("liveRows() hands out private rows: in-place edits stay out of the seed and survive reset correctly", async () => {
    const shared = rows(3);
    const frozen = JSON.stringify(shared);
    const a = store(shared, true);
    const b = store(shared, true);
    await Promise.all([a.ready(), b.ready()]);
    const live = a.liveRows();
    live[0]!.name = "edited in place";
    live.push({ id: "99", name: "added" });
    a.reindex();
    expect(a.get("1").name).toBe("edited in place");
    expect(a.get("99").name).toBe("added");
    expect(b.get("1").name).toBe("u0");
    expect(JSON.stringify(shared)).toBe(frozen);
    a.reset();
    expect(a.get("1").name).toBe("u0");
    expect(a.exists("99")).toBe(false);
  });

  it("two clients over one inline array stay isolated and reset independently", async () => {
    const data = rows(10);
    const mk = () =>
      defineApi({
        baseURL: "https://x.dev",
        resources: { users: { path: "/users", mock: data } },
      });
    const one = mk();
    const two = mk();
    await one.users.delete("1");
    await one.users.patch("2", { body: { name: "one" } });
    expect(await two.users.count()).toBe(10);
    expect((await two.users.getById("2")).name).toBe("u1");
    resetMock(one);
    expect(await one.users.count()).toBe(10);
  });

  it("a caller mutating the inline source after first use does not leak into the store", async () => {
    const data = rows(3);
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: { users: { path: "/users", mock: data } },
    }).users;
    await api.getAll();
    data[0]!.name = "mutated";
    data.push({ id: "x", name: "x", tags: [] });
    expect((await api.getById("1")).name).toBe("u0");
    expect(await api.count()).toBe(3);
    resetMock(api);
    expect((await api.getById("1")).name).toBe("u0");
  });

  it("ids generated after deletes are never reused, also after a shared reset", async () => {
    const s = store(rows(3), true);
    await s.ready();
    s.delete("3");
    expect(s.create({ name: "a" }).id).toBe("4");
    s.reset();
    expect(s.create({ name: "b" }).id).toBe("4");
  });
});
