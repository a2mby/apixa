import "../../packages/mocking/src/register.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { defineApi } from "@apixa/core";
import { defineMockApi, MockApiError, type MockApiErrorCode, type Page } from "@apixa/mocking";
import {
  users as usersPreset,
  type Comment,
  type Product,
  type User,
} from "@apixa/mocking/datasets";

const datasetsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "datasets");

async function readDataset<T>(path: string): Promise<T[]> {
  return JSON.parse(await readFile(resolve(datasetsRoot, path, "data.json"), "utf8")) as T[];
}

/** Assert a promise (or sync fn) fails with a `MockApiError` carrying `code`. */
async function expectCode(run: () => unknown, code: MockApiErrorCode, message?: RegExp) {
  const error = await Promise.resolve()
    .then(run)
    .then(
      () => undefined,
      (e: unknown) => e,
    );
  expect(error).toBeInstanceOf(MockApiError);
  expect((error as MockApiError).code).toBe(code);
  if (message) expect((error as MockApiError).message).toMatch(message);
}

describe("defineMockApi: configuration", () => {
  it("builds one resource per top-level key with no transport, path, or defineApi()", () => {
    const api = defineMockApi({
      users: { type: "users-mock", seed: { limit: 100 }, pagination: true },
      products: { type: "products-mock", seed: { limit: 50 } },
      countries: { type: "countries-csc" },
    });
    expect(Object.keys(api)).toEqual(["users", "products", "countries"]);
    for (const resource of Object.values(api)) {
      expect(Object.keys(resource).sort()).toEqual(
        [
          "createMany",
          "deleteMany",
          "count",
          "create",
          "delete",
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
        ].sort(),
      );
    }
  });

  it("rejects an invalid top-level config", async () => {
    for (const bad of [null, undefined, "users", 42, [], {}]) {
      await expectCode(() => defineMockApi(bad as never), "INVALID_CONFIG");
    }
  });

  it("rejects unknown and missing dataset ids, listing the available ones", async () => {
    await expectCode(
      () => defineMockApi({ a: { type: "countries" as never } }),
      "UNKNOWN_DATASET",
      /unknown dataset "countries".*users-mock.*products-mock/,
    );
    await expectCode(() => defineMockApi({ a: {} as never }), "UNKNOWN_DATASET", /missing "type"/);
    await expectCode(() => defineMockApi({ a: { type: "toString" as never } }), "UNKNOWN_DATASET");
  });

  it("does not offer datasets that cannot be exposed safely", async () => {
    // >500 KB, and (for the parseapi sets) non-unique id fields.
    for (const type of ["states-csc", "states-parseapi", "counties-parseapi"]) {
      await expectCode(() => defineMockApi({ a: { type: type as never } }), "UNKNOWN_DATASET");
    }
  });

  it("rejects unsupported options such as handlers, path, mock, and mockConfig", async () => {
    for (const option of ["handlers", "path", "baseURL", "mock", "mockConfig"]) {
      await expectCode(
        () => defineMockApi({ a: { type: "users-mock", [option]: true } as never }),
        "INVALID_CONFIG",
        new RegExp(`unsupported option "${option}".*type, slice, seed, pagination, operations`),
      );
    }
    // The compiler rejects them too.
    expect(() =>
      defineMockApi({
        // @ts-expect-error `handlers` is not a supported option
        a: { type: "users-mock", handlers: {} },
      }),
    ).toThrow(MockApiError);
  });

  it("rejects invalid slice and pagination values", async () => {
    for (const size of [-1, 1.5, "10", NaN, Infinity, null]) {
      await expectCode(
        () => defineMockApi({ a: { type: "users-mock", slice: size as never } }),
        "INVALID_SLICE",
        /slice must be a non-negative integer/,
      );
    }
    for (const pagination of ["yes", 1, null]) {
      await expectCode(
        () => defineMockApi({ a: { type: "users-mock", pagination: pagination as never } }),
        "INVALID_CONFIG",
        /pagination must be true, false, "page" or "cursor"/,
      );
    }
    await expectCode(() => defineMockApi({ a: 42 as never }), "INVALID_CONFIG");
  });

  it("accepts a dataset id string as resource shorthand", async () => {
    const api = defineMockApi({ users: "users-mock" });
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<User[]>();
    const rows = await api.users.getAll();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("accepts mixed string and object resources", async () => {
    const api = defineMockApi({
      users: "users-mock",
      products: { type: "products-mock", seed: { limit: 3 }, pagination: true },
    });
    expect(Array.isArray(await api.users.getAll())).toBe(true);
    const page = await api.products.getAll({ page: 1, pageSize: 1 });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 1 });
    expect(page.data).toHaveLength(1);
  });

  it("infers entity, id, and return types from the dataset", () => {
    const api = defineMockApi({
      users: { type: "users-mock", pagination: true },
      products: { type: "products-mock" },
      currencies: { type: "currencies-parseapi" },
      comments: { type: "comments-mock", pagination: true },
      commentsFlat: { type: "comments-mock", pagination: false },
    });
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<Page<User>>();
    expectTypeOf(api.products.getAll).returns.resolves.toEqualTypeOf<Product[]>();
    expectTypeOf(api.products.getById).returns.resolves.toEqualTypeOf<Product>();
    expectTypeOf(api.currencies.getById).returns.resolves.toHaveProperty("symbol");
    expectTypeOf(api.comments.getAll).returns.resolves.toEqualTypeOf<Page<Comment>>();
    expectTypeOf(api.commentsFlat.getAll).returns.resolves.toEqualTypeOf<Comment[]>();
    // create(): the id is optional, every other field is required.
    expectTypeOf(api.products.create).parameter(0).toHaveProperty("title");
    expectTypeOf(api.products.create).parameter(0).not.toEqualTypeOf<Product>();
    // Compile-time only: never called, so nothing runs.
    const _rejected = () => {
      // @ts-expect-error pagination options exist only when `pagination: true`
      void api.products.getAll({ page: 1 });
      // @ts-expect-error wrong field type
      void api.products.create({ title: 1 });
    };
    expect(_rejected).toBeTypeOf("function");
  });

  it("getAll is T[] or Page<T> only — never Page<T> | T[]", () => {
    const api = defineMockApi({
      paged: { type: "users-mock", pagination: true },
      flat: { type: "users-mock" },
      off: { type: "users-mock", pagination: false },
    });
    expectTypeOf(api.paged.getAll).returns.resolves.toEqualTypeOf<Page<User>>();
    expectTypeOf(api.paged.getAll).returns.resolves.not.toEqualTypeOf<Page<User> | User[]>();
    expectTypeOf(api.flat.getAll).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(api.off.getAll).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(api.flat.getAll).returns.resolves.not.toEqualTypeOf<Page<User> | User[]>();
  });

  it("Page has the same envelope as a Core mock: data, total, page, pageSize", async () => {
    const api = defineMockApi({
      comments: { type: "comments-mock", seed: { limit: 45 }, pagination: true },
    });
    const first = await api.comments.getAll({ page: 1, pageSize: 20 });
    expectTypeOf(first).toEqualTypeOf<Page<Comment>>();
    expect(first.data).toHaveLength(20);
    expect(Object.keys(first).sort()).toEqual(["data", "page", "pageSize", "total"]);
    expect(first).toMatchObject({ total: 45, page: 1, pageSize: 20 });
    const last = await api.comments.getAll({ page: 3, pageSize: 20 });
    expect(last.data).toHaveLength(5);
  });
});

