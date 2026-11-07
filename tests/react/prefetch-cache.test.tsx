/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { newClient, observersOf, wrap } from "../helpers/query.js";
import { readsDuringRender } from "../helpers/render.js";

type User = { id: string; name: string };
const ada: User = { id: "1", name: "Ada" };
const grace: User = { id: "2", name: "Grace" };

function recordingApi() {
  const requests: TransportRequest[] = [];
  const api = defineApi<{ users: { entity: User } }>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname === "/users/stats") return { body: { total: 2 } };
      if (url.pathname.startsWith("/users/")) {
        return { body: url.pathname.endsWith("/2") ? grace : ada };
      }
      return { body: [ada, grace] };
    }),
    resources: {
      users: {
        path: "/users",
        operations: {
          stats: {
            kind: "read",
            run: (ctx, period: "day" | "week") =>
              ctx.request<{ total: number }>({ path: "/stats", query: { period } }),
          },
          archive: { kind: "write", method: "POST", path: "/:id/archive" },
        },
      },
    },
  });
  const paths = () => requests.map((r) => new URL(r.url).pathname + new URL(r.url).search);
  return { api, requests, paths };
}

describe("prefetch", () => {
  it("prefetch() fills the observed key with the hook's options and creates no observer", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false, staleTime: 60_000 }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.prefetch());
    expect(requests).toHaveLength(1);
    expect(client.getQueryData(["users", "list"])).toEqual([ada, grace]);
    // Fresh per staleTime: prefetching again does not fetch.
    await act(() => result.current.prefetch());
    expect(requests).toHaveLength(1);
  });

  it("stale data is prefetched again (native staleTime semantics)", async () => {
    const { api, requests } = recordingApi();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(newClient()) },
    );
    await act(() => result.current.prefetch());
    await act(() => result.current.prefetch());
    expect(requests).toHaveLength(2);
  });

  it("prefetches another read under the same key the hook and imperative call use", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false, staleTime: 60_000 }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.prefetch({ operation: "getById", args: ["2"] }));
    expect(client.getQueryData(result.current.keys.detail("2"))).toEqual(grace);
    expect(observersOf(client, result.current.keys.detail("2"))).toBe(0);

    const detail = renderHook(
      () =>
        useResourceQuery(api.users, {
          queryKey: ["users"],
          operation: "getById",
          args: ["2"],
          staleTime: 60_000,
        }),
      { wrapper: wrap(client) },
    );
    expect(readsDuringRender(detail.result.current, "data").data).toEqual(grace);
    expect(requests).toHaveLength(1);
  });

  it("prefetches a custom read and a getAll query", async () => {
    const { api, paths } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.prefetch({ operation: "stats", args: ["week"] }));
    await act(() => result.current.prefetch({ query: { page: 2 } }));
    expect(paths()).toEqual(["/users/stats?period=week", "/users?page=2"]);
    expect(client.getQueryData(result.current.keys.operation("stats", ["week"]))).toEqual({
      total: 2,
    });
    expect(client.getQueryData(result.current.keys.list({ page: 2 }))).toEqual([ada, grace]);
  });

  it("rejects writes and missing reads", async () => {
    const { api, requests } = recordingApi();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(newClient()) },
    );
    expect(() =>
      // @ts-expect-error create is a write
      result.current.prefetch({ operation: "create", args: [{ name: "x" }] }),
    ).toThrow(/not a read/);
    expect(() =>
      // @ts-expect-error archive is a write
      result.current.prefetch({ operation: "archive", args: ["1"] }),
    ).toThrow(/not a read/);
    expect(requests).toHaveLength(0);
  });

  it("deduplicates concurrent prefetches and isolates scopes", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const a = renderHook(
      () =>
        useResourceQuery(api.users, { queryKey: ["users"], scope: ["tenant-a"], enabled: false }),
      { wrapper: wrap(client) },
    );
    const b = renderHook(
      () =>
        useResourceQuery(api.users, { queryKey: ["users"], scope: ["tenant-b"], enabled: false }),
      { wrapper: wrap(client) },
    );
    await act(() => Promise.all([a.result.current.prefetch(), a.result.current.prefetch()]));
    expect(requests).toHaveLength(1);
    expect(client.getQueryData(["tenant-a", "users", "list"])).toEqual([ada, grace]);
    expect(client.getQueryData(["tenant-b", "users", "list"])).toBeUndefined();
    await act(() => b.result.current.prefetch());
    expect(requests).toHaveLength(2);
  });

  it("is available on useResource", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => useResource(api.users, { queryKey: ["users"], query: { enabled: false } }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.prefetch({ operation: "getById", args: ["1"] }));
    expect(requests).toHaveLength(1);
    expect(result.current.cache.get({ operation: "getById", args: ["1"] })).toEqual(ada);
  });
});

