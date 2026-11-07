/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { readsDuringRender } from "../helpers/render.js";

const tanstack = vi.hoisted(() => ({ useMutation: vi.fn() }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  tanstack.useMutation.mockImplementation(actual.useMutation);
  return { ...actual, useMutation: tanstack.useMutation };
});

type User = { id: string; name: string };

function createFakeUsers() {
  let users: User[] = [{ id: "1", name: "Ada" }];
  return {
    getAll: vi.fn(async (_options?: { query?: { active?: boolean }; signal?: AbortSignal }) => [
      ...users,
    ]),
    getById: vi.fn(async (id: string) => {
      const found = users.find((u) => u.id === id);
      if (!found) throw new Error("missing");
      return found;
    }),
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
    _push(user: User) {
      users = [...users, user];
    },
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

afterEach(() => tanstack.useMutation.mockClear());

describe("useResourceQuery (query-only)", () => {
  it("loads the list and moves through pending → success states", async () => {
    const resource = createFakeUsers();
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    expect(result.current.isPending).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.status).toBe("pending");
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "1", name: "Ada" }]);
    expect(result.current.status).toBe("success");
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.query.data).toBe(result.current.data);
    expect(resource.getAll).toHaveBeenCalledTimes(1);
  });

  it("exposes list errors through error / isError / status", async () => {
    const resource = createFakeUsers();
    resource.getAll.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.status).toBe("error");
    expect(result.current.isSuccess).toBe(false);
  });

  it("puts list query params in the key and passes them to getAll", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          scope: ["tenant"],
          query: { active: true },
        }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(resource.getAll.mock.calls[0]![0]).toMatchObject({ query: { active: true } });
    expect(client.getQueryData(["tenant", "users", "list", { active: true }])).toEqual(
      result.current.data,
    );
  });

  it("does not fetch while enabled: false", async () => {
    const resource = createFakeUsers();
    const { result } = renderHook(
      () => useResourceQuery(resource, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(newClient()) },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(resource.getAll).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
  });

  it("getById fetches imperatively and seeds the detail cache without a detail observer", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const user = await act(() => result.current.getById("1"));
    expect(user).toEqual({ id: "1", name: "Ada" });
    expect(client.getQueryData(result.current.keys.detail("1"))).toEqual(user);
    expect(
      client
        .getQueryCache()
        .find({ queryKey: ["users", "detail", "1"] })
        ?.getObserversCount(),
    ).toBe(0);
  });

  it("refetch() re-runs the list query", async () => {
    const resource = createFakeUsers();
    const { result } = renderHook(
      () => readsDuringRender(useResourceQuery(resource, { queryKey: ["users"] }), "data"),
      {
        wrapper: wrap(newClient()),
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    resource._push({ id: "2", name: "Grace" });

    const refetched = await act(() => result.current.refetch());
    expect(refetched.data).toHaveLength(2);
    expect(resource.getAll).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it("invalidate() marks the resource's queries stale and refetches the active list", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => result.current.getById("1"));

    await act(() => result.current.invalidate());
    expect(resource.getAll).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(result.current.keys.detail("1"))?.isInvalidated).toBe(true);
  });

  it("mounts no mutation observers and exposes no write surface at runtime", async () => {
    const resource = createFakeUsers();
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(resource, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tanstack.useMutation).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    for (const key of ["create", "update", "delete", "mutations"]) {
      expect(result.current).not.toHaveProperty(key);
    }
    for (const key of ["createOptions", "updateOptions", "deleteOptions"]) {
      expect(result.current.controller).not.toHaveProperty(key);
    }
    expect(resource.create).not.toHaveBeenCalled();
  });

  it("works with a read-only resource and omits getById when the resource has none", async () => {
    const readOnly = { getAll: async () => [{ id: "1", name: "Ada" }] };
    const { result } = renderHook(() => useResourceQuery(readOnly, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current).not.toHaveProperty("getById");
  });
});