describe("defineMockApi: seeding and source data", () => {
  it("seeds from the real dataset (not a trimmed sample)", async () => {
    const api = defineMockApi({
      users: { type: "users-mock" },
      countries: { type: "countries-csc" },
    });
    expect(await api.users.getAll()).toEqual(await readDataset("users/users-mock"));
    expect(await api.users.getAll()).toHaveLength(100);
    expect(await api.countries.getAll()).toHaveLength(250);
  });

  it("applies slice to the initial records only", async () => {
    const all = await readDataset<Product>("products/products-mock");
    const api = defineMockApi({
      few: { type: "products-mock", seed: { limit: 5 } },
      none: { type: "products-mock", seed: { limit: 0 } },
      huge: { type: "products-mock", seed: { limit: 10_000 } },
    });
    expect(await api.few.getAll()).toEqual(all.slice(0, 5));
    expect(await api.none.getAll()).toEqual([]);
    expect(await api.huge.getAll()).toHaveLength(100);

    // slice is a seed limit, not a cap: the resource can grow past it.
    const created = await api.few.create({ ...all[0]!, id: undefined } as never);
    expect(created.id).toBe("6");
    expect(await api.few.getAll()).toHaveLength(6);
  });

  it("never mutates the source dataset or the typed presets", async () => {
    const before = await readDataset<User>("users/users-mock");
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    await api.users.create({
      name: "New",
      email: "new@example.com",
      username: "new",
      companyId: "1",
    });
    await api.users.patch("1", { name: "Changed" });
    await api.users.update("2", {
      name: "Replaced",
      email: "r@example.com",
      username: "r",
      companyId: "1",
    });
    await api.users.delete("1");

    expect(usersPreset).toEqual(before);
    const fresh = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    expect(await fresh.users.getAll()).toEqual(before.slice(0, 2));
  });

  it("performs no network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const api = defineMockApi({
      users: { type: "users-mock", seed: { limit: 2 }, pagination: true },
    });
    await api.users.getAll();
    await api.users.create({ name: "A", email: "a@example.com", username: "a", companyId: "1" });
    await api.users.delete("1");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("defineMockApi: CRUD", () => {
  it("getAll / getById", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    expect(await api.users.getById("1")).toEqual({
      id: "1",
      name: "Jeremiah Turcotte",
      email: "jeremiah11@yahoo.com",
      username: "user001",
      companyId: "1",
    });
    expect(await api.users.getById(2)).toMatchObject({ id: "2" }); // numbers match string ids
    await expectCode(() => api.users.getById("999"), "NOT_FOUND", /no record with id "999"/);
  });

  it("repeated calls observe earlier changes", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    const created = await api.users.create({
      name: "Alan",
      email: "alan@example.com",
      username: "alan",
      companyId: "1",
    });
    expect(await api.users.getById(created.id)).toEqual(created);
    await api.users.patch(created.id, { name: "Alan T." });
    expect((await api.users.getById(created.id)).name).toBe("Alan T.");
    await api.users.delete(created.id);
    expect(await api.users.getAll()).toHaveLength(2);
  });

  it("create generates ids that follow the dataset convention and are never reused", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    const a = await api.users.create({
      name: "A",
      email: "a@example.com",
      username: "a",
      companyId: "1",
    });
    const b = await api.users.create({
      name: "B",
      email: "b@example.com",
      username: "b",
      companyId: "1",
    });
    expect([a.id, b.id]).toEqual(["3", "4"]);
    await api.users.delete("4");
    expect(
      (await api.users.create({ name: "C", email: "c@example.com", username: "c", companyId: "1" }))
        .id,
    ).toBe("5");
  });

  it("create accepts an explicit id and rejects duplicates", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    const custom = await api.users.create({
      id: "u-42",
      name: "X",
      email: "x@example.com",
      username: "x",
      companyId: "1",
    });
    expect(custom.id).toBe("u-42");
    await expectCode(
      () =>
        api.users.create({
          id: "u-42",
          name: "Y",
          email: "y@example.com",
          username: "y",
          companyId: "1",
        }),
      "DUPLICATE_ID",
      /id "u-42" already exists/,
    );
    await expectCode(
      () =>
        api.users.create({
          id: 1 as never,
          name: "Z",
          email: "z@example.com",
          username: "z",
          companyId: "1",
        }),
      "DUPLICATE_ID",
    );
    // generated ids skip explicit ones already taken
    const next = await api.users.create({
      id: "3",
      name: "N",
      email: "n@example.com",
      username: "n",
      companyId: "1",
    });
    expect(next.id).toBe("3");
    expect(
      (await api.users.create({ name: "M", email: "m@example.com", username: "m", companyId: "1" }))
        .id,
    ).toBe("4");
  });

  it("create requires an id on datasets whose ids are not numeric", async () => {
    const api = defineMockApi({ currencies: { type: "currencies-parseapi" } });
    const usd = await api.currencies.getById("USD");
    expect(usd.currency).toBe("USD");
    const input = { name: "Test", symbol: "T", digits: 2, numeric: null, countries: [] };
    await expectCode(
      () => api.currencies.create(input as never),
      "INVALID_INPUT",
      /needs "currency"/,
    );
    const created = await api.currencies.create({ ...input, currency: "TST" });
    expect((await api.currencies.getById("TST")).name).toBe("Test");
    expect(created.currency).toBe("TST");
  });

  it("update replaces the record and keeps its id", async () => {
    const api = defineMockApi({ products: { type: "products-mock", seed: { limit: 3 } } });
    const replaced = await api.products.update("2", {
      title: "Only title",
    } as never);
    expect(replaced).toEqual({ id: "2", title: "Only title" });
    expect(await api.products.getById("2")).toEqual({ id: "2", title: "Only title" });

    // same id (as a number, or repeated in the body) is fine; a different id is not
    await api.products.update(2, { id: 2, title: "Again" } as never);
    await expectCode(
      () => api.products.update("2", { id: "9", title: "Nope" } as never),
      "INVALID_INPUT",
      /cannot change id from "2"/,
    );
    await expectCode(() => api.products.update("999", {} as never), "NOT_FOUND");
  });

  it("patch changes only the supplied fields", async () => {
    const api = defineMockApi({ products: { type: "products-mock", seed: { limit: 3 } } });
    const before = await api.products.getById("1");
    const patched = await api.products.patch("1", { price: 1.5, stock: undefined });
    expect(patched).toEqual({ ...before, price: 1.5 }); // `undefined` is skipped, not applied
    expect(await api.products.getById("1")).toEqual(patched);
    await expectCode(() => api.products.patch("1", { id: "2" }), "INVALID_INPUT");
    await expectCode(() => api.products.patch("999", { price: 1 }), "NOT_FOUND");
  });

  it("delete removes the record; deleting a missing record rejects with NOT_FOUND", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    expect(await api.users.delete("1")).toBeUndefined();
    await expectCode(() => api.users.getById("1"), "NOT_FOUND");
    expect(await api.users.getAll()).toHaveLength(1);
    await expectCode(() => api.users.delete("1"), "NOT_FOUND", /no record with id "1"/);
  });

  it("rejects invalid inputs and ids with INVALID_INPUT", async () => {
    const api = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    for (const bad of [null, undefined, [], "text", 7]) {
      await expectCode(() => api.users.create(bad as never), "INVALID_INPUT", /create\(\) input/);
      await expectCode(() => api.users.update("1", bad as never), "INVALID_INPUT");
      await expectCode(() => api.users.patch("1", bad as never), "INVALID_INPUT");
    }
    await expectCode(
      () => api.users.create({ fn: () => 1 } as never),
      "INVALID_INPUT",
      /cloneable/,
    );
    for (const badId of [undefined, null, "", {}, true]) {
      await expectCode(() => api.users.getById(badId as never), "INVALID_INPUT", /non-empty/);
      await expectCode(() => api.users.delete(badId as never), "INVALID_INPUT");
    }
    await expectCode(
      () =>
        api.users.create({ id: "" as never, name: "n", email: "e", username: "n", companyId: "1" }),
      "INVALID_INPUT",
    );
    expect(await api.users.getAll()).toHaveLength(2); // nothing was stored
  });

  it("returns copies: callers cannot mutate stored records", async () => {
    const api = defineMockApi({ posts: { type: "posts-mock", seed: { limit: 2 } } });
    const list = await api.posts.getAll();
    list[0]!.title = "hacked";
    list[0]!.tags.push("x");
    list.pop();
    const one = await api.posts.getById("1");
    one.title = "hacked";
    expect((await api.posts.getById("1")).title).not.toBe("hacked");
    expect((await api.posts.getById("1")).tags).not.toContain("x");
    expect(await api.posts.getAll()).toHaveLength(2);

    // inputs are copied on the way in, too
    const input = { title: "T", body: "B", userId: "1", tags: ["a"] };
    const created = await api.posts.create(input);
    input.tags.push("b");
    created.tags.push("c");
    expect((await api.posts.getById(created.id)).tags).toEqual(["a"]);
  });

  it("stays consistent under concurrent calls", async () => {
    const api = defineMockApi({
      users: { type: "users-mock", seed: { limit: 2 }, pagination: true },
    });
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api.users.create({ name: `U${i}`, email: `u${i}@x.io`, username: `u${i}`, companyId: "1" }),
      ),
    );
    expect(created.map((u) => u.id).sort()).toEqual(["3", "4", "5", "6", "7"]);
    expect((await api.users.getAll()).total).toBe(7);
  });
});