describe("cache helpers", () => {
  it("get / set / remove target the observed query without fetching", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => readsDuringRender(useResourceQuery(api.users, { queryKey: ["users"] }), "data"),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.data).toEqual([ada, grace]));
    expect(requests).toHaveLength(1);

    expect(result.current.cache.get()).toEqual([ada, grace]);
    const newUser = { id: "3", name: "Linus" };
    act(() => {
      result.current.cache.set((old) => [...(old ?? []), newUser]);
    });
    await waitFor(() => expect(result.current.data).toEqual([ada, grace, newUser]));
    expect(requests).toHaveLength(1);

    client.setQueryData(result.current.keys.detail("1"), ada);
    act(() => result.current.cache.remove());
    expect(client.getQueryData(["users", "list"])).toBeUndefined();
    // Exact by default: the detail entry survives.
    expect(client.getQueryData(result.current.keys.detail("1"))).toEqual(ada);
  });

  it("targets other reads, keeps raw data separate from select, and removes by explicit prefix", async () => {
    const { api } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.users, {
            queryKey: ["users"],
            select: (users) => users.map((u) => u.name),
          }),
          "data",
        ),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.data).toEqual(["Ada", "Grace"]));
    // Raw cache, not the selected strings.
    expect(result.current.cache.get()).toEqual([ada, grace]);
    expectTypeOf(result.current.cache.get()).toEqualTypeOf<User[] | undefined>();

    act(() => {
      result.current.cache.set({ ...ada, name: "Ada L." }, { operation: "getById", args: ["1"] });
    });
    expect(result.current.cache.get({ operation: "getById", args: ["1"] })).toEqual({
      ...ada,
      name: "Ada L.",
    });
    expectTypeOf(result.current.cache.get({ operation: "getById", args: ["1"] })).toEqualTypeOf<
      User | undefined
    >();
    expect(() => result.current.cache.get({ all: true } as never)).toThrow(/not a prefix/);

    act(() => result.current.cache.remove({ all: true }));
    expect(client.getQueryCache().findAll({ queryKey: ["users"] })).toHaveLength(0);
  });

  it("types: set rejects data of the wrong shape", () => {
    const { api } = recordingApi();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(newClient()) },
    );
    // @ts-expect-error a list entry holds User[]
    void (() => result.current.cache.set([{ id: 1 }]));
    // @ts-expect-error a detail entry holds User
    void (() => result.current.cache.set([ada], { operation: "getById", args: ["1"] }));
  });

  it("operation-only resources require a target", () => {
    const client = newClient();
    const ops = { getById: vi.fn(async (id: string) => ({ ...ada, id })) };
    const { result } = renderHook(() => useResourceQuery(ops, { queryKey: ["ops"] }), {
      wrapper: wrap(client),
    });
    expect(() => (result.current.cache.get as () => unknown)()).toThrow(/observes nothing/);
    client.setQueryData(["ops", "detail", "1"], ada);
    expect(result.current.cache.get({ operation: "getById", args: ["1"] })).toEqual(ada);
  });
});

describe("dynamic query keys", () => {
  it("dynamic queryKey and query values change identity, equivalent objects share it", async () => {
    const { api, paths } = recordingApi();
    const client = newClient();
    const { result, rerender } = renderHook(
      (props: { page: number; filter: Record<string, unknown> }) =>
        readsDuringRender(
          useResourceQuery(api.users, {
            queryKey: ["users", { page: props.page, ...props.filter }],
            query: { page: props.page, ...props.filter },
            staleTime: 60_000,
          }),
          "data",
        ),
      { wrapper: wrap(client), initialProps: { page: 1, filter: { a: 1, b: 2 } } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ page: 2, filter: { a: 1, b: 2 } });
    await waitFor(() => expect(paths()).toHaveLength(2));
    // Same values, different property order: same TanStack hash, no request.
    rerender({ page: 2, filter: { b: 2, a: 1 } });
    rerender({ page: 2, filter: { b: 3, a: 1 } });
    await waitFor(() => expect(paths()).toHaveLength(3));
    expect(paths()).toEqual([
      "/users?page=1&a=1&b=2",
      "/users?page=2&a=1&b=2",
      "/users?page=2&b=3&a=1",
    ]);
    // The resource-wide prefix still covers every dynamic root.
    expect(client.getQueryCache().findAll({ queryKey: ["users"] })).toHaveLength(3);
  });

  it("different operations with similar arguments never share entries", async () => {
    const { api } = recordingApi();
    const client = newClient();
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], enabled: false }),
      { wrapper: wrap(client) },
    );
    await act(() => result.current.prefetch({ operation: "getById", args: ["1"] }));
    await act(() => result.current.prefetch({ operation: "stats", args: ["day"] }));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toEqual([
      ["users", "list"], // the (disabled) observed list
      ["users", "detail", "1"],
      ["users", "operation", "stats", "day"],
    ]);
  });

  it("responds to prop changes in a component", async () => {
    const { api, paths } = recordingApi();
    const { result } = renderHook(
      () => {
        const [search, setSearch] = useState("a");
        const users = useResourceQuery(api.users, {
          queryKey: ["users", { search }],
          query: { search },
        });
        return { users: readsDuringRender(users, "data"), setSearch };
      },
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.users.data).toBeDefined());
    act(() => result.current.setSearch("b"));
    await waitFor(() => expect(paths()).toEqual(["/users?search=a", "/users?search=b"]));
  });
});
