import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createResourceController } from "../../packages/tanstack-query/src/controller.js";

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

  it("invalidates lists and seeds detail after create; runs consumer onSuccess after sync", async () => {
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
    const data = await mutation.mutationFn!({ name: "Grace" }, ctx);
    order.push("resolved");
    await mutation.onSuccess?.(data, { name: "Grace" }, undefined, ctx);

    expect(order[0]).toBe("resolved");
    expect(client.getQueryData(controller.keys.detail("2"))).toEqual({
      id: "2",
      name: "Grace",
    });
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
    await expect(mutation.mutationFn!({ name: "X" }, ctx)).rejects.toThrow("boom");
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
    await mutation.mutationFn!("1", ctx);
    await mutation.onSuccess?.(undefined as void, "1", undefined, ctx);

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
