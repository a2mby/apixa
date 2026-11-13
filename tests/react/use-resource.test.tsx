/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
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
      if (request.method === "POST" && url.pathname === "/audit") return { body: { ok: true } };
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
          archive: { kind: "write", method: "POST", path: "/:id/archive", hasBody: false },
          refetch: { kind: "read", method: "GET", path: "/refetch" },
          status: { kind: "write", method: "POST", path: "/status", hasBody: false },
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
    await act(() => result.current.archive({ params: { id: "1" } }));
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
            mutations: { create: { onSuccess, invalidate: "lists" } },
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

  it("supports client-only operations through mutations", async () => {
    const { api } = makeApi();
    const sync = vi.fn(async (id: string) => ({ synced: id }));
    const { result } = renderHook(
      () =>
        useResource(api.users, {
          queryKey: ["users"],
          mutations: { sync: { mutationFn: sync, invalidate: false } },
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
        mutations: {
          create: {
            onSuccess: (data) => expectTypeOf(data).toEqualTypeOf<User>(),
          },
          notify: { mutationFn: async (id: string, text: string) => ({ id, text }) },
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
        mutations: { create: { mutationFn: async () => ada } },
      });
    }
    expect(true).toBe(true);
  });
});

describe("unified observed query contract", () => {
  const resource = {
    getAll: async (org: string) => [{ id: org, name: "Ada" }],
    getById: async (id: string) => ({ id, name: "Ada" }),
  };
  it("forwards required arguments and supports observing a detail", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const list = renderHook(
      () => useResource(resource, { queryKey: ["users"], query: { args: ["org"] } }),
      { wrapper },
    );
    await waitFor(() => expect(list.result.current.data?.[0]?.id).toBe("org"));
    const detail = renderHook(
      () =>
        useResource(resource, {
          queryKey: ["users"],
          query: { operation: "getById", args: ["42"], select: (user) => user.name },
        }),
      { wrapper },
    );
    await waitFor(() => expect(detail.result.current.data).toBe("Ada"));
    expect(await detail.result.current.operations.getAll("other")).toEqual([
      { id: "other", name: "Ada" },
    ]);
  });
  it("enforces required arguments and narrows defined data", () => {
    if (false as boolean) {
      // @ts-expect-error getAll requires an organization
      useResource(resource, { queryKey: ["users"] });
      // @ts-expect-error detail requires an identifier
      useResource(resource, { queryKey: ["users"], query: { operation: "getById" } });
      const result = useResource(resource, {
        queryKey: ["users"],
        query: {
          args: ["x"],
          initialData: [{ id: "x", name: "Ada" }],
          select: (users) => users.length,
        },
      });
      expectTypeOf(result.data).toEqualTypeOf<number>();
      const maybeInitial: { id: string; name: string }[] | undefined =
        Math.random() > 0.5 ? [] : undefined;
      const optional = useResource(resource, {
        queryKey: ["users"],
        query: { args: ["x"], initialData: maybeInitial },
      });
      expectTypeOf(optional.data).toEqualTypeOf<{ id: string; name: string }[] | undefined>();
    }
  });
});

describe("optional and operation-only observed reads", () => {
  it("requires arguments for dynamically optional getAll and never calls it without them", async () => {
    const getAll = vi.fn(async (org: string) => [org]);
    const present: { getAll?: typeof getAll } = { getAll };
    const absent: { getAll?: typeof getAll } = {};
    if (false as boolean) {
      // @ts-expect-error optional getAll can exist and requires its argument
      useResource(present, { queryKey: ["optional"] });
      useResource(present, { queryKey: ["optional"], query: { args: ["org"] } });
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrap(client);
    const mounted = renderHook(
      () => useResource(present, { queryKey: ["optional"], query: { args: ["org"] } }),
      { wrapper },
    );
    await waitFor(() => expect(getAll).toHaveBeenCalledWith("org"));
    mounted.unmount();
    renderHook(() => useResource(absent, { queryKey: ["absent"], query: { args: ["org"] } }), {
      wrapper,
    });
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it("observes a classified read on a resource without getAll and inherits the other operations", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { total: 2 } })),
      resources: {
        audit: {
          path: "/audit",
          operations: { getAll: false, stats: { kind: "read", method: "GET", path: "/stats" } },
        },
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useResource(api.audit, {
          queryKey: ["audit"],
          query: { operation: "stats", select: (data) => data },
        }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.data).toEqual({ total: 2 }));
    expect(typeof result.current.operations.getById).toBe("function");
    expect(typeof result.current.operations.create).toBe("function");
  });
});

describe("default query identity", () => {
  it("supports optional arguments and nested Core path parameters", async () => {
    const optional = {
      getAll: vi.fn(async (options?: { filter?: string }) => [options?.filter ?? "all"]),
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useResource(optional, { queryKey: ["optional"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(first.result.current.data).toEqual(["all"]));
    const requests: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        requests.push(request.url);
        return { body: [] };
      }),
      resources: { users: { path: "/organizations/:orgId/users" } },
    });
    renderHook(
      () =>
        useResource(api.users, {
          queryKey: ["nested"],
          query: { args: [{ params: { orgId: "acme" } }] },
        }),
      {
        wrapper: wrap(client),
      },
    );
    await waitFor(() =>
      expect(requests.some((url) => url.includes("/organizations/acme/users"))).toBe(true),
    );
    if (false as boolean) {
      // @ts-expect-error nested path parameter is required
      useResource(api.users, { queryKey: ["nested"] });
      useResource(api.users, {
        queryKey: ["nested"],
        query: { args: [{ params: { orgId: "acme" } }] },
      });
    }
  });
});
