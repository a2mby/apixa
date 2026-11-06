import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createResourceController } from "../../packages/tanstack-query/src/controller.js";
import { createResourceKeys } from "../../packages/tanstack-query/src/keys.js";
import {
  createResourceMutationController,
  operationMutationOptions,
} from "../../packages/tanstack-query/src/mutation-controller.js";
import { createResourceQueryController } from "../../packages/tanstack-query/src/query-controller.js";

type User = { id: string; name: string };

function createFakeUsers() {
  const users: User[] = [{ id: "1", name: "Ada" }];

  return {
    getAll: vi.fn(async (options?: { query?: { active?: boolean }; signal?: AbortSignal }) => {
      void options?.signal;
      if (options?.query?.active) {
        return users.filter((u) => u.name.startsWith("A"));
      }
      return [...users];
    }),
    getById: vi.fn(async (id: string) => {
      const found = users.find((u) => u.id === id);
      if (!found) throw new Error("not found");
      return found;
    }),
    create: vi.fn(async (body: Omit<User, "id">) => {
      const created = { id: "2", ...body };
      users.unshift(created);
      return created;
    }),
    update: vi.fn(async (id: string, body: Partial<User>) => {
      const index = users.findIndex((u) => u.id === id);
      if (index < 0) throw new Error("not found");
      users[index] = { ...users[index]!, ...body, id };
      return users[index]!;
    }),
    delete: vi.fn(async (id: string) => {
      const index = users.findIndex((u) => u.id === id);
      if (index >= 0) users.splice(index, 1);
    }),
    _users: users,
  };
}

describe("createResourceController cache policy", () => {
  it("includes list query params in the list key", () => {
    const resource = createFakeUsers();
    const controller = createResourceController(resource, {
      queryKey: ["users"],
      query: { active: true },
    });

    expect(controller.listOptions().queryKey).toEqual(["users", "list", { active: true }]);
  });

  it("invalidates lists after create; runs consumer onSuccess after sync", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const controller = createResourceController(resource, { queryKey: ["users"] });

    await client.prefetchQuery(controller.listOptions());
    expect(client.getQueryData(controller.keys.list())).toEqual([{ id: "1", name: "Ada" }]);

    const order: string[] = [];
    let consumerSawInvalidated = false;
    const mutation = controller.createOptions({
      onSuccess: async () => {
        order.push("consumer");
        consumerSawInvalidated =
          client.getQueryState(controller.keys.list())?.isInvalidated === true;
      },
    });

    const ctx = {
      client,
      meta: undefined as undefined,
      mutationKey: controller.keys.mutation("create"),
    };
    // TanStack v5 mutationFn(variables, context)
    const data = await mutation.mutationFn!([{ name: "Grace" }], ctx);
    order.push("resolved");
    await mutation.onSuccess?.(data, [{ name: "Grace" }], undefined, ctx);

    expect(order[0]).toBe("resolved");
    expect(client.getQueryData(controller.keys.detail("2"))).toBeUndefined();
    expect(order).toContain("consumer");
    expect(consumerSawInvalidated).toBe(true);
  });

  it("does not invalidate lists when create onSuccess is skipped (failure path)", async () => {
    const resource = createFakeUsers();
    resource.create = vi.fn(async () => {
      throw new Error("boom");
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const controller = createResourceController(resource, { queryKey: ["users"] });
    await client.prefetchQuery(controller.listOptions());

    const mutation = controller.createOptions();
    const ctx = {
      client,
      meta: undefined as undefined,
      mutationKey: controller.keys.mutation("create"),
    };
    await expect(mutation.mutationFn!([{ name: "X" }], ctx)).rejects.toThrow("boom");
    // onSuccess not called → list still valid
    expect(client.getQueryState(controller.keys.list())?.isInvalidated).toBeFalsy();
  });

  it("removes detail and invalidates lists after delete", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const controller = createResourceController(resource, { queryKey: ["users"] });

    client.setQueryData(controller.keys.detail("1"), { id: "1", name: "Ada" });
    await client.prefetchQuery(controller.listOptions());

    const mutation = controller.deleteOptions();
    const ctx = {
      client,
      meta: undefined as undefined,
      mutationKey: controller.keys.mutation("delete"),
    };
    await mutation.mutationFn!(["1"], ctx);
    await mutation.onSuccess?.(undefined as void, ["1"], undefined, ctx);

    expect(client.getQueryData(controller.keys.detail("1"))).toBeUndefined();
    expect(client.getQueryState(controller.keys.list())?.isInvalidated).toBe(true);
  });

  it("fetchDetail seeds the detail cache", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const controller = createResourceController(resource, { queryKey: ["users"] });

    const user = await controller.fetchDetail(client, "1");
    expect(user).toEqual({ id: "1", name: "Ada" });
    expect(client.getQueryData(controller.keys.detail("1"))).toEqual(user);
  });
});

