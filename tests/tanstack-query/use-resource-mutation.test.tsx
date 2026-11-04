/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResourceMutation } from "../../packages/tanstack-query/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";

type User = { id: string; name: string };

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
  };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useResourceMutation", () => {
  it("calls the named operation with the given args and resolves its result", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result } = renderHook(
      () => useResourceMutation(resource, "patch", { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );

    let response: User | undefined;
    await act(async () => {
      response = await result.current.mutateAsync(["1", { name: "Ada Lovelace" }]);
    });

    expect(resource.patch).toHaveBeenCalledWith("1", { name: "Ada Lovelace" });
    expect(response).toEqual({ id: "1", name: "Ada Lovelace" });
  });

  it("invalidates the resource's list query on success by default", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result: query } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const { result: mutation } = renderHook(
      () => useResourceMutation(resource, "patch", { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await mutation.current.mutateAsync(["1", { name: "Ada Lovelace" }]);
    });

    // getAll was called once for the initial query and once more after invalidation.
    await waitFor(() => expect(resource.getAll).toHaveBeenCalledTimes(2));
  });

  it("does not invalidate when invalidate: false", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result: query } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));

    const { result: mutation } = renderHook(
      () => useResourceMutation(resource, "count", { queryKey: ["users"], invalidate: false }),
      { wrapper: wrap(client) },
    );

    await act(async () => {
      await mutation.current.mutateAsync([]);
    });

    expect(resource.getAll).toHaveBeenCalledTimes(1);
  });
});
