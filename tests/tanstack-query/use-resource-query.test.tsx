/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";

type User = { id: string; name: string };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakeUsers(options?: { gateCreate?: ReturnType<typeof createDeferred<User>> }) {
  let users: User[] = [{ id: "1", name: "Ada" }];
  return {
    getAll: vi.fn(async () => [...users]),
    getById: vi.fn(async (id: string) => {
      const found = users.find((u) => u.id === id);
      if (!found) throw new Error("missing");
      return found;
    }),
    create: vi.fn(async (body: Omit<User, "id">) => {
      if (options?.gateCreate) {
        const created = await options.gateCreate.promise;
        users = [created, ...users];
        return created;
      }
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
  };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useResourceQuery", () => {
  it("omits mutation wrappers for a read-only resource", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const resource = {
      getAll: async () => [{ id: "1", name: "Ada" }],
      getById: async (id: string) => ({ id, name: "Ada" }),
    };
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current).not.toHaveProperty("create");
    expect(result.current).not.toHaveProperty("update");
    expect(result.current).not.toHaveProperty("delete");
    expect(result.current.mutations).toEqual({});
  });

  it("exposes list state separately from mutation pending", async () => {
    const gate = createDeferred<User>();
    const resource = createFakeUsers({ gateCreate: gate });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toEqual([{ id: "1", name: "Ada" }]);
    expect(result.current.mutations.create.isPending).toBe(false);

    let createPromise!: Promise<User>;
    act(() => {
      createPromise = result.current.create({ name: "Grace" });
    });

    await waitFor(() => expect(result.current.mutations.create.isPending).toBe(true));
    // List already has data — create pending must not flip list isPending
    expect(result.current.isPending).toBe(false);

    await act(async () => {
      gate.resolve({ id: "2", name: "Grace" });
      await createPromise;
    });

    await waitFor(() => expect(result.current.mutations.create.isPending).toBe(false));
    await waitFor(() => expect(result.current.data?.some((u) => u.name === "Grace")).toBe(true));
  });

  it("getById seeds detail cache without a detail observer", async () => {
    const resource = createFakeUsers();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const user = await act(() => result.current.getById("1"));
    expect(user).toEqual({ id: "1", name: "Ada" });
    expect(client.getQueryData(result.current.keys.detail("1"))).toEqual(user);
  });
});
