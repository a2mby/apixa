/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, createElement, type ReactNode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { OptimisticLayers } from "../../packages/react/src/optimistic.js";
import { createResourceQueryOptions } from "../../packages/react/src/query-options.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { deferred, newClient, observersOf, wrap } from "../helpers/query.js";
import { readsDuringRender } from "../helpers/render.js";

type User = { id: string; name: string; role: string };
const layers = (client: QueryClient) => OptimisticLayers.for(client).size;

describe("reserved names: framework properties win, operations.* keeps every read", () => {
  const RESERVED = ["prefetch", "cache", "cancel", "fetchNextPage", "refetch", "data"] as const;
  function reservedApi() {
    const calls: string[] = [];
    const read = (name: string) => ({
      kind: "read" as const,
      run: async () => {
        calls.push(name);
        return name;
      },
    });
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport(() => ({ body: [] })),
      resources: {
        users: {
          path: "/users",
          operations: {
            prefetch: read("prefetch"),
            cache: read("cache"),
            cancel: read("cancel"),
            fetchNextPage: read("fetchNextPage"),
            refetch: read("refetch"),
            data: read("data"),
            stats: read("stats"),
          },
        },
      },
    });
    return { api, calls };
  }

  it("useResourceQuery: flat names are the framework's; operations.* runs the read", async () => {
    const { api, calls } = reservedApi();
    const client = newClient();
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(typeof result.current.cache.get).toBe("function"); // the helper, not the read
    expect(result.current.data).toEqual([]); // native data, not the read
    for (const name of RESERVED) {
      await act(async () => {
        expect(await result.current.operations[name]()).toBe(name);
      });
    }
    expect(calls).toEqual([...RESERVED]);
    await act(async () => {
      expect(await result.current.stats()).toBe("stats"); // unreserved reads stay flat
    });
    expectTypeOf(result.current.operations.cache).returns.resolves.toEqualTypeOf<string>();
    expectTypeOf(result.current.cache.remove).toBeFunction();
  });

  it("useResource composes without adding collisions", async () => {
    const { api } = reservedApi();
    const { result } = renderHook(() => useResource(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(typeof result.current.prefetch).toBe("function");
    expectTypeOf(result.current.prefetch).not.toEqualTypeOf<() => Promise<string>>();
    expectTypeOf(result.current.operations.prefetch).returns.resolves.toEqualTypeOf<string>();
    await act(async () => {
      expect(await result.current.operations.prefetch()).toBe("prefetch");
      expect(await result.current.operations.cancel()).toBe("cancel");
    });
    expect(typeof result.current.create).toBe("function");
    expect(typeof result.current.states.create.mutate).toBe("function");
  });
});

describe('"lists" invalidation scope', () => {
  function counting() {
    const hits = new Map<string, number>();
    const api = defineApi({
      baseURL: "https://x.dev",
      transport: createFakeTransport((request: TransportRequest) => {
        const key = new URL(request.url).pathname + new URL(request.url).search;
        hits.set(key, (hits.get(key) ?? 0) + 1);
        if (new URL(request.url).pathname.endsWith("/1")) return { body: { id: "1" } };
        if (new URL(request.url).pathname.endsWith("/stats")) return { body: { n: 1 } };
        return { body: { items: [], next: null } };
      }),
      resources: {
        users: {
          path: "/users",
          operations: { stats: { kind: "read", method: "GET", path: "/stats" } },
        },
        teams: { path: "/teams" },
      },
    });
    return { api, hits };
  }

  it("covers regular and infinite lists only, in one resource scope", async () => {
    const { api, hits } = counting();
    const client = newClient();
    const mount = (hook: () => unknown) => renderHook(hook, { wrapper: wrap(client) });
    const list = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    mount(() =>
      useResourceQuery(api.users, {
        queryKey: ["users"],
        infinite: { initialPageParam: 0, getNextPageParam: () => null, query: () => ({}) },
      }),
    );
    mount(() =>
      useResourceQuery(api.users, { queryKey: ["users"], operation: "getById", args: ["1"] }),
    );
    mount(() => useResourceQuery(api.users, { queryKey: ["users"], operation: "stats" }));
    mount(() => useResourceQuery(api.teams, { queryKey: ["teams"] }));
    await waitFor(() => expect([...hits.values()].reduce((a, b) => a + b, 0)).toBe(5));
    const before = new Map(hits);
    await act(() => list.result.current.invalidateLists());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const delta = (path: string) => (hits.get(path) ?? 0) - (before.get(path) ?? 0);
    expect(delta("/users")).toBe(2); // regular list + infinite first page
    expect(delta("/users/1")).toBe(0);
    expect(delta("/users/stats")).toBe(0);
    expect(delta("/teams")).toBe(0);
  });
});

