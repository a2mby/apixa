/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { useResource } from "../../packages/tanstack-query/src/use-resource.js";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { readsDuringRender } from "../helpers/render.js";

type User = { id: string; name: string; active: boolean };
const ada: User = { id: "1", name: "Ada", active: true };
const bob: User = { id: "2", name: "Bob", active: false };

function makeApi() {
  let users = [ada, bob];
  const requests: TransportRequest[] = [];
  const api = defineApi<{ users: { entity: User } }>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      requests.push(request);
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/users") {
        const created = { id: String(users.length + 1), ...JSON.parse(String(request.body)) };
        users = [...users, created];
        return { body: created };
      }
      if (request.method === "POST" && url.pathname.endsWith("/archive"))
        return { body: { ok: 1 } };
      if (url.pathname === "/users/stats") return { body: { total: users.length } };
      if (url.pathname === "/users/refetch") return { body: "core refetch" };
      if (url.pathname === "/users/status") return { body: "core status" };
      if (url.pathname.startsWith("/users/")) {
        return { body: users.find((u) => url.pathname.endsWith(`/${u.id}`)) };
      }
      return { body: users };
    }),
    resources: {
      users: {
        path: "/users",
        operations: {
          stats: { kind: "read", method: "GET", path: "/stats" },
          archive: { method: "POST", path: "/:id/archive" },
          refetch: { kind: "read", method: "GET", path: "/refetch" },
          status: { method: "POST", path: "/status" },
        },
      },
      audit: { path: "/audit", operations: { getAll: false } },
    },
  });
  return { api, requests };
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useResource", () => {
  it("exposes flat query state, flat operations, and the guaranteed namespace", async () => {
    const { api } = makeApi();
    const { result } = renderHook(
      () => readsDuringRender(useResource(api.users, { queryKey: ["users"] }), "data"),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.data).toEqual([ada, bob]));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.query.data).toEqual([ada, bob]);
    expect(typeof result.current.getById).toBe("function");
    expect(typeof result.current.create).toBe("function");
    expect(typeof result.current.archive).toBe("function");
    const names = Object.keys(result.current.operations).sort();
    expect(names).toContain("create");
    expect(names).toContain("getAll");
    expect(names).toContain("refetch");
    expect(names).toContain("status");
  });

  it("routes reads through the query cache and writes through mutations", async () => {
    const { api, requests } = makeApi();
    const client = newClient();
    const { result } = renderHook(
      () => readsDuringRender(useResource(api.users, { queryKey: ["users"] }), "data"),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(await act(() => result.current.getById("1"))).toEqual(ada);
    expect(await act(() => result.current.stats())).toEqual({ total: 2 });
    expect(client.getQueryData(["users", "detail", "1"])).toEqual(ada);
    expect(client.getMutationCache().getAll()).toHaveLength(0);

    const created = await act(() => result.current.create({ name: "Cy", active: true }));
    expect(created).toMatchObject({ name: "Cy" });
    expect(client.getMutationCache().getAll()[0]!.options.mutationKey).toEqual([
      "users",
      "mutation",
      "create",
    ]);
    // Default write invalidation refetches the observed list (shared identity).
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(requests.filter((r) => r.method === "GET" && r.url.endsWith("/users"))).toHaveLength(2);
  });

  it("keeps mutation states for writes only and separate from query state", async () => {
    const { api } = makeApi();
    const { result } = renderHook(
      () => {
        const users = useResource(api.users, { queryKey: ["users"] });
        void users.states.create.status;
        return users;
      },
      { wrapper: wrap(newClient()) },
    );
    expect(Object.keys(result.current.states)).not.toContain("getById");
    expect(Object.keys(result.current.states)).toContain("archive");
    await act(() => result.current.archive("1"));
    await waitFor(() => expect(result.current.states.archive.isSuccess).toBe(true));
    expect(result.current.states.create.isIdle).toBe(true);
  });

  it("protects query fields from colliding operation names", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const refetched = await act(() => result.current.refetch());
    expect(refetched.data).toEqual([ada, bob]);
    expect(await act(() => result.current.operations.refetch())).toBe("core refetch");
    expect(typeof result.current.status).toBe("string");
    expect(await act(() => result.current.operations.status())).toBe("core status");
    expectTypeOf(result.current.status).toEqualTypeOf<"pending" | "error" | "success">();
    expectTypeOf(result.current.operations.refetch).returns.resolves.toBeUnknown();
  });

  it("passes query and mutation options through unchanged", async () => {
    const { api } = makeApi();
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResource(api.users, {
            queryKey: ["users"],
            query: { select: (users) => users.filter((u) => u.active).map((u) => u.name) },
            mutation: { mutations: { create: { onSuccess, invalidate: "lists" } } },
          }),
          "data",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.data).toEqual(["Ada"]));
    expectTypeOf(result.current.data).toEqualTypeOf<string[] | undefined>();
    await act(() => result.current.create({ name: "Di", active: true }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.data).toEqual(["Ada", "Di"]));
  });

  it("supports client-only operations through mutation.mutations", async () => {
    const { api } = makeApi();
    const sync = vi.fn(async (id: string) => ({ synced: id }));
    const { result } = renderHook(
      () =>
        useResource(api.users, {
          queryKey: ["users"],
          mutation: { mutations: { sync: { mutationFn: sync, invalidate: false } } },
        }),
      { wrapper: wrap(newClient()) },
    );
    expect(await act(() => result.current.sync("1"))).toEqual({ synced: "1" });
    expect(await act(() => result.current.operations.sync("2"))).toEqual({ synced: "2" });
    expectTypeOf(result.current.sync).returns.resolves.toEqualTypeOf<{ synced: string }>();
    await waitFor(() => expect(result.current.states.sync.data).toEqual({ synced: "2" }));
  });

  it("works for an operation-only resource without starting a query", async () => {
    const { api, requests } = makeApi();
    const client = newClient();
    const { result } = renderHook(() => useResource(api.audit, { queryKey: ["audit"] }), {
      wrapper: wrap(client),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(requests).toHaveLength(0);
    expect(result.current).not.toHaveProperty("data");
    expectTypeOf(result.current).not.toHaveProperty("data");
    expectTypeOf(result.current).not.toHaveProperty("getAll");
    await act(() => result.current.create({}));
    expect(requests).toHaveLength(1);
  });

  it("re-renders no more than native useQuery when only data is read", async () => {
    const { api } = makeApi();
    const client = newClient();
    const counts = { facade: 0, native: 0 };
    renderHook(
      () => {
        counts.facade++;
        return useResource(api.users, { queryKey: ["users"] }).data;
      },
      { wrapper: wrap(client) },
    );
    renderHook(
      () => {
        counts.native++;
        return useQuery({ queryKey: ["native"], queryFn: () => api.users.getAll() }).data;
      },
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(client.getQueryData(["users", "list"])).toBeDefined());
    await waitFor(() => expect(client.getQueryData(["native"])).toBeDefined());
    await act(() => client.refetchQueries());
    expect(counts.facade).toBe(counts.native);
  });
});

