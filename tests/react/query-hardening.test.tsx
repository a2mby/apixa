/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string };
const ada: User = { id: "1", name: "Ada" };

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function recordingApi(respond: (request: TransportRequest) => unknown = () => [ada]) {
  const requests: TransportRequest[] = [];
  const api = defineApi<{ users: { entity: User }; members: { entity: User } }>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      requests.push(request);
      return { body: respond(request) };
    }),
    resources: {
      users: {
        path: "/users",
        operations: {
          stats: { kind: "read", method: "GET", path: "/stats" },
          archive: { kind: "write", method: "POST", path: "/:id/archive" },
          findByTeam: {
            kind: "read",
            run: async (ctx, filter: { query: string; meta: string }) =>
              ctx.request<User[]>({ query: { team: filter.query, tag: filter.meta } }),
          },
        },
      },
      members: { path: "/orgs/:orgId/teams/:teamId/members" },
    },
  });
  return { api, requests };
}

describe("Q1 — tracked-property re-render parity", () => {
  it("re-renders exactly like native useQuery when only data is read", async () => {
    const getAll = vi.fn(async () => [ada]);
    const counts = { apixa: 0, native: 0 };
    const client = newClient();
    const apixa = renderHook(
      () => {
        counts.apixa++;
        return useResourceQuery({ getAll }, { queryKey: ["a"] }).data;
      },
      { wrapper: wrap(client) },
    );
    const native = renderHook(
      () => {
        counts.native++;
        return useQuery({ queryKey: ["n"], queryFn: getAll }).data;
      },
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(apixa.result.current).toEqual([ada]));
    await waitFor(() => expect(native.result.current).toEqual([ada]));
    await act(() => client.refetchQueries());
    await act(() => client.refetchQueries());
    expect(counts.apixa).toBe(counts.native);
  });

  it("still exposes every native field and the native result as query", async () => {
    const { result } = renderHook(
      () => useResourceQuery({ getAll: async () => [ada] }, { queryKey: ["u"] }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of Object.keys(result.current.query)) {
      expect(result.current).toHaveProperty(key);
    }
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.query.data).toEqual([ada]);
  });
});

describe("Q2 — signal binding by Core argument position", () => {
  it("forwards the signal for nested-resource operations without touching params", async () => {
    const { api, requests } = recordingApi(() => ada);
    const client = newClient();
    const { result } = renderHook(
      () =>
        useResourceQuery(api.members, {
          queryKey: ["members"],
          operation: "getById",
          args: ["7", { params: { orgId: "o1", teamId: "t1" } }],
        }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests[0]!.url).toBe("https://api.example.com/orgs/o1/teams/t1/members/7");
    expect(client.getQueryCache().getAll()[0]!.queryKey).toEqual([
      "members",
      "detail",
      "7",
      { params: { orgId: "o1", teamId: "t1" } },
    ]);
  });

  it("aborts a nested-resource request on cancellation", async () => {
    let started!: () => void;
    const begun = new Promise<void>((r) => (started = r));
    const api2 = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(async (request) => {
        started();
        await new Promise((_, reject) =>
          request.signal!.addEventListener("abort", () => reject(new Error("aborted"))),
        );
        return { body: [] };
      }),
      resources: { members: { path: "/orgs/:orgId/members" } },
    });
    const client = newClient();
    renderHook(
      () =>
        useResourceQuery(api2.members, {
          queryKey: ["m"],
          operation: "getAll",
          args: [{ params: { orgId: "o1" } }],
        }),
      { wrapper: wrap(client) },
    );
    await begun;
    await act(() => client.cancelQueries({ queryKey: ["m"] }));
    expect(client.getQueryCache().getAll()[0]!.state.fetchStatus).toBe("idle");
  });

  it("never injects a signal into function operations (custom or overriding a builtin)", async () => {
    const getAll = vi.fn(async (_ctx: unknown, filter: { query: string }) => [
      { ...ada, name: filter.query },
    ]);
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: { users: { path: "/users", operations: { getAll } } },
    });
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["u"], args: [{ query: "x" }] }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAll.mock.calls[0]!.slice(1)).toEqual([{ query: "x" }]);
  });

  it("leaves a custom parameter object with query/meta keys intact", async () => {
    const { api, requests } = recordingApi();
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      await act(() =>
        (result.current.controller.fetch as (c: QueryClient, o: unknown) => Promise<unknown>)(
          client,
          result.current.controller.operationOptions({
            operation: "findByTeam",
            args: [{ query: "red", meta: "m" }],
            keyParts: ["red"],
          } as never),
        ),
      ),
    ).toEqual([ada]);
    await waitFor(() =>
      expect(requests.map((r) => r.url)).toContain("https://api.example.com/users?team=red&tag=m"),
    );
  });
});

