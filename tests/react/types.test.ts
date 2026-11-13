import { defineApi, defineApis } from "@apixa/core";
import { QueryClient, useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";
import { createResourceController } from "../../packages/react/src/controller.js";
import { createResourceQueryController } from "../../packages/react/src/query-controller.js";
import { createResourceQueryOptions } from "../../packages/react/src/query-options.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import {
  useResourceQuery,
  type ResourceQueryResult,
} from "../../packages/react/src/use-resource-query.js";
import type {
  InferCreateBody,
  InferEntity,
  InferListData,
  InferUpdateBody,
  OptionalOperationName,
} from "../../packages/react/src/types.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: { path: "/users"; entity: User };
};

const base = {
  baseURL: "https://api.example.com",
  transport: createFakeTransport(() => ({ body: [] })),
};

describe("React integration inference from Apixa ResourceClient", () => {
  const api = defineApi<AppApi>()({ ...base, resources: { users: { path: "/users" } } });

  it("infers list, entity, create, and update bodies from the resource", () => {
    type R = typeof api.users;
    expectTypeOf<InferListData<R>>().toEqualTypeOf<User[]>();
    expectTypeOf<InferEntity<R>>().toEqualTypeOf<User>();
    expectTypeOf<InferCreateBody<R>>().toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf<InferUpdateBody<R>>().toEqualTypeOf<Partial<User>>();

    const query = createResourceQueryController(api.users, { queryKey: ["users"] });
    expectTypeOf(query.listOptions().queryFn).returns.resolves.toEqualTypeOf<User[]>();
    const compat = createResourceController(api.users, { queryKey: ["users"] });
    expectTypeOf(compat.listOptions().queryFn).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(compat).toHaveProperty("createOptions");
  });

  it("useResourceQuery's result type has no write surface", () => {
    type Result = ResourceQueryResult<typeof api.users>;
    expectTypeOf<Result>().toHaveProperty("data").toEqualTypeOf<User[] | undefined>();
    expectTypeOf<Result>().toHaveProperty("getById");
    expectTypeOf<Result>().not.toHaveProperty("create");
    expectTypeOf<Result>().not.toHaveProperty("update");
    expectTypeOf<Result>().not.toHaveProperty("delete");
    expectTypeOf<Result>().not.toHaveProperty("mutations");
    expectTypeOf<Result["controller"]>().not.toHaveProperty("createOptions");
    if (false as boolean) {
      const users = useResourceQuery(api.users, { queryKey: ["users"] });
      // @ts-expect-error create() was removed from the query hook
      void users.create({ name: "Ada", email: "a@x.dev" });
      // @ts-expect-error update() was removed from the query hook
      void users.update("1", { name: "Grace" });
      // @ts-expect-error delete() was removed from the query hook
      void users.delete("1");
      // @ts-expect-error mutations was removed from the query hook
      void users.mutations;
      // @ts-expect-error mutation options are no longer accepted
      useResourceQuery(api.users, { queryKey: ["users"], mutations: {} });
    }
    expect(true).toBe(true);
  });

  it("accepts read-only and partially disabled Core resources without exposing absent methods", () => {
    const readOnly = defineApi<AppApi>()({
      ...base,
      resources: { users: { path: "/users", operations: "read" } },
    });
    const noDetail = defineApi<AppApi>()({
      ...base,
      resources: { users: { path: "/users", operations: { getById: false } } },
    });
    if (false as boolean) {
      const read = useResourceQuery(readOnly.users, { queryKey: ["users"] });
      expectTypeOf(read.data).toEqualTypeOf<User[] | undefined>();
      expectTypeOf(read.getById).parameter(0).toEqualTypeOf<User["id"]>();
      const partial = useResourceQuery(noDetail.users, { queryKey: ["users"] });
      // @ts-expect-error disabled getById is absent
      void partial.getById("1");
    }
    expect(true).toBe(true);
  });
});

