/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { readsDuringRender } from "../helpers/render.js";
import { describe, expect, it, vi } from "vitest";
import { useResourceMutation } from "../../packages/tanstack-query/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";

type User = { id: string; name: string };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function createFakeUsers() {
  let users: User[] = [{ id: "1", name: "Ada" }];
  return {
    getAll: vi.fn(async () => [...users]),
    getById: vi.fn(async (id: string) => users.find((u) => u.id === id)!),
    create: vi.fn(async (body: Omit<User, "id">) => {
      const created = { id: String(users.length + 1), ...body };
      users = [created, ...users];
      return created;
    }),
    update: vi.fn(async (id: string, body: Partial<User>) => {
      users = users.map((u) => (u.id === id ? { ...u, ...body } : u));
      return users.find((u) => u.id === id)!;
    }),
    delete: vi.fn(async (id: string) => {
      users = users.filter((u) => u.id !== id);
    }),
    patch: vi.fn(async (id: string, partial: Partial<User>) => {
      users = users.map((u) => (u.id === id ? { ...u, ...partial } : u));
      return users.find((u) => u.id === id)!;
    }),
    count: vi.fn(async () => users.length),
    archive: vi.fn(async (id: string, reason: string) => ({ id, archived: true, reason })),
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useResourceMutation", () => {
  it("create / update / delete run independently of useResourceQuery and mount no query", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const opts = { queryKey: ["users"] };
    const { result } = renderHook(
      () => ({
        create: useResourceMutation(resource, "create", opts),
        update: useResourceMutation(resource, "update", opts),
        remove: useResourceMutation(resource, "delete", opts),
      }),
      { wrapper: wrap(client) },
    );

    const created = await act(() => result.current.create.mutateAsync([{ name: "Grace" }]));
    expect(created).toEqual({ id: "2", name: "Grace" });
    expect(resource.create).toHaveBeenCalledWith({ name: "Grace" });

    const updated = await act(() => result.current.update.mutateAsync(["2", { name: "Hopper" }]));
    expect(updated).toEqual({ id: "2", name: "Hopper" });
    expect(resource.update).toHaveBeenCalledWith("2", { name: "Hopper" });

    const removed = await act(() => result.current.remove.mutateAsync(["2"]));
    expect(removed).toBeUndefined();
    expect(resource.delete).toHaveBeenCalledWith("2");

    expect(resource.getAll).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
  });

  it("calls builtin and custom operations with tuple args and resolves their result", async () => {
    const resource = createFakeUsers();
    const { result } = renderHook(
      () => ({
        patch: useResourceMutation(resource, "patch", { queryKey: ["users"] }),
        archive: useResourceMutation(resource, "archive", { queryKey: ["users"] }),
      }),
      { wrapper: wrap(newClient()) },
    );

    const patched = await act(() => result.current.patch.mutateAsync(["1", { name: "Ada L." }]));
    expect(resource.patch).toHaveBeenCalledWith("1", { name: "Ada L." });
    expect(patched).toEqual({ id: "1", name: "Ada L." });

    const archived = await act(() => result.current.archive.mutateAsync(["1", "spam"]));
    expect(archived).toEqual({ id: "1", archived: true, reason: "spam" });
  });

  it("uses the resource's key root for its mutation key", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result } = renderHook(
      () => useResourceMutation(resource, "create", { queryKey: ["users"], scope: ["t1"] }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.mutateAsync([{ name: "X" }]));
    expect(client.getMutationCache().getAll()[0]!.options.mutationKey).toEqual([
      "t1",
      "users",
      "mutation",
      "create",
    ]);
  });

  it("invalidates the resource's list after a successful create (shared QueryClient + keys)", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result: query } = renderHook(
      () => readsDuringRender(useResourceQuery(resource, { queryKey: ["users"] }), "data"),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const { result: mutation } = renderHook(
      () => useResourceMutation(resource, "create", { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await act(() => mutation.current.mutateAsync([{ name: "Grace" }]));

    await waitFor(() => expect(resource.getAll).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(query.current.data?.some((u) => u.name === "Grace")).toBe(true));
  });

  it("awaits invalidation before consumer onSuccess, then runs onSettled", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result: query } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const order: string[] = [];
    const { result } = renderHook(
      () =>
        useResourceMutation(resource, "delete", {
          queryKey: ["users"],
          onMutate: () => void order.push("onMutate"),
          onSuccess: () => {
            order.push(`onSuccess(getAll x${resource.getAll.mock.calls.length})`);
          },
          onSettled: () => void order.push("onSettled"),
        }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.mutateAsync(["1"]));
    expect(order).toEqual(["onMutate", "onSuccess(getAll x2)", "onSettled"]);
  });

  it("does not invalidate when invalidate: false", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result: query } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const { result: mutation } = renderHook(
      () => useResourceMutation(resource, "count", { queryKey: ["users"], invalidate: false }),
      { wrapper: wrap(client) },
    );
    await act(() => mutation.current.mutateAsync([]));
    expect(resource.getAll).toHaveBeenCalledTimes(1);
  });

  it("propagates errors to mutateAsync, error state, and onError — without invalidating", async () => {
    const resource = createFakeUsers();
    resource.update.mockRejectedValueOnce(new Error("conflict"));
    const client = newClient();
    const { result: query } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useResourceMutation(resource, "update", { queryKey: ["users"], onError, onSuccess }),
      { wrapper: wrap(client) },
    );
    await act(async () => {
      await expect(result.current.mutateAsync(["1", { name: "X" }])).rejects.toThrow("conflict");
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("conflict");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1]).toEqual(["1", { name: "X" }]);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(resource.getAll).toHaveBeenCalledTimes(1);
  });

  it("mutation pending state never leaks into the list query state", async () => {
    const gate = createDeferred<User>();
    const resource = createFakeUsers();
    resource.create.mockImplementationOnce(() => gate.promise);
    const client = newClient();
    const { result } = renderHook(
      () => ({
        users: useResourceQuery(resource, { queryKey: ["users"] }),
        create: useResourceMutation(resource, "create", { queryKey: ["users"] }),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.users.isSuccess).toBe(true));

    let pending!: Promise<User>;
    act(() => {
      pending = result.current.create.mutateAsync([{ name: "Grace" }]);
    });
    await waitFor(() => expect(result.current.create.isPending).toBe(true));
    expect(result.current.users.isPending).toBe(false);
    expect(result.current.users.isFetching).toBe(false);

    await act(async () => {
      gate.resolve({ id: "2", name: "Grace" });
      await pending;
    });
    await waitFor(() => expect(result.current.create.isPending).toBe(false));
  });
});
