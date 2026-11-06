import { MockStore } from "@apixa/core";
import * as index from "@apixa/mocking";
import * as data from "@apixa/mocking/data";
import usersDefault, { data as usersNamed } from "@apixa/mocking/data/users-mock";
import * as datasets from "@apixa/mocking/datasets";
import { loadDataset, users, type MockUser } from "@apixa/mocking/datasets";
import * as node from "@apixa/mocking/node";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("@apixa/mocking entry points", () => {
  it("keeps the main entry exports", () => {
    for (const name of [
      "defineMockApi",
      "MockApiError",
      "MockingErrors",
      "InvalidSliceError",
      "listDatasetIds",
    ]) {
      expect(index, name).toHaveProperty(name);
    }
    expect(index.listDatasetIds()).toContain("users-mock");
  });

  it("/datasets supports the lazy loader and direct named imports", async () => {
    const loaded = await loadDataset("users-mock");
    expect(loaded).toHaveLength(users.length);
    expect(loaded[0]).toEqual(users[0]);
    expectTypeOf(loaded[0]!.email).toBeString();
    expectTypeOf(users).toEqualTypeOf<readonly MockUser[]>();
    // the lazy loader reaches reference sets that have no eager export
    expect((await loadDataset("countries-csc")).length).toBeGreaterThan(200);
    expect(datasets).not.toHaveProperty("countries");
    await expect(loadDataset("nope" as never)).rejects.toBeInstanceOf(index.MockApiError);
    await expect(loadDataset("nope" as never)).rejects.toMatchObject({ code: "UNKNOWN_DATASET" });
  });

  it("/data is a compatibility re-export of /datasets", () => {
    for (const name of ["users", "products", "companies", "orders", "posts", "comments"]) {
      expect(data[name as keyof typeof data], name).toBe(datasets[name as keyof typeof datasets]);
    }
    for (const name of ["productsDataset", "companiesDataset", "ordersDataset", "postsDataset"]) {
      expect(data, name).toHaveProperty(name);
    }
    expect(usersDefault).toBe(usersNamed);
    expect(usersNamed).toHaveLength(users.length);
  });

  it("keeps the Node filesystem helpers on /node", () => {
    for (const name of [
      "loadDataset",
      "listDatasets",
      "getDataset",
      "findDatasetDirs",
      "resolveDatasetDir",
    ]) {
      expect(typeof node[name as keyof typeof node], name).toBe("function");
    }
  });
});

describe("MockStore copying", () => {
  const records = () => [
    { id: "1", name: "a" },
    { id: "2", name: "b" },
  ];

  it("an immutable source is never mutated and resets to its seeded state", async () => {
    const source = records();
    const store = new MockStore({ label: "m", idKey: "id", load: () => source, immutable: true });
    await store.ready();
    expect(store.liveRows()[0]).not.toBe(source[0]); // working rows are copies
    store.patch("1", { name: "changed" });
    store.delete("2");
    expect(source).toEqual(records()); // source untouched
    store.reset();
    expect(store.list()).toEqual(records());
    expect(store.list()[0]).not.toBe(source[0]);
  });

  it("an inline source keeps a private snapshot, so later input edits don't leak into reset", async () => {
    const source = records();
    const store = new MockStore({ label: "m", idKey: "id", load: () => source });
    await store.ready();
    source[0]!.name = "mutated by caller";
    store.patch("1", { name: "changed" });
    store.reset();
    expect(store.get("1")).toEqual({ id: "1", name: "a" });
  });

  it("applies a seed window to the reset source too", async () => {
    const store = new MockStore({
      label: "m",
      idKey: "id",
      load: () => records(),
      seed: { limit: 1 },
      immutable: true,
    });
    await store.ready();
    store.create({ name: "c" });
    expect(store.list()).toHaveLength(2);
    store.reset();
    expect(store.list()).toEqual([{ id: "1", name: "a" }]);
  });
});