describe("Q3 — detail identity and invalidation", () => {
  it("shares one entry between imperative and equivalent reactive detail reads", async () => {
    const { api, requests } = recordingApi(() => ada);
    const client = newClient();
    const { result } = renderHook(
      () =>
        useResourceQuery(api.users, {
          queryKey: ["users"],
          operation: "getById",
          args: ["1", {}],
          staleTime: Infinity,
        }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["users", "detail", "1"])).toEqual(ada);
    expect(client.getQueryCache().findAll({ queryKey: ["users", "detail"] })).toHaveLength(1);
    expect(requests).toHaveLength(1);
  });

  it("invalidateDetail covers keyed variants but not other ids", async () => {
    const { api } = recordingApi(() => ada);
    const client = newClient();
    client.setQueryData(["users", "detail", "1"], ada);
    client.setQueryData(["users", "detail", "1", { query: { expand: "team" } }], ada);
    client.setQueryData(["users", "detail", "10"], ada);
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await act(() => result.current.invalidateDetail("1"));
    const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(["users", "detail", "1"])).toBe(true);
    expect(stale(["users", "detail", "1", { query: { expand: "team" } }])).toBe(true);
    expect(stale(["users", "detail", "10"])).toBe(false);
  });
});

describe("Q4 — inherited reads", () => {
  it("exposes every enabled read as a cached imperative call without fetching them up front", async () => {
    const { api, requests } = recordingApi((r) =>
      r.url.endsWith("/count") ? 3 : r.url.endsWith("/stats") ? { total: 3 } : [ada],
    );
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(Object.keys(result.current.operations).sort()).toEqual(
      [
        "count",
        "exists",
        "findFirst",
        "getAll",
        "getBy",
        "getById",
        "getMany",
        "findByTeam",
        "stats",
      ].sort(),
    );
    expect(result.current).not.toHaveProperty("archive");
    expect(result.current).toHaveProperty("findByTeam");
    expect(await act(() => result.current.count())).toBe(3);
    expect(await act(() => result.current.operations.stats())).toEqual({ total: 3 });
    await waitFor(() => expect(client.getQueryData(["users", "operation", "count"])).toBe(3));
    expect(client.getQueryData(["users", "operation", "stats"])).toEqual({ total: 3 });
    expectTypeOf(result.current.count).returns.resolves.toEqualTypeOf<number>();
    expectTypeOf(result.current.stats).returns.resolves.toBeUnknown();
    expectTypeOf(result.current).not.toHaveProperty("archive");
  });

  it("observes a Core-classified custom read without readOperations or keyParts", async () => {
    const { api } = recordingApi(() => ({ total: 9 }));
    const { result } = renderHook(
      () => useResourceQuery(api.users, { queryKey: ["users"], operation: "stats" }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.data).toEqual({ total: 9 }));
  });

  it("refuses to observe a custom write", () => {
    const { api } = recordingApi();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      renderHook(
        () =>
          useResourceQuery(api.users, {
            queryKey: ["users"],
            operation: "archive" as never,
            args: ["1"],
          } as never),
        { wrapper: wrap(newClient()) },
      ),
    ).toThrow(/archive is not a read/);
    spy.mockRestore();
  });

  it("works on a resource without getAll: no automatic query, reads on demand", async () => {
    const requests: string[] = [];
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((r) => (requests.push(r.url), { body: ada })),
      resources: { users: { path: "/users", operations: { getAll: false } } },
    });
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(requests).toEqual([]);
    expect(result.current).not.toHaveProperty("data");
    expectTypeOf(result.current).not.toHaveProperty("data");
    expect(await act(() => result.current.getById("1"))).toEqual(ada);
    expect(requests).toEqual(["https://api.example.com/users/1"]);
  });
});