/** Writes that wait for the test; reads answer from the current server state. */
function server() {
  const db = new Map<string, User>([["1", { id: "1", name: "Ada", role: "dev" }]]);
  const gates: Array<{ ok: () => Promise<void>; fail: () => Promise<void> }> = [];
  let failNext = 0;
  const resource = {
    getAll: vi.fn(async () => [...db.values()]),
    getById: vi.fn(async (id: string) => ({ ...db.get(id)! })),
    update: vi.fn((id: string, body: Partial<User>) => {
      if (failNext > 0) {
        failNext--;
        return Promise.reject(new Error("transient"));
      }
      const gate = deferred<void>();
      const result = gate.promise.then(() => {
        db.set(id, { ...db.get(id)!, ...body });
        return { ...db.get(id)! };
      });
      result.catch(() => undefined);
      gates.push({
        ok: async () => {
          gate.resolve();
          await result.catch(() => undefined);
        },
        fail: async () => {
          gate.reject(new Error("rejected"));
          await result.catch(() => undefined);
        },
      });
      return result;
    }),
  };
  return { db, gates, resource, failTimes: (n: number) => (failNext = n) };
}

const merge = (current: User, [, changes]: [string, Partial<User>]) => ({ ...current, ...changes });

async function seeded() {
  const s = server();
  const client = newClient();
  await client.fetchQuery(
    createResourceQueryOptions(s.resource, {
      queryKey: ["users"],
      operation: "getById",
      args: ["1"],
    }),
  );
  await client.fetchQuery(createResourceQueryOptions(s.resource, { queryKey: ["users"] }));
  return { ...s, client };
}
const detail = (client: QueryClient) => client.getQueryData<User>(["users", "detail", "1"]);
const list = (client: QueryClient) => client.getQueryData<User[]>(["users", "list"]);