describe("query / mutation controller separation", () => {
  it("uses exact tuples for writes on a resource without getAll", async () => {
    const resource = {
      create: vi.fn(async (orgId: string, body: { name: string }) => ({ id: "1", orgId, ...body })),
      update: vi.fn(async (key: { orgId: string; id: string }, body: { name: string }) => ({
        ...key,
        ...body,
      })),
    };
    const controller = createResourceMutationController(resource, { queryKey: ["org-users"] });
    const ctx = {
      client: new QueryClient(),
      meta: undefined,
      mutationKey: controller.keys.mutation("create"),
    };
    const created = await controller.createOptions().mutationFn!(["acme", { name: "Ada" }], ctx);
    expect(created).toEqual({ id: "1", orgId: "acme", name: "Ada" });
    expect(resource.create).toHaveBeenCalledWith("acme", { name: "Ada" });
    const updated = await controller.updateOptions().mutationFn!(
      [{ orgId: "acme", id: "1" }, { name: "Grace" }],
      ctx,
    );
    expect(updated.name).toBe("Grace");
    expect(resource.update).toHaveBeenCalledWith({ orgId: "acme", id: "1" }, { name: "Grace" });
    expect(controller).not.toHaveProperty("deleteOptions");
  });
  it("the query controller is read-only; the mutation controller is write-only", () => {
    const resource = createFakeUsers();
    const query = createResourceQueryController(resource, { queryKey: ["users"] });
    const mutation = createResourceMutationController(resource, { queryKey: ["users"] });
    expect(Object.keys(query).sort()).toEqual(
      [
        "cancel",
        "detailOptions",
        "ensure",
        "fetch",
        "fetchDetail",
        "fetchOperation",
        "getCached",
        "invalidate",
        "invalidateDetail",
        "invalidateLists",
        "keys",
        "listOptions",
        "listQueryParams",
        "operationOptions",
        "prefetch",
        "refetch",
        "remove",
        "reset",
        "setCached",
      ].sort(),
    );
    expect(Object.keys(mutation).sort()).toEqual(
      ["createOptions", "deleteOptions", "keys", "updateOptions"].sort(),
    );
  });

  it("createResourceController composes both over one shared key factory", () => {
    const resource = createFakeUsers();
    const controller = createResourceController(resource, { queryKey: ["users"], scope: ["t"] });
    expect(controller.listOptions().queryKey).toEqual(["t", "users", "list"]);
    expect(controller.createOptions()).toHaveProperty("mutationKey", [
      "t",
      "users",
      "mutation",
      "create",
    ]);
    expect(typeof controller.fetchDetail).toBe("function");
  });

  it("operationMutationOptions runs any named op with tuple args and invalidates the root on success", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = createResourceKeys({ queryKey: ["users"] });
    const query = createResourceQueryController(resource, { queryKey: ["users"] }, keys);
    await client.prefetchQuery(query.listOptions());
    client.setQueryData(keys.detail("1"), { id: "1", name: "Ada" });

    const options = operationMutationOptions({ update: resource.update }, "update", keys);
    expect(options.mutationKey).toEqual(["users", "mutation", "update"]);
    const ctx = { client, meta: undefined, mutationKey: options.mutationKey };
    const data = await options.mutationFn!(["1", { name: "Grace" }], ctx);
    expect(data).toEqual({ id: "1", name: "Grace" });
    await options.onSuccess?.(data, ["1", { name: "Grace" }], undefined, ctx);
    expect(client.getQueryState(keys.list())?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.detail("1"))?.isInvalidated).toBe(true);
  });

  it("operationMutationOptions throws a clear error for an operation the resource lacks", () => {
    const keys = createResourceKeys({ queryKey: ["users"] });
    const options = operationMutationOptions(
      { getAll: async () => [] } as Record<string, () => Promise<unknown>>,
      "archive",
      keys,
    );
    const ctx = { client: new QueryClient(), meta: undefined, mutationKey: options.mutationKey };
    expect(() => options.mutationFn!([] as never, ctx)).toThrow(
      "Resource has no archive operation.",
    );
  });

  it("the query modules never import mutation APIs", async () => {
    const root = new URL("../../packages/tanstack-query/src/", import.meta.url);
    for (const file of ["query-controller.ts", "use-resource-query.ts"]) {
      const source = await readFile(new URL(file, root), "utf8");
      expect(source, file).not.toMatch(/useMutation|mutationOptions|mutation-controller/);
    }
  });
});

describe("safe advanced cache synchronization", () => {
  it("invalidates rather than replacing details for arbitrary responses", async () => {
    const { syncCacheAfterUpdate } = await import("../../packages/tanstack-query/src/cache.js");
    for (const response of [
      null,
      undefined,
      { name: "Grace" },
      { ok: true },
      { data: { id: "1" } },
      { id: "1", name: "Grace" },
    ]) {
      const client = new QueryClient();
      const keys = createResourceKeys({ queryKey: ["users"] });
      const original = { id: "1", name: "Ada", email: "ada@example.com" };
      client.setQueryData(keys.detail("1"), original);
      await syncCacheAfterUpdate(client, keys, response, { id: "1" });
      expect(client.getQueryData(keys.detail("1"))).toEqual(original);
      expect(client.getQueryState(keys.detail("1"))?.isInvalidated).toBe(true);
    }
  });

  it("accepts an explicit mapping for complete entities with custom IDs", async () => {
    const { syncCacheAfterCreate, syncCacheAfterUpdate } =
      await import("../../packages/tanstack-query/src/cache.js");
    const client = new QueryClient();
    const keys = createResourceKeys({ queryKey: ["users"] });
    const response = { data: { userId: "1", name: "Grace" } };
    const map = (value: typeof response) => ({ id: value.data.userId, entity: value.data });
    await syncCacheAfterCreate(client, keys, response, map);
    await syncCacheAfterUpdate(client, keys, response, { id: "1" }, map);
    expect(client.getQueryData(keys.detail("1"))).toEqual(response.data);
  });
});