describe("defineMockApi: state isolation", () => {
  it("keeps separate instances and separate resources independent", async () => {
    const config = {
      users: { type: "users-mock", seed: { limit: 2 } },
      admins: { type: "users-mock", seed: { limit: 2 } },
    } as const;
    const one = defineMockApi(config);
    const two = defineMockApi(config);

    await one.users.create({
      name: "Only in one",
      email: "one@example.com",
      username: "one",
      companyId: "1",
    });
    await one.users.delete("1");

    expect(await one.users.getAll()).toHaveLength(2);
    expect(await one.admins.getAll()).toHaveLength(2); // same dataset, different resource
    expect(await two.users.getAll()).toHaveLength(2);
    expect(await two.users.getById("1")).toMatchObject({ name: "Jeremiah Turcotte" });
  });
});

describe("defineMockApi: pagination", () => {
  it("defaults to page 1, pageSize 20, and reports the total", async () => {
    const api = defineMockApi({ products: { type: "products-mock", pagination: true } });
    const result = await api.products.getAll();
    expect(result).toMatchObject({ total: 100, page: 1, pageSize: 20 });
    expect(result.data.map((p) => p.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    expect(await api.products.getAll({})).toEqual(result);
  });

  it("uses one-based pages and handles the final partial page", async () => {
    const api = defineMockApi({ products: { type: "products-mock", pagination: true } });
    const second = await api.products.getAll({ page: 2, pageSize: 30 });
    expect(second.data.map((p) => p.id)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 31)),
    );
    const last = await api.products.getAll({ page: 4, pageSize: 30 });
    expect(last.data).toHaveLength(10);
    expect(last).toMatchObject({ total: 100, page: 4, pageSize: 30 });
    expect((await api.products.getAll({ pageSize: 1000 })).data).toHaveLength(100);
  });

  it("paginates the current records, so totals follow create / update / delete / slice", async () => {
    const api = defineMockApi({
      products: { type: "products-mock", seed: { limit: 50 }, pagination: true },
    });
    expect((await api.products.getAll({ pageSize: 10 })).total).toBe(50);

    const created = await api.products.create({
      title: "T",
      description: "D",
      price: 1,
      brand: "B",
      category: "C",
      stock: 1,
    });
    expect(created.id).toBe("51");
    expect((await api.products.getAll({ pageSize: 10 })).total).toBe(51);
    const lastPage = await api.products.getAll({ page: 6, pageSize: 10 });
    expect(lastPage.data.map((p) => p.id)).toEqual(["51"]);

    await api.products.patch("51", { title: "Edited" });
    expect((await api.products.getAll({ page: 6, pageSize: 10 })).data[0]!.title).toBe("Edited");

    await api.products.delete("51");
    await api.products.delete("1");
    const after = await api.products.getAll({ pageSize: 10 });
    expect(after.total).toBe(49);
    expect(after.data[0]!.id).toBe("2");
    // Core's contract: a page past the end is an empty page, not an error.
    expect((await api.products.getAll({ page: 6, pageSize: 10 })).data).toEqual([]);
  });

  it("rejects invalid, negative, non-integer, and out-of-range values", async () => {
    const api = defineMockApi({ products: { type: "products-mock", pagination: true } });
    for (const page of [0, -1, 1.5, NaN, Infinity, "x"]) {
      await expectCode(
        () => api.products.getAll({ page: page as never }),
        "INVALID_PAGINATION",
        /page must be an integer >= 1/,
      );
    }
    for (const pageSize of [0, -5, 2.5, NaN, "abc"]) {
      await expectCode(
        () => api.products.getAll({ pageSize: pageSize as never }),
        "INVALID_PAGINATION",
        /pageSize must be an integer >= 1/,
      );
    }
    // Other keys filter rows, as on a Core mock: an unknown one matches nothing.
    expect((await api.products.getAll({ pagesize: 5 } as never)).data).toEqual([]);
  });

  it("treats an empty resource as a single empty page", async () => {
    const api = defineMockApi({
      none: { type: "products-mock", seed: { limit: 0 }, pagination: true },
    });
    expect(await api.none.getAll()).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
    expect(await api.none.getAll({ page: 2 })).toEqual({
      data: [],
      total: 0,
      page: 2,
      pageSize: 20,
    });
  });

  it("returns a plain list, and ignores page options, when pagination is off", async () => {
    const api = defineMockApi({
      off: { type: "users-mock", seed: { limit: 2 } },
      explicit: { type: "users-mock", seed: { limit: 2 }, pagination: false },
    });
    expect(Array.isArray(await api.off.getAll())).toBe(true);
    expect(Array.isArray(await api.explicit.getAll())).toBe(true);
    // Same as a Core mock without `pagination`: paging keys are not filters and are ignored.
    expect(await (api.off.getAll as (p?: unknown) => Promise<unknown[]>)({ page: 9 })).toHaveLength(
      2,
    );
  });
});