describe("optimistic concurrency beyond two calls", () => {
  it("three calls, mixed outcomes in every order: failures never erase successes", async () => {
    const orders = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ];
    for (const order of orders) {
      for (const failing of [0, 1, 2]) {
        const s = await seeded();
        const { result } = renderHook(
          () =>
            useResourceMutation(s.resource, {
              queryKey: ["users"],
              mutations: {
                update: { invalidate: false, optimistic: { detail: ([id]) => id, update: merge } },
              },
            }),
          { wrapper: wrap(s.client) },
        );
        const changes = [{ name: "N" }, { role: "R" }, { name: "M" }];
        await act(async () => {
          for (const c of changes) void result.current.update("1", c).catch(() => undefined);
          await Promise.resolve();
        });
        await waitFor(() => expect(s.gates).toHaveLength(3));
        for (const i of order)
          await act(() => (i === failing ? s.gates[i]!.fail() : s.gates[i]!.ok()));
        // Visible data = the successful changes applied in send order (the documented model).
        const expected = changes.reduce<User>((u, c, i) => (i === failing ? u : { ...u, ...c }), {
          id: "1",
          name: "Ada",
          role: "dev",
        });
        expect(detail(s.client), `order ${order} failing ${failing}`).toEqual(expected);
        expect(layers(s.client)).toBe(0);
      }
    }
  });

  it("one call with detail and list targets rolls both back together", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              optimistic: {
                detail: ([id]) => id,
                update: merge,
                list: (users, [id, changes]) =>
                  users.map((u) => (u.id === id ? { ...u, ...changes } : u)),
              },
            },
          },
        }),
      { wrapper: wrap(s.client) },
    );
    await act(async () => {
      void result.current.update("1", { name: "Both" }).catch(() => undefined);
      await Promise.resolve();
    });
    await waitFor(() => expect(detail(s.client)?.name).toBe("Both"));
    expect(list(s.client)?.[0]?.name).toBe("Both");
    expect(layers(s.client)).toBe(2);
    await act(() => s.gates[0]!.fail());
    expect(detail(s.client)?.name).toBe("Ada");
    expect(list(s.client)?.[0]?.name).toBe("Ada");
    expect(layers(s.client)).toBe(0);
  });

  it("a retried mutation applies its change once and settles once", async () => {
    const s = await seeded();
    s.failTimes(2);
    const updates = vi.fn(merge);
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              retry: 2,
              retryDelay: 0,
              optimistic: { detail: ([id]) => id, update: updates },
            },
          },
        }),
      { wrapper: wrap(s.client) },
    );
    let call!: Promise<unknown>;
    await act(async () => {
      call = result.current.update("1", { name: "Retry" });
      await Promise.resolve();
    });
    await waitFor(() => expect(s.gates).toHaveLength(1));
    expect(detail(s.client)?.name).toBe("Retry");
    expect(updates).toHaveBeenCalledTimes(1);
    await act(() => s.gates[0]!.ok());
    await call;
    expect(detail(s.client)?.name).toBe("Retry");
    expect(layers(s.client)).toBe(0);
  });

  it("a throwing consumer onMutate still releases the optimistic layer", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              onMutate: () => {
                throw new Error("onMutate failed");
              },
              optimistic: { detail: ([id]) => id, update: merge },
            },
          },
        }),
      { wrapper: wrap(s.client) },
    );
    await act(async () => {
      await expect(result.current.update("1", { name: "X" })).rejects.toThrow("onMutate failed");
    });
    expect(detail(s.client)?.name).toBe("Ada");
    expect(layers(s.client)).toBe(0);
  });

  it("a throwing optimistic updater rejects the call and leaves the cache untouched", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: {
            update: {
              invalidate: false,
              optimistic: {
                detail: ([id]) => id,
                update: () => {
                  throw new Error("bad updater");
                },
              },
            },
          },
        }),
      { wrapper: wrap(s.client) },
    );
    await act(async () => {
      await expect(result.current.update("1", { name: "X" })).rejects.toThrow("bad updater");
    });
    expect(detail(s.client)?.name).toBe("Ada");
    expect(s.resource.update).not.toHaveBeenCalled();
    expect(layers(s.client)).toBe(0);
  });

  it("stress: 200 concurrent calls with random outcomes release all bookkeeping", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: {
            update: { invalidate: false, optimistic: { detail: ([id]) => id, update: merge } },
          },
        }),
      { wrapper: wrap(s.client) },
    );
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    await act(async () => {
      for (let i = 0; i < 200; i++) {
        void result.current
          .update("1", i % 2 ? { name: `n${i}` } : { role: `r${i}` })
          .catch(() => undefined);
      }
      await Promise.resolve();
    });
    await waitFor(() => expect(s.gates).toHaveLength(200));
    const order = s.gates.map((g, i) => ({ g, i, k: random() })).sort((a, b) => a.k - b.k);
    const failed = new Set<number>();
    for (const { g, i } of order) {
      const fail = random() < 0.4;
      if (fail) failed.add(i);
      await act(() => (fail ? g.fail() : g.ok()));
    }
    // Without invalidation the cache shows the successes in send order; the server applied them
    // in completion order. They can differ on a contended field until the next fetch.
    const sendOrder = Array.from({ length: 200 }, (_, i) => i)
      .filter((i) => !failed.has(i))
      .reduce<User>((u, i) => ({ ...u, ...(i % 2 ? { name: `n${i}` } : { role: `r${i}` }) }), {
        id: "1",
        name: "Ada",
        role: "dev",
      });
    expect(detail(s.client)).toEqual(sendOrder);
    expect(layers(s.client)).toBe(0);
    await act(() => s.client.refetchQueries({ queryKey: ["users", "detail", "1"] }));
    expect(detail(s.client)).toEqual(s.db.get("1")); // one fetch converges to server truth
    expect(s.client.getQueryCache().hasListeners()).toBe(false); // layer subscription released
  });
});

describe("direct mutation state: latest call, not an aggregate", () => {
  it("isPending follows the latest call while an older one is still pending", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () => {
        const w = useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: { update: { invalidate: false } },
        });
        return { w, pending: w.update.isPending, variables: w.update.variables };
      },
      { wrapper: wrap(s.client) },
    );
    await act(async () => {
      void result.current.w.update("1", { name: "first" });
      void result.current.w.update("1", { name: "second" });
      await Promise.resolve();
    });
    await waitFor(() => expect(s.gates).toHaveLength(2));
    expect(result.current.variables).toEqual(["1", { name: "second" }]);
    await act(() => s.gates[1]!.ok()); // the latest finishes first
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(s.client.isMutating()).toBe(1); // the older call is still in flight
    await act(() => s.gates[0]!.ok());
    expect(s.client.isMutating()).toBe(0);
  });
});

