import {
  convertKey,
  defineApi,
  TransformError,
  transformKeys,
  type ConvertKey,
  type TransformKeys,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("key conversion", () => {
  it.each([
    ["user_id", "userId", "user_id", "UserId", "user-id"],
    ["firstName", "firstName", "first_name", "FirstName", "first-name"],
    ["FirstName", "firstName", "first_name", "FirstName", "first-name"],
    ["phone-number", "phoneNumber", "phone_number", "PhoneNumber", "phone-number"],
    ["id", "id", "id", "Id", "id"],
  ])("%s", (key, camel, snake, pascal, kebab) => {
    expect(convertKey(key, "camelCase")).toBe(camel);
    expect(convertKey(key, "snake_case")).toBe(snake);
    expect(convertKey(key, "PascalCase")).toBe(pascal);
    expect(convertKey(key, "kebab-case")).toBe(kebab);
  });

  it("type-level conversion matches runtime conversion", () => {
    expectTypeOf<ConvertKey<"user_id", "camelCase">>().toEqualTypeOf<"userId">();
    expectTypeOf<ConvertKey<"firstName", "snake_case">>().toEqualTypeOf<"first_name">();
    expectTypeOf<ConvertKey<"phone-number", "PascalCase">>().toEqualTypeOf<"PhoneNumber">();
    expectTypeOf<ConvertKey<"FirstName", "kebab-case">>().toEqualTypeOf<"first-name">();
    expectTypeOf<
      TransformKeys<
        {
          user_id: number;
          user_profile: { phone_number: string };
          tags: { tag_name: string }[];
          at: Date;
        },
        "camelCase"
      >
    >().toEqualTypeOf<{
      userId: number;
      userProfile: { phoneNumber: string };
      tags: { tagName: string }[];
      at: Date;
    }>();
  });
});

describe("recursive transforms", () => {
  it("converts nested objects and arrays without touching values or the source", () => {
    const source = {
      user_id: 1,
      first_name: "first_name stays",
      user_profile: { phone_number: "123" },
      items: [{ item_name: "a" }, [{ deep_key: null }]],
    };
    const copy = structuredClone(source);
    expect(transformKeys(source, "camelCase")).toEqual({
      userId: 1,
      firstName: "first_name stays",
      userProfile: { phoneNumber: "123" },
      items: [{ itemName: "a" }, [{ deepKey: null }]],
    });
    expect(source).toEqual(copy);
  });

  it("passes primitives, null, dates, and binary/special objects through untouched", () => {
    const date = new Date(0);
    const blob = new Blob(["x"]);
    const map = new Map([["a_b", 1]]);
    class Model {
      some_field = 1;
    }
    const model = new Model();
    expect(transformKeys(null, "camelCase")).toBeNull();
    expect(transformKeys("a_b", "camelCase")).toBe("a_b");
    const out = transformKeys(
      { created_at: date, file_blob: blob, the_map: map, the_model: model },
      "camelCase",
    ) as Record<string, unknown>;
    expect(out.createdAt).toBe(date);
    expect(out.fileBlob).toBe(blob);
    expect(out.theMap).toBe(map);
    expect(out.theModel).toBe(model);
  });

  it("throws on colliding keys instead of losing data", () => {
    const error = (() => {
      try {
        transformKeys({ nested: { user_id: 1, userId: 2 } }, "camelCase");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(TransformError);
    expect(error).toMatchObject({
      code: "TRANSFORM",
      path: "$.nested",
      keys: ["user_id", "userId"],
    });
    expect(() => transformKeys({ "first-name": 1, first_name: 2 }, "snake_case")).toThrow(
      TransformError,
    );
  });
});

describe("transforms in defineApi", () => {
  it("converts request body and query to the backend convention and responses to the public one", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const api = defineApi({
      baseURL: "https://x.dev",
      transforms: { request: { keys: "snake_case" }, response: { keys: "camelCase" } },
      transport: createFakeTransport((r) => {
        seen.push({ url: r.url, body: r.body });
        return { body: { user_id: 7, first_name: "Ahmad" } };
      }),
      resources: { users: { path: "/users" } },
    });
    const created = await api.users.create({ firstName: "Ahmad" }, { query: { sortBy: "name" } });
    expect(created).toEqual({ userId: 7, firstName: "Ahmad" });
    expect(seen[0]).toEqual({
      url: "https://x.dev/users?sort_by=name",
      body: JSON.stringify({ first_name: "Ahmad" }),
    });
  });

  it("resource and operation transforms override root, per direction", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      transport: createFakeTransport((r) => ({
        body: r.url.endsWith("/1") ? { user_id: 1 } : [{ user_id: 1 }],
      })),
      resources: {
        a: { path: "/a" },
        b: { path: "/b", transforms: { response: { keys: "PascalCase" } } },
        c: {
          path: "/c",
          operations: { getAll: { transforms: { response: { keys: "kebab-case" } } } },
        },
      },
    });
    expect(await api.a.getAll()).toEqual([{ userId: 1 }]);
    expect(await api.b.getAll()).toEqual([{ UserId: 1 }]);
    expect(await api.c.getAll()).toEqual([{ "user-id": 1 }]);
    expect(await api.c.getById(1)).toEqual({ userId: 1 });
  });

  it("does nothing when transforms are not configured", async () => {
    const body = [{ user_id: 1, nested: { a_b: 2 } }];
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body })),
      resources: { a: { path: "/a" } },
    });
    expect(await api.a.getAll()).toEqual(body);
  });

  it("surfaces response collisions as TransformError", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      transport: createFakeTransport(() => ({ body: { user_id: 1, userId: 2 } })),
      resources: { a: { path: "/a" } },
    });
    await expect(api.a.getAll()).rejects.toBeInstanceOf(TransformError);
  });

  it("types mock-derived entities and inputs in the public convention (spec Example 1)", async () => {
    const api = defineApi({
      baseURL: "/api",
      transforms: { response: { keys: "camelCase" }, request: { keys: "snake_case" } },
      resources: {
        users: {
          path: "/users",
          mock: [
            { id: 1, first_name: "Ali", email: "ali@example.com" },
            { id: 2, first_name: "Omar", email: "omar@example.com" },
          ],
        },
      },
    });
    const users = await api.users.getAll();
    expectTypeOf(users).toEqualTypeOf<{ id: number; firstName: string; email: string }[]>();
    expect(users[0]!.firstName).toBe("Ali");
    // @ts-expect-error source key is not public
    void users[0]!.first_name;
    const created = await api.users.create({ firstName: "Ahmad", email: "ahmad@example.com" });
    expect(created).toEqual({ id: 3, firstName: "Ahmad", email: "ahmad@example.com" });
    expect(await api.users.findFirst({ query: { firstName: "Omar" } })).toMatchObject({ id: 2 });
    expect(await api.users.getBy("firstName", "Ahmad")).toMatchObject({ id: 3 });
  });

  it("types explicitly declared entities in the public convention", async () => {
    type BackendUser = { user_id: number; display_name: string };
    const api = defineApi<{ users: { entity: BackendUser } }>()({
      baseURL: "https://x.dev",
      transforms: { response: { keys: "camelCase" } },
      transport: createFakeTransport(() => ({ body: [{ user_id: 1, display_name: "A" }] })),
      resources: { users: { path: "/users" } },
    });
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<
      { userId: number; displayName: string }[]
    >();
    expect(await api.users.getAll()).toEqual([{ userId: 1, displayName: "A" }]);
  });

  it("applies mocked page and cursor pagination alongside request and response key transforms", async () => {
    const api = defineApi({
      baseURL: "/api",
      transforms: { request: { keys: "snake_case" }, response: { keys: "camelCase" } },
      resources: {
        paged: {
          path: "/paged",
          pagination: "page",
          mock: [
            { id: 1, team_name: "alpha" },
            { id: 2, team_name: "alpha" },
            { id: 3, team_name: "alpha" },
            { id: 4, team_name: "beta" },
          ],
        },
        cursor: {
          path: "/cursor",
          pagination: "cursor",
          mock: [
            { id: 1, team_name: "alpha" },
            { id: 2, team_name: "alpha" },
            { id: 3, team_name: "alpha" },
          ],
        },
      },
    });

    await expect(
      api.paged.getAll({ query: { page: 2, pageSize: 2, teamName: "alpha" } }),
    ).resolves.toEqual({
      data: [{ id: 3, teamName: "alpha" }],
      total: 3,
      page: 2,
      pageSize: 2,
    });

    await expect(
      api.cursor.getAll({ query: { cursor: "1", pageSize: 1, teamName: "alpha" } }),
    ).resolves.toEqual({
      data: [{ id: 2, teamName: "alpha" }],
      nextCursor: "2",
    });
  });
});