describe("defineMockApi alongside Core mocked resources (one shared engine)", () => {
  it("keeps the two systems' state independent", async () => {
    const mockApi = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    const coreApi = defineApi({
      baseURL: "https://api.example.com",
      resources: { users: { path: "/users", mock: { data: "users-mock", seed: { limit: 2 } } } },
    });

    await coreApi.users.create({
      name: "Via Core",
      email: "core@example.com",
      username: "core",
      companyId: "1",
    });
    await mockApi.users.create({
      name: "Via MockApi",
      email: "mock@example.com",
      username: "mock",
      companyId: "1",
    });

    expect(await coreApi.users.getAll()).toHaveLength(3);
    expect(await mockApi.users.getAll()).toHaveLength(3);
    expect(JSON.stringify(await coreApi.users.getAll())).not.toContain("Via MockApi");
    expect(JSON.stringify(await mockApi.users.getAll())).not.toContain("Via Core");
  });

  it("infers the same entity type from the dataset id, with no metadata", () => {
    const mockApi = defineMockApi({ users: { type: "users-mock", seed: { limit: 2 } } });
    const coreApi = defineApi({
      baseURL: "https://api.example.com",
      resources: { users: { path: "/users", mock: "users-mock" } },
    });
    expectTypeOf(mockApi.users.getAll).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(coreApi.users.getAll).returns.resolves.toEqualTypeOf<User[]>();
  });

  it("generates the same ids and page totals from the same seed", async () => {
    const mockApi = defineMockApi({
      users: { type: "users-mock", seed: { limit: 2 }, pagination: true },
    });
    const coreApi = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          mock: { data: "users-mock", seed: { limit: 2 } },
          pagination: "page",
        },
      },
    });
    const fromMock = await mockApi.users.getAll({ page: 1, pageSize: 1 });
    const fromCore = await coreApi.users.getAll({ query: { page: 1, pageSize: 1 } });
    expectTypeOf(fromCore).toEqualTypeOf<{
      data: User[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(fromMock).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(fromCore).toEqual({ data: fromMock.data, total: 2, page: 1, pageSize: 1 });
  });
});
