import { defineApi, type OperationFnContext } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";

type User = { id: string; name: string };
type AppApi = { users: { entity: User; list: User[] } };

const explicit = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  resources: {
    users: { path: "/users", operations: { getById: false, create: true } },
  },
});
const inferred = defineApi({
  baseURL: "https://api.example.com",
  resources: {
    users: { path: "/users" },
  },
});

describe("configuration-driven client inference", () => {
  it("keeps both call forms and uses metadata only for payloads", () => {
    expectTypeOf(explicit.users.getAll).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(explicit.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf(inferred.users.getAll).returns.resolves.toEqualTypeOf<unknown[]>();
    expectTypeOf(inferred.users.create).parameter(0).toEqualTypeOf<unknown>();
    if (false) {
      // @ts-expect-error disabled runtime method is absent
      explicit.users.getById("1");
      // @ts-expect-error renamed operation is absent
      inferred.users.bulkCreate([]);
      // @ts-expect-error renamed operation is absent
      inferred.users.bulkDelete([]);
    }
  });

  it("infers extra resources, custom functions, and many signatures", () => {
    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users" },
        posts: {
          path: "/posts",
          operations: {
            archive: async (_ctx: OperationFnContext, id: string) => ({
              id,
              archived: true as const,
            }),
          },
        },
      },
    });
    expectTypeOf(api.posts.getById).returns.resolves.toEqualTypeOf<unknown>();
    expectTypeOf(api.posts.archive).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(api.posts.archive).returns.resolves.toEqualTypeOf<{
      id: string;
      archived: true;
    }>();
    expectTypeOf(api.users.createMany).parameter(0).toEqualTypeOf<CreateBodyOf<User>[]>();
    expectTypeOf(api.users.deleteMany).parameter(0).toEqualTypeOf<User["id"][]>();
    expectTypeOf(api.users.getMany).parameter(0).toEqualTypeOf<User["id"][]>();
  });

  it("uses runtime paths for multiple parameters and ignores a legacy metadata path", () => {
    type Legacy = { users: { path: "/legacy/:legacy"; entity: User } };
    const api = defineApi<Legacy>()({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/orgs/:orgId/users", operations: { getById: { path: "/lookup/:id" } } },
      },
    });
    expectTypeOf(api.users.getById)
      .parameter(0)
      .toEqualTypeOf<{ orgId: string | number; id: string | number }>();
    expectTypeOf(api.users.exists).parameter(1).toEqualTypeOf<{ orgId: string | number }>();
    expectTypeOf(api.users.getMany).parameter(1).toEqualTypeOf<{ orgId: string | number }>();
    if (false) {
      // @ts-expect-error legacy type path does not supply parameters
      api.users.getById({ legacy: "old", id: "1" });
    }
  });

  it("mirrors defaults, flags, groups, and explicit overrides", () => {
    const api = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          readOnly: true,
          operationGroups: { extended: false, many: true },
          operations: { create: true, createMany: { path: "/batch" }, deleteMany: false },
        },
      },
    });
    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf(api.users.getMany).parameter(0).toEqualTypeOf<User["id"][]>();
    if (false) {
      // @ts-expect-error readOnly removes update
      api.users.update("1", {});
      // @ts-expect-error extended group removes search
      api.users.search();
      // @ts-expect-error explicit override removes deleteMany
      api.users.deleteMany([]);
    }
    const minimal = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", defaultOperations: false, operations: { getAll: true } },
      },
    });
    expectTypeOf(minimal.users.getAll).returns.resolves.toEqualTypeOf<unknown[]>();
    if (false) {
      // @ts-expect-error defaultOperations false removes other builtins
      minimal.users.create({});
    }
    const writeOnly = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", writeOnly: true },
      },
    });
    expectTypeOf(writeOnly.users.create).parameter(0).toEqualTypeOf<unknown>();
    if (false) {
      // @ts-expect-error writeOnly removes reads
      writeOnly.users.getAll();
    }
    const none = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", defaultOperations: false, readOnly: true },
      },
    });
    if (false) {
      // @ts-expect-error readOnly does not re-enable reads after defaultOperations false
      none.users.getAll();
    }
  });

  it("makes methods optional when selection depends on a dynamic boolean", () => {
    const flag: boolean = Math.random() > 0.5;
    const readOnly = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", readOnly: flag },
      },
    });
    const defaults = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", defaultOperations: flag },
      },
    });
    const grouped = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", operationGroups: { many: flag } },
      },
    });
    const individual = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", operations: { create: flag } },
      },
    });
    if (false) {
      readOnly.users.getAll();
      // @ts-expect-error readOnly may remove create
      readOnly.users.create({});
      // @ts-expect-error defaults may remove getAll
      defaults.users.getAll();
      // @ts-expect-error many group may remove getMany
      grouped.users.getMany([]);
      // @ts-expect-error individual false may remove create
      individual.users.create({});
    }
  });

  it("requires runtime resources and custom implementations", () => {
    type Two = { users: { entity: User }; posts: { entity: unknown } };
    type WithArchive = { users: { entity: User; operations: { archive: { response: User } } } };
    if (false) {
      defineApi<Two>()({
        baseURL: "https://api.example.com",
        // @ts-expect-error posts declared in metadata is missing at runtime
        resources: {
          users: { path: "/users" },
        },
      });
      defineApi<WithArchive>()({
        baseURL: "https://api.example.com",
        resources: {
          // @ts-expect-error archive metadata requires a runtime implementation
          users: { path: "/users" },
        },
      });
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          // @ts-expect-error both flags cannot be enabled
          users: { path: "/users", readOnly: true, writeOnly: true },
        },
      });
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          // @ts-expect-error true cannot invent a custom operation
          users: { path: "/users", operations: { archive: true } },
        },
      });
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          // @ts-expect-error a declarative custom operation must specify its method
          users: { path: "/users", operations: { archive: { path: "/archive" } } },
        },
      });
    }
    const api = defineApi<WithArchive>()({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          operations: { archive: { method: "POST", path: "/:id/archive" } },
        },
      },
    });
    expectTypeOf(api.users.archive).returns.resolves.toEqualTypeOf<User>();
  });
});