describe("infinite mode: errors, retry, refetch, Strict Mode", () => {
  function pagedApi(fail: { times: number }) {
    let calls = 0;
    const api = defineApi<{
      posts: {
        entity: { id: string };
        list: { items: string[]; next: number | null };
        query: { cursor: number };
      };
    }>()({
      baseURL: "https://x.dev",
      transport: createFakeTransport((request) => {
        calls++;
        if (fail.times > 0) {
          fail.times--;
          return { status: 500, body: {} };
        }
        const cursor = Number(new URL(request.url).searchParams.get("cursor"));
        return { body: { items: [`p${cursor}`], next: cursor < 2 ? cursor + 1 : null } };
      }),
      resources: { posts: { path: "/posts", operations: "read" } },
    });
    return { api, calls: () => calls };
  }
  const paging = {
    initialPageParam: 0,
    getNextPageParam: (last: { next: number | null }) => last.next,
    query: (cursor: number) => ({ cursor }),
  };

  it("an error page is retried natively and pages stay aligned", async () => {
    const fail = { times: 0 };
    const { api } = pagedApi(fail);
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, {
            queryKey: ["posts"],
            infinite: paging,
            retry: 1,
            retryDelay: 0,
          }),
          "data",
          "isSuccess",
          "hasNextPage",
          "isFetchNextPageError",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    fail.times = 1; // next page fails once, then the native retry succeeds
    await act(() => result.current.fetchNextPage());
    await waitFor(() =>
      expect(result.current.data?.pages.map((p) => p.items[0])).toEqual(["p0", "p1"]),
    );
    expect(result.current.data?.pageParams).toEqual([0, 1]);
    fail.times = 5; // now it fails beyond the retry budget
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.data?.pages).toHaveLength(2); // nothing lost
  });

  it("refetch re-reads every loaded page in order", async () => {
    const { api, calls } = pagedApi({ times: 0 });
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: paging }),
          "data",
          "isSuccess",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    const before = calls();
    await act(() => result.current.refetch());
    expect(calls() - before).toBe(2);
    await waitFor(() =>
      expect(result.current.data?.pages.map((p) => p.items[0])).toEqual(["p0", "p1"]),
    );
  });

  it("the mode lock is stable under Strict Mode double rendering", async () => {
    const { api } = pagedApi({ times: 0 });
    const client = newClient();
    const strict = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, wrap(client)({ children }));
    const { result, rerender } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: paging }),
          "data",
          "isSuccess",
          "hasNextPage",
        ),
      { wrapper: strict },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender();
    await act(() => result.current.fetchNextPage());
    // TanStack notifies observers on its own tick (setTimeout 0), after act() returns.
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  });
});

describe("memory and cleanup", () => {
  it("1,000 prefetches of one key: one entry, no observers; repeated cancel leaves nothing fetching", async () => {
    const s = await seeded();
    const { result, unmount } = renderHook(
      () => useResourceQuery(s.resource, { queryKey: ["users"], staleTime: 60_000 }),
      { wrapper: wrap(s.client) },
    );
    await act(async () => {
      await Promise.all(
        Array.from({ length: 1000 }, () =>
          result.current.prefetch({ operation: "getById", args: ["1"] }),
        ),
      );
    });
    expect(s.client.getQueryCache().findAll({ queryKey: ["users", "detail"] })).toHaveLength(1);
    expect(observersOf(s.client, ["users", "detail", "1"])).toBe(0);
    for (let i = 0; i < 100; i++) await act(() => result.current.cancel());
    expect(s.client.isFetching()).toBe(0);
    unmount();
    expect(observersOf(s.client, ["users", "list"])).toBe(0);
  });

  it("many sequential mutations reuse one observer per operation", async () => {
    const s = await seeded();
    const { result } = renderHook(
      () =>
        useResourceMutation(s.resource, {
          queryKey: ["users"],
          mutations: { update: { invalidate: false } },
        }),
      { wrapper: wrap(s.client) },
    );
    for (let i = 0; i < 50; i++) {
      let call!: Promise<unknown>;
      await act(async () => {
        call = result.current.update("1", { name: `n${i}` });
        await Promise.resolve();
      });
      await act(() => s.gates[i]!.ok());
      await call;
    }
    expect(s.db.get("1")?.name).toBe("n49");
    expect(s.client.getMutationCache().getAll()).toHaveLength(50); // native: kept until gcTime
    expect(layers(s.client)).toBe(0);
  });
});