describe("useResourceMutation inference from real defineApi clients", () => {
  const api = defineApi<AppApi>()({
    ...base,
    resources: {
      users: {
        path: "/users",
        operations: {
          deleteMany: false,
          archive: { kind: "write", method: "POST", path: "/:id/archive", hasBody: false },
          stats: {
            kind: "read",
            run: async (ctx, range: "day" | "week") =>
              ctx.request<{ total: number }>({ query: { range } }),
          },
        },
      },
      ro: { path: "/ro", operations: "read" },
    },
  });

  it("infers tuple args and data for create / update / delete", () => {
    if (false as boolean) {
      const users = useResourceMutation(api.users, {
        queryKey: ["users"],
        mutations: {
          delete: {
            onSuccess: (_data, variables) => expectTypeOf(variables[0]).toEqualTypeOf<string>(),
          },
        },
      });
      expectTypeOf(users.create).returns.resolves.toEqualTypeOf<User>();
      void users.create({ name: "Ada", email: "a@x.dev" });
      // @ts-expect-error create takes a body, not a tuple
      void users.create([{ name: "Ada", email: "a@x.dev" }]);
      void users.update("42", { body: { name: "Grace" } });
      expectTypeOf(users.states.update.data).toEqualTypeOf<User | undefined>();
      // @ts-expect-error id is a string
      void users.update(42, { name: "Grace" });
      void users.delete("42");
      // @ts-expect-error reads are absent from mutation hook
      void users.stats("day");
    }
    expect(true).toBe(true);
  });

  it("infers custom function and parameterized declarative operations", () => {
    if (false as boolean) {
      const users = useResourceMutation(api.users, { queryKey: ["users"] });
      expectTypeOf(users.archive).parameters.toEqualTypeOf<
        import("../../packages/react/src/types.js").OperationParameters<typeof api.users, "archive">
      >();
      void users.archive({ params: { id: "42" } });
      // @ts-expect-error custom reads are absent
      void users.stats("day");
    }
    expect(true).toBe(true);
  });

  it("rejects disabled operations and writes on read-only resources", () => {
    if (false as boolean) {
      const users = useResourceMutation(api.users, { queryKey: ["users"] });
      // @ts-expect-error deleteMany is disabled at runtime config
      void users.deleteMany(["1"]);
      const ro = useResourceMutation(api.ro, { queryKey: ["ro"] });
      // @ts-expect-error read-only resource has no create
      void ro.create({});
      // @ts-expect-error unknown operation name
      void users.archvie("1");
      // @ts-expect-error reads cannot be configured as mutations
      useResourceMutation(api.users, { queryKey: ["users"], mutations: { getById: { retry: 2 } } });
    }
    expect(true).toBe(true);
  });
});

describe("resource query operation and native inference", () => {
  const api = defineApi<AppApi>()({
    ...base,
    resources: {
      users: {
        path: "/users",
        operations: {
          search: false,
          stats: {
            kind: "read",
            run: async (ctx, period: "day" | "week") =>
              ctx.request<{ total: number }>({ query: { period } }),
          },
        },
      },
    },
  });

  it("infers selected data and defined initial data from Core", () => {
    if (false as boolean) {
      const names = useResourceQuery(api.users, {
        queryKey: ["users"],
        select: (data) => data.map((user) => user.name),
        staleTime: "static",
        enabled: (query) => query.state.data !== undefined,
        refetchInterval: (query) => (query.state.data ? 30_000 : false),
      });
      expectTypeOf(names.data).toEqualTypeOf<string[] | undefined>();
      expectTypeOf(names.query.data).toEqualTypeOf<string[] | undefined>();

      const seeded = useResourceQuery(api.users, {
        queryKey: ["users"],
        initialData: [{ id: "1", name: "Ada", email: "ada@example.com" }],
      });
      expectTypeOf(seeded.data).toEqualTypeOf<User[]>();
      expectTypeOf(seeded.query.data).toEqualTypeOf<User[]>();
      const seededByFunction = useResourceQuery(api.users, {
        queryKey: ["users"],
        initialData: () => [{ id: "1", name: "Ada", email: "ada@example.com" }],
      });
      expectTypeOf(seededByFunction.data).toEqualTypeOf<User[]>();
      const optionalSeed: User[] | undefined = undefined;
      const maybeSeeded = useResourceQuery(api.users, {
        queryKey: ["users"],
        initialData: optionalSeed,
      });
      expectTypeOf(maybeSeeded.data).toEqualTypeOf<User[] | undefined>();

      const detail = useResourceQuery(api.users, {
        queryKey: ["users"],
        operation: "getById",
        args: ["42"],
      });
      expectTypeOf(detail.data).toEqualTypeOf<User | undefined>();
      expectTypeOf(detail.invalidateDetail).parameter(0).toEqualTypeOf<string>();
      const count = useResourceQuery(api.users, {
        queryKey: ["users"],
        operation: "count",
        args: [],
      });
      expectTypeOf(count.data).toEqualTypeOf<number | undefined>();
      const stats = useResourceQuery(api.users, {
        queryKey: ["users"],
        operation: "stats",
        args: ["day"],
        keyParts: ["day"],
      });
      expectTypeOf(stats.data).toEqualTypeOf<{ total: number } | undefined>();
      // @ts-expect-error disabled in the Core runtime config
      useResourceQuery(api.users, { queryKey: ["users"], operation: "search", args: [] });
      // @ts-expect-error query-side read overrides were removed
      // prettier-ignore
      useResourceQuery(api.users, { queryKey: ["users"], operation: "stats", args: ["day"], readOperations: ["stats"] });

      const options = createResourceQueryOptions(api.users, {
        queryKey: ["users"],
        operation: "getById",
        args: ["42"],
      });
      expectTypeOf(options.queryFn).returns.resolves.toEqualTypeOf<User>();
      const queryClient = new QueryClient();
      expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<User | undefined>();
      const controller = createResourceQueryController(api.users, { queryKey: ["users"] });
      expectTypeOf(controller.getCached(queryClient, options)).toEqualTypeOf<User | undefined>();
      expectTypeOf(useQuery(options).data).toEqualTypeOf<User | undefined>();
      expectTypeOf(useSuspenseQuery(options).data).toEqualTypeOf<User>();
      expectTypeOf(useQueries({ queries: [options] as const })[0].data).toEqualTypeOf<
        User | undefined
      >();
      // @ts-expect-error Apixa owns queryFn
      useResourceQuery(api.users, { queryKey: ["users"], queryFn: async () => [] });
      // @ts-expect-error custom hashing would break controller cache-key consistency
      useResourceQuery(api.users, { queryKey: ["users"], queryKeyHashFn: () => "same" });
      // @ts-expect-error a full Core response changes the raw query result shape
      useResourceQuery(api.users, { queryKey: ["users"], args: [{ full: true }] });
    }
    expect(true).toBe(true);
  });
});

