import { defineApi, defineApis, resetMock, type MockUser } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";

/**
 * Compile-time contract (Part H1). These assertions are checked by `pnpm typecheck`; the
 * `if (false)` blocks hold calls that must fail to compile and never run.
 */
type User = { id: number; name: string; email: string };
const base = { baseURL: "https://api.example.com" } as const;

describe("defineApi type architecture", () => {
  it("infers both invocation styles from the same runtime config", () => {
    const inferred = defineApi({ ...base, resources: { users: { path: "/users" } } });
    const typed = defineApi<{ users: { entity: User } }>()({
      ...base,
      resources: { users: { path: "/users" } },
    });
    expectTypeOf(inferred.users.getById).returns.resolves.toBeUnknown();
    expectTypeOf(typed.users.getById).returns.resolves.toEqualTypeOf<User>();
    expectTypeOf(typed.users.getById).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(typed.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
  });

  it("runtime config is authoritative: disabled and unselected operations disappear", () => {
    const api = defineApi<{ users: { entity: User } }>()({
      ...base,
      resources: {
        users: { path: "/users", operations: { getById: false, createMany: false } },
        ro: { path: "/ro", readOnly: true },
        wo: { path: "/wo", writeOnly: true },
        none: { path: "/none", defaultOperations: false, operations: { getAll: true } },
        groups: { path: "/g", operationGroups: { read: false, many: true } },
        explicit: { path: "/e", operationGroups: { read: false }, operations: { getById: true } },
      },
    });
    expectTypeOf(api.users).not.toHaveProperty("getById");
    expectTypeOf(api.users).not.toHaveProperty("createMany");
    expectTypeOf(api.users).toHaveProperty("getAll");
    expectTypeOf(api.ro).not.toHaveProperty("create");
    expectTypeOf(api.ro).toHaveProperty("findFirst");
    expectTypeOf(api.wo).not.toHaveProperty("getAll");
    expectTypeOf(api.wo).toHaveProperty("deleteMany");
    expectTypeOf<keyof typeof api.none & string>().toEqualTypeOf<"getAll">();
    expectTypeOf(api.groups).toHaveProperty("getMany"); // many beats read
    expectTypeOf(api.groups).not.toHaveProperty("getById");
    expectTypeOf(api.explicit).toHaveProperty("getById"); // individual beats groups
    expect(Object.keys(api.none)).toEqual(["getAll"]);
    expect("getMany" in api.groups && !("getById" in api.groups)).toBe(true);
  });

  it("types function and declarative custom operations; never as any", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: {
            archive: { method: "POST", path: "/:id/archive" },
            stats: async (ctx, range: "day" | "week") =>
              ctx.request<{ total: number }>({ query: { range } }),
            loose: async (ctx, value) => ctx.request({ query: { v: String(value) } }),
          },
        },
      },
    });
    expectTypeOf(api.users.stats).parameters.toEqualTypeOf<["day" | "week"]>();
    expectTypeOf(api.users.stats).returns.resolves.toEqualTypeOf<{ total: number }>();
    expectTypeOf(api.users.loose).parameters.toEqualTypeOf<[value: unknown]>();
    expectTypeOf(api.users.loose).returns.resolves.toBeUnknown();
    expectTypeOf(api.users.archive).parameter(0).toEqualTypeOf<string | number>();
  });

  it("infers entities from mock data with no entity, generic, or satisfies", () => {
    const api = defineApi({
      baseURL: "/api",
      resources: {
        named: { path: "/n", mock: "users-mock" },
        inline: {
          path: "/i",
          mock: [
            { id: 1, tags: ["a"] },
            { id: 2, tags: [], extra: true },
          ],
        },
        stringIds: { path: "/s", mock: [{ id: "a", n: 1 }] },
        lazy: { path: "/l", mock: async () => [{ id: 1, at: new Date() }] },
        custom: { path: "/c", mock: { data: [{ uuid: "x", v: 1 }], idKey: "uuid" } },
        countries: { path: "/countries", mock: "countries-parseapi" },
        empty: { path: "/e", mock: [] },
        unknownProvider: { path: "/u", mock: async () => JSON.parse("[]") as unknown[] },
        anyProvider: { path: "/a", mock: async () => JSON.parse("[]") },
      },
    });
    expectTypeOf(api.named.getAll).returns.resolves.toEqualTypeOf<MockUser[]>();
    expectTypeOf(api.inline.getById).returns.resolves.toEqualTypeOf<{
      id: number;
      tags: string[];
      extra?: boolean;
    }>();
    expectTypeOf(api.inline.getById).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(api.stringIds.getById).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(api.lazy.getById).returns.resolves.toEqualTypeOf<{ id: number; at: Date }>();
    expectTypeOf(api.custom.getById).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(api.countries.getById).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(api.empty.getById).returns.resolves.toBeUnknown();
    expectTypeOf(api.unknownProvider.getById).returns.resolves.toBeUnknown();
    expectTypeOf(api.anyProvider.getById).returns.resolves.toBeUnknown();
    expectTypeOf(api.empty.getById).returns.resolves.not.toBeAny();
    resetMock(api.inline);
  });

  it("types page and cursor pagination", () => {
    const api = defineApi<{ users: { entity: User } }>()({
      ...base,
      resources: {
        users: { path: "/users", pagination: "page" },
        feed: { path: "/feed", pagination: "cursor" },
      },
    });
    expectTypeOf(api.users.getAll).returns.resolves.toEqualTypeOf<{
      data: User[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expectTypeOf(api.feed.getAll).returns.resolves.toEqualTypeOf<{
      data: unknown[];
      nextCursor: string | null;
    }>();
  });

  it("types recursive key transforms on responses and public input types", () => {
    type Backend = { user_id: number; user_profile: { phone_number: string } };
    const api = defineApi<{ users: { entity: Backend } }>()({
      ...base,
      transforms: { request: { keys: "snake_case" }, response: { keys: "camelCase" } },
      resources: {
        users: { path: "/users" },
        raw: { path: "/raw", transforms: { response: { keys: "snake_case" } } },
      },
    });
    expectTypeOf(api.users.getById).returns.resolves.toEqualTypeOf<{
      userId: number;
      userProfile: { phoneNumber: string };
    }>();
    expectTypeOf(api.users.patch)
      .parameter(1)
      .toEqualTypeOf<Partial<{ userId: number; userProfile: { phoneNumber: string } }>>();
  });

  it("rejects invalid configurations at compile time", () => {
    if (false as boolean) {
      defineApi<{ users: { entity: User }; products: { entity: User } }>()({
        ...base,
        // @ts-expect-error products is declared in metadata but missing at runtime
        resources: { users: { path: "/users" } },
      });
      defineApi<{ users: { entity: User; operations: { archive: { response: User } } } }>()({
        ...base,
        // @ts-expect-error a metadata-only custom operation has no runtime implementation
        resources: { users: { path: "/users" } },
      });
      // @ts-expect-error unknown root option
      defineApi({ ...base, timeuot: 5000, resources: {} });
      // @ts-expect-error unknown resource option
      defineApi({ ...base, resources: { users: { path: "/users", entity: {} } } });
      defineApi({
        ...base,
        // @ts-expect-error unknown operation option
        resources: { users: { path: "/users", operations: { getById: { methd: "GET" } } } },
      });
      defineApi({
        ...base,
        // @ts-expect-error both mode flags
        resources: { users: { path: "/users", readOnly: true, writeOnly: true } },
      });
      defineApi({
        ...base,
        // @ts-expect-error true cannot create a custom operation
        resources: { users: { path: "/users", operations: { archive: true } } },
      });
      // @ts-expect-error unknown dataset id
      defineApi({ ...base, resources: { users: { path: "/users", mock: "nope-mock" } } });
      defineApi({
        ...base,
        // @ts-expect-error idKey must exist on the records
        resources: { s: { path: "/s", mock: { data: [{ uuid: "a" }], idKey: "id" } } },
      });
      // @ts-expect-error invalid transform name
      defineApi({ ...base, transforms: { response: { keys: "camel" } }, resources: {} });
      defineApi<{ users: { entity: User } }>()({
        ...base,
        // @ts-expect-error mock data must match a declared entity
        resources: { users: { path: "/users", mock: [{ id: "x" }] } },
      });
      const live = defineApi({ ...base, resources: { users: { path: "/users" } } });
      // @ts-expect-error resetMock only accepts mocked resources
      resetMock(live.users);
      // @ts-expect-error unknown client option inside defineApis
      defineApis({ a: { ...base, timeuot: 1, resources: {} } });
    }
    expect(true).toBe(true);
  });
});