describe("useResource types", () => {
  it("composes the exact query and mutation option types", () => {
    const { api } = makeApi();
    if (false as boolean) {
      const users = useResource(api.users, {
        queryKey: ["users"],
        query: { staleTime: 60_000, retry: 2, enabled: () => true },
        mutation: {
          mutations: {
            create: {
              onSuccess: (data) => expectTypeOf(data).toEqualTypeOf<User>(),
            },
            notify: { mutationFn: async (id: string, text: string) => ({ id, text }) },
          },
        },
      });
      expectTypeOf(users.data).toEqualTypeOf<User[] | undefined>();
      expectTypeOf(users.getById).returns.resolves.toEqualTypeOf<User>();
      expectTypeOf(users.create).returns.resolves.toEqualTypeOf<User>();
      expectTypeOf(users.notify).parameters.toEqualTypeOf<[id: string, text: string]>();
      expectTypeOf(users.states.notify.data).toEqualTypeOf<
        { id: string; text: string } | undefined
      >();
      expectTypeOf(users.states).not.toHaveProperty("getById");
      expectTypeOf(users.operations).toHaveProperty("refetch");
      // @ts-expect-error flat refetch is the query helper, not the Core operation
      void users.refetch("x");
      useResource(api.users, {
        queryKey: ["users"],
        // @ts-expect-error the shared identity lives at the top level only
        query: { queryKey: ["other"] },
      });
      useResource(api.users, {
        queryKey: ["users"],
        // @ts-expect-error inherited operations cannot be redefined
        mutation: { mutations: { create: { mutationFn: async () => ada } } },
      });
    }
    expect(true).toBe(true);
  });
});