describe("query typing with defineApis and runtime selection", () => {
  it("uses actual nested paths, envelopes, and optional method availability", () => {
    const apis = defineApis<{ backend: { users: { entity: User } } }>()({
      backend: {
        baseURL: "https://api.example.com",
        transport: base.transport,
        resources: {
          users: { path: "/organizations/:orgId/users", pagination: "cursor" },
        },
      },
    });
    const flag: boolean = Math.random() > 0.5;
    const conditional = defineApi({
      baseURL: "https://api.example.com",
      transport: base.transport,
      resources: { users: { path: "/users", operations: { getById: flag } } },
    });
    expectTypeOf<
      OptionalOperationName<{
        getAll: () => Promise<User[]>;
        getById?: (id: string) => Promise<User>;
      }>
    >().toEqualTypeOf<"getById">();
    if (false as boolean) {
      const list = useResourceQuery(apis.backend.users, {
        queryKey: ["users"],
        scope: ["backend", "tenant-42"],
        args: [{ params: { orgId: "tenant-42" } }],
      });
      expectTypeOf(list.data).toEqualTypeOf<
        | {
            data: User[];
            nextCursor: string | null;
          }
        | undefined
      >();
      const nestedController = createResourceQueryController(apis.backend.users, {
        queryKey: ["users"],
      });
      // @ts-expect-error a parameterized resource cannot build a list without Core args
      nestedController.listOptions();
      // @ts-expect-error nested resource requires an argument
      useResourceQuery(apis.backend.users, { queryKey: ["users"] });
      const detail = useResourceQuery(apis.backend.users, {
        queryKey: ["users"],
        operation: "getById",
        args: ["42", { params: { orgId: "acme" } }],
      });
      expectTypeOf(detail.data).toEqualTypeOf<User | undefined>();
      const maybe = conditional.users;
      // @ts-expect-error the dynamic operation is optional, not guaranteed callable
      useResourceQuery(maybe, { queryKey: ["u"], operation: "getById", args: ["42"] });
    }
    expect(true).toBe(true);
  });

  it("allows an explicit read when getAll is disabled", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: base.transport,
      resources: {
        users: { path: "/users", operations: ["count"] },
      },
    });
    if (false as boolean) {
      const count = useResourceQuery(api.users, {
        queryKey: ["users"],
        operation: "count",
        args: [],
      });
      expectTypeOf(count.data).toEqualTypeOf<number | undefined>();
      // Without a guaranteed getAll there is no default query state: operation-only mode.
      const opOnly = useResourceQuery(api.users, { queryKey: ["users"] });
      expectTypeOf(opOnly).not.toHaveProperty("data");
      expectTypeOf(opOnly.operations).toHaveProperty("count");
    }
    expect(true).toBe(true);
  });
});

describe("builder and legacy argument contracts", () => {
  it("requires builder identity and rejects full responses", () => {
    if (false as boolean) {
      const optional = { getAll: async (_options?: { filter?: string }) => [] as string[] };
      // @ts-expect-error argument builders require explicit cache identity
      createResourceQueryOptions(optional, { queryKey: ["users"], args: () => [] });
      createResourceQueryOptions(optional, { queryKey: ["users"], args: () => [], keyParts: [] });
      const api = defineApi<AppApi>()({ ...base, resources: { users: { path: "/users" } } });
      const users = useResourceQuery(api.users, { queryKey: ["users"] });
      void users.getAll({ full: false });
      // @ts-expect-error the hook supports raw payloads only
      void users.getAll({ full: true });
    }
  });
});
