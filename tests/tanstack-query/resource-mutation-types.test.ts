import { defineApi } from "@apixa/core";
import type { MutationObserverResult } from "@tanstack/react-query";
import { describe, expect, expectTypeOf, it } from "vitest";
import { useResourceMutation } from "../../packages/tanstack-query/src/use-resource-mutation.js";
import { createResourceMutationController } from "../../packages/tanstack-query/src/mutation-controller.js";
import { createResourceController } from "../../packages/tanstack-query/src/controller.js";
import type { OperationParameters } from "../../packages/tanstack-query/src/types.js";
import type { CreateBodyOf } from "../helpers/types.js";

type User = { id: string; name: string; email: string };
declare const external: { archive(id: string): Promise<{ archived: true }> };

const api = defineApi<{ users: { entity: User }; org: { entity: User } }>()({
  baseURL: "https://api.example.com",
  resources: {
    users: {
      path: "/users",
      operations: {
        deleteMany: false,
        archive: { kind: "write", method: "POST", path: "/:id/archive" },
        stats: {
          kind: "read",
          run: async (ctx, range: "day" | "week") =>
            ctx.request<{ total: number }>({ query: { range } }),
        },
        patch: async (ctx, id: string, name: string) =>
          ctx.request<User>({ method: "PATCH", path: `/${id}`, body: { name } }),
      },
    },
    org: { path: "/orgs/:orgId/users" },
  },
});

/** Core's tuple with `full` constrained to `false` (hooks always resolve unwrapped payloads). */
type CreateArgs = OperationParameters<typeof api.users, "create">;

describe("resource-wide useResourceMutation types", () => {
  it("inherits every enabled operation with exact Core signatures", () => {
    if (false as boolean) {
      const users = useResourceMutation(api.users, { queryKey: ["users"] });
      expectTypeOf(users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
      expectTypeOf(users.create).returns.resolves.toEqualTypeOf<User>();
      expectTypeOf(users.update).parameter(0).toEqualTypeOf<string>();
      expectTypeOf(users.delete).returns.resolves.toEqualTypeOf<void>();
      expectTypeOf(users.archive).parameter(0).toEqualTypeOf<string>();
      expectTypeOf(users).not.toHaveProperty("stats");
      expectTypeOf(users.patch).parameters.toEqualTypeOf<[id: string, name: string]>();
      expectTypeOf(users.operations.create).toEqualTypeOf(users.create);
      expectTypeOf(users.states.create).toEqualTypeOf<
        MutationObserverResult<User, Error, CreateArgs, unknown>
      >();
      // @ts-expect-error deleteMany is disabled in Core
      void users.deleteMany;
      // @ts-expect-error disabled operations have no state either
      void users.states.deleteMany;

      const org = useResourceMutation(api.org, { queryKey: ["org"] });
      expectTypeOf(org.update)
        .parameter(0)
        .toEqualTypeOf<{ orgId: string | number; id: string | number }>();
      expectTypeOf(org).not.toHaveProperty("getAll");
    }
    expect(true).toBe(true);
  });

  it("types per-operation config, callbacks, and client-only operations", () => {
    if (false as boolean) {
      const users = useResourceMutation(api.users, {
        queryKey: ["users"],
        mutations: {
          create: {
            retry: 1,
            retryDelay: 10,
            gcTime: 1000,
            networkMode: "always",
            scope: { id: "users" },
            throwOnError: false,
            meta: { audit: true },
            onMutate: () => ({ snapshot: 1 as const }),
            onSuccess: (data, args, context) => {
              expectTypeOf(data).toEqualTypeOf<User>();
              expectTypeOf(args).toEqualTypeOf<CreateArgs>();
              expectTypeOf(context).toEqualTypeOf<{ snapshot: 1 }>();
            },
            onError: (error, args) => {
              expectTypeOf(error).toEqualTypeOf<Error>();
              expectTypeOf(args[0]).toEqualTypeOf<CreateBodyOf<User>>();
            },
          },
          update: {
            invalidate: "lists",
            onSettled: (data, error) => {
              expectTypeOf(data).toEqualTypeOf<User | undefined>();
              expectTypeOf(error).toEqualTypeOf<Error | null>();
            },
          },
          delete: { invalidate: { details: (_data, [id]) => [id] } },
          archiveExternally: {
            mutationFn: async (id: string) => external.archive(id),
            onSuccess: (data, args) => {
              expectTypeOf(data).toEqualTypeOf<{ archived: true }>();
              expectTypeOf(args).toEqualTypeOf<[id: string]>();
            },
          },
        },
      });
      expectTypeOf(users.archiveExternally).parameters.toEqualTypeOf<[id: string]>();
      expectTypeOf(users.archiveExternally).returns.resolves.toEqualTypeOf<{ archived: true }>();
      expectTypeOf(users.states.archiveExternally.data).toEqualTypeOf<
        { archived: true } | undefined
      >();
      expectTypeOf(users.states.create.context).toEqualTypeOf<{ snapshot: 1 } | undefined>();

      useResourceMutation(api.users, {
        queryKey: ["users"],
        // @ts-expect-error inherited operations cannot be redefined
        mutations: { create: { mutationFn: async () => ({}) as User } },
      });
      useResourceMutation(api.users, {
        queryKey: ["users"],
        // @ts-expect-error unknown operation without a mutationFn
        mutations: { archvie: { retry: 1 } },
      });
      useResourceMutation(api.users, {
        queryKey: ["users"],
        // @ts-expect-error disabled operations cannot be configured as inherited
        mutations: { deleteMany: { retry: 1 } },
      });
      useResourceMutation(api.users, {
        queryKey: ["users"],
        // @ts-expect-error invalid invalidation policy
        mutations: { update: { invalidate: "detail" } },
      });
    }
    expect(true).toBe(true);
  });

  it("advanced controllers preserve parameterized Core tuples without requiring getAll", () => {
    const writeOnly = defineApi<{ org: { entity: User } }>()({
      baseURL: "https://api.example.com",
      resources: {
        org: { path: "/orgs/:orgId/users", writeOnly: true, operations: { delete: false } },
      },
    });
    const mutation = createResourceMutationController(writeOnly.org, { queryKey: ["org"] });
    const combined = createResourceController(writeOnly.org, { queryKey: ["org"] });
    type CreateOptions = ReturnType<typeof mutation.createOptions>;
    type UpdateOptions = ReturnType<typeof mutation.updateOptions>;
    expectTypeOf<Parameters<NonNullable<CreateOptions["mutationFn"]>>[0]>().toEqualTypeOf<
      OperationParameters<typeof writeOnly.org, "create">
    >();
    expectTypeOf<Parameters<NonNullable<UpdateOptions["mutationFn"]>>[0]>().toEqualTypeOf<
      OperationParameters<typeof writeOnly.org, "update">
    >();
    expectTypeOf(mutation).not.toHaveProperty("deleteOptions");
    expectTypeOf(combined.listOptions).toBeNever();
    expectTypeOf(combined).toHaveProperty("createOptions");
  });
});
