/** @vitest-environment jsdom */
import { defineApi, isHttpError, isTimeoutError, OPERATION_METADATA } from "@apixa/core";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  focusManager,
  hydrate,
  onlineManager,
  useQueries,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { readsDuringRender } from "../helpers/render.js";
import { describe, expect, it, vi } from "vitest";
import { createResourceQueryController } from "../../packages/react/src/query-controller.js";
import {
  buildResourceQueryOptions,
  createResourceQueryOptions,
} from "../../packages/react/src/query-options.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; active: boolean };
const ada: User = { id: "42", name: "Ada", active: true };

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
}
function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Test double carrying the same metadata Core supplies for generated operations. */
function coreFixture<R extends object>(resource: R, positions: Record<string, number | null>): R {
  Object.defineProperty(resource, OPERATION_METADATA, {
    value: Object.fromEntries(
      Object.entries(positions).map(([name, optionsIndex]) => [
        name,
        { kind: "read", builtin: true, implementation: "request", optionsIndex },
      ]),
    ),
  });
  return resource;
}

describe("native query parity and read operations", () => {
  it("forwards all installed native option categories without dropping callbacks", () => {
    const native = {
      enabled: () => true,
      staleTime: () => "static" as const,
      gcTime: 100_000,
      networkMode: "always" as const,
      subscribed: false,
      retry: 2,
      retryDelay: () => 1,
      retryOnMount: false,
      refetchInterval: () => false as const,
      refetchIntervalInBackground: true,
      refetchOnMount: "always" as const,
      refetchOnWindowFocus: () => "always" as const,
      refetchOnReconnect: () => false,
      select: (data: User[]) => data.map((user) => user.name),
      initialData: [ada],
      initialDataUpdatedAt: () => 1,
      placeholderData: (previous: User[] | undefined) => previous,
      structuralSharing: false,
      throwOnError: () => false,
      notifyOnChangeProps: "all" as const,
      meta: { source: "parity" },
    };
    const options = createResourceQueryOptions(
      { getAll: async () => [ada] },
      {
        queryKey: ["users"],
        ...native,
      },
    );
    for (const [key, value] of Object.entries(native)) {
      expect(options).toHaveProperty(key, value);
    }
  });

  it("forwards native options, exposes native metadata, and keeps raw cache data after select", async () => {
    const resource = { getAll: vi.fn(async () => [ada]) };
    const queryClient = client();
    const select = vi.fn((users: User[]) => users.map((user) => user.name));
    const { result } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          staleTime: 30_000,
          gcTime: 90_000,
          networkMode: "always",
          retry: 2,
          retryDelay: () => 1,
          refetchOnReconnect: "always",
          refetchOnMount: false,
          refetchOnWindowFocus: false,
          refetchInterval: false,
          refetchIntervalInBackground: true,
          notifyOnChangeProps: "all",
          meta: { source: "test" },
          select,
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["Ada"]);
    expect(result.current.query.data).toEqual(["Ada"]);
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
    expect(result.current.isStale).toBe(false);
    expect(result.current.failureCount).toBe(0);
    expect(result.current.refetch).toBe(result.current.query.refetch);
    expect(queryClient.getQueryData(["users", "list"])).toEqual([ada]);
    const options = queryClient.getQueryCache().find({ queryKey: ["users", "list"] })?.options;
    expect(options).toMatchObject({
      staleTime: 30_000,
      gcTime: 90_000,
      networkMode: "always",
      meta: { source: "test" },
    });
  });

  it("runs a reactive detail and imperative detail through the same key and forwards signal", async () => {
    const getById = vi.fn(async (_id: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return ada;
    });
    const resource = coreFixture({ getById }, { getById: 1 });
    const queryClient = client();
    const { result } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          operation: "getById",
          args: ["42"],
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.data).toEqual(ada));
    expect(queryClient.getQueryData(["users", "detail", "42"])).toEqual(ada);
    const controller = createResourceQueryController(resource, { queryKey: ["users"] });
    expect(await controller.fetchDetail(queryClient, "42")).toEqual(ada);
    expect(getById).toHaveBeenCalledTimes(2); // fetchQuery is stale by default
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ["users", "detail", "42"] })
        ?.getObserversCount(),
    ).toBe(1);
  });

  it("supports count, a declared custom read, and separate operation keys", async () => {
    const resource = coreFixture(
      {
        count: vi.fn(async () => 7),
        stats: vi.fn(async (period: "day" | "week") => ({ period, total: 9 })),
      },
      { count: 0, stats: null },
    );
    const queryClient = client();
    const count = createResourceQueryOptions(resource, {
      queryKey: ["users"],
      operation: "count",
      args: [],
    });
    const stats = buildResourceQueryOptions(resource, {
      queryKey: ["users"],
      operation: "stats",
      args: ["day"],
      keyParts: ["day"],
    });
    expect(count.queryKey).toEqual(["users", "operation", "count"]);
    expect(stats.queryKey).toEqual(["users", "operation", "stats", "day"]);
    expect(await queryClient.fetchQuery(count)).toBe(7);
    expect(await queryClient.ensureQueryData(stats)).toEqual({ period: "day", total: 9 });
    expect(() =>
      createResourceQueryOptions(resource, {
        queryKey: ["users"],
        operation: "stats",
        args: ["day"],
        readOperations: ["stats"],
      } as never),
    ).toThrow(/readOperations was removed/);
  });

  it("executes every remaining builtin read directly with its Core argument tuple", async () => {
    const resource = {
      getMany: vi.fn(async (ids: string[], _options?: { signal?: AbortSignal }) =>
        ids.map((id) => ({ ...ada, id })),
      ),
      getBy: vi.fn(
        async (_field: string, _value: string, _options?: { signal?: AbortSignal }) => ada,
      ),
      findFirst: vi.fn(
        async (_options?: { query?: { active?: boolean }; signal?: AbortSignal }) => ada,
      ),
      exists: vi.fn(async (_id: string, _options?: { signal?: AbortSignal }) => true),
    };
    coreFixture(resource, {
      getMany: 1,
      getBy: 2,
      findFirst: 0,
      exists: 1,
    });
    const queryClient = client();
    const root = { queryKey: ["users"] };
    expect(
      await queryClient.fetchQuery(
        createResourceQueryOptions(resource, {
          ...root,
          operation: "getMany",
          args: [["42"]],
        }),
      ),
    ).toEqual([ada]);
    expect(
      await queryClient.fetchQuery(
        createResourceQueryOptions(resource, {
          ...root,
          operation: "getBy",
          args: ["name", "Ada"],
        }),
      ),
    ).toEqual(ada);
    expect(
      await queryClient.fetchQuery(
        createResourceQueryOptions(resource, {
          ...root,
          operation: "findFirst",
          args: [{ query: { active: true } }],
        }),
      ),
    ).toEqual(ada);
    expect(
      await queryClient.fetchQuery(
        createResourceQueryOptions(resource, {
          ...root,
          operation: "exists",
          args: ["42"],
        }),
      ),
    ).toBe(true);
    for (const method of Object.values(resource)) {
      expect(method).toHaveBeenCalledTimes(1);
      const lastArg = method.mock.calls[0]!.at(-1);
      expect(lastArg).toHaveProperty("signal");
    }
  });

  it("merges a signal into explicit empty Core request-options objects", async () => {
    const getAll = vi.fn(async (options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return [ada];
    });
    const options = createResourceQueryOptions(coreFixture({ getAll }, { getAll: 0 }), {
      queryKey: ["users"],
      args: [{}],
    });
    expect(await client().fetchQuery(options)).toEqual([ada]);
    expect(getAll).toHaveBeenCalledTimes(1);

    const getById = vi.fn(async (_id: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return ada;
    });
    const detail = createResourceQueryOptions(coreFixture({ getById }, { getById: 1 }), {
      queryKey: ["users"],
      operation: "getById",
      args: ["42", {}],
    });
    expect(await client().fetchQuery(detail)).toEqual(ada);
    expect(getById).toHaveBeenCalledTimes(1);

    const findFirst = vi.fn(
      async (filter: { query: string }, options?: { signal?: AbortSignal }) => {
        expect(filter).toEqual({ query: "Ada" });
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return ada;
      },
    );
    await client().fetchQuery(
      createResourceQueryOptions(coreFixture({ findFirst }, { findFirst: 1 }), {
        queryKey: ["users"],
        operation: "findFirst",
        args: [{ query: "Ada" }],
      }),
    );
  });

  it("binds a custom read signal only where the developer puts it", async () => {
    const custom = vi.fn(async (_id: string, options: { signal: AbortSignal }) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return ada;
    });
    const options = buildResourceQueryOptions(coreFixture({ custom }, { custom: null }), {
      queryKey: ["users"],
      operation: "custom",
      keyParts: ["42"],
      args: ({ signal }) => ["42", { signal }],
    });
    expect(await client().fetchQuery(options)).toEqual(ada);
    expect(custom).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid detail identifiers disabled", async () => {
    const getById = vi.fn(async (_id: string) => ada);
    const { result } = renderHook(
      () =>
        useResourceQuery(
          { getById },
          {
            queryKey: ["users"],
            operation: "getById",
            args: [undefined as unknown as string],
          },
        ),
      { wrapper: wrapper(client()) },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(getById).not.toHaveBeenCalled();
  });

  it("rejects Core full-response requests that would break raw-data inference", () => {
    expect(() =>
      createResourceQueryOptions(coreFixture({ getAll: async () => [ada] }, { getAll: 0 }), {
        queryKey: ["users"],
        args: [{ full: true }],
      } as never),
    ).toThrow(/raw payloads/);
  });

  it("preserves list pagination identity and native placeholder transitions", async () => {
    const getAll = vi.fn(async (options?: { query?: { page: number }; signal?: AbortSignal }) => ({
      data: [{ ...ada, id: String(options?.query?.page ?? 1) }],
      total: 2,
      page: options?.query?.page ?? 1,
      pageSize: 1,
    }));
    const queryClient = client();
    const { result, rerender } = renderHook(
      ({ page }) =>
        useResourceQuery(
          { getAll },
          {
            queryKey: ["users"],
            query: { page },
            placeholderData: (previous) => previous,
          },
        ),
      { wrapper: wrapper(queryClient), initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.data?.page).toBe(1));
    rerender({ page: 2 });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    expect(queryClient.getQueryData(["users", "list", { page: 1 }])).toMatchObject({ page: 1 });
    expect(queryClient.getQueryData(["users", "list", { page: 2 }])).toMatchObject({ page: 2 });
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it("cancels an in-flight Core request through the TanStack signal", async () => {
    let requestSignal: AbortSignal | undefined;
    const resource = {
      getById: vi.fn((_id: string, options?: { signal?: AbortSignal }) => {
        requestSignal = options?.signal;
        return new Promise<User>(() => {});
      }),
    };
    coreFixture(resource, { getById: 1 });
    const queryClient = client();
    const { result } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          operation: "getById",
          args: ["42"],
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(requestSignal).toBeDefined());
    await act(() => queryClient.cancelQueries({ queryKey: result.current.keys.detail("42") }));
    expect(requestSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
  });

  it("supports native useQuery, useSuspenseQuery, useQueries, and hydration with generated options", async () => {
    const resource = {
      getAll: vi.fn(async () => [ada]),
      getById: vi.fn(async (_id: string) => ada),
    };
    const list = createResourceQueryOptions(resource, { queryKey: ["users"] });
    const detail = createResourceQueryOptions(resource, {
      queryKey: ["users"],
      operation: "getById",
      args: ["42"],
    });
    const server = client();
    await server.prefetchQuery(list);
    const hydrated = client();
    hydrate(hydrated, dehydrate(server));
    expect(hydrated.getQueryData(list.queryKey)).toEqual([ada]);
    const normal = renderHook(() => useQuery(list), { wrapper: wrapper(hydrated) });
    await waitFor(() => expect(normal.result.current.data).toEqual([ada]));
    const suspense = renderHook(() => useSuspenseQuery(list), { wrapper: wrapper(hydrated) });
    expect(suspense.result.current.data).toEqual([ada]);
    const parallel = renderHook(() => useQueries({ queries: [list, detail] as const }), {
      wrapper: wrapper(hydrated),
    });
    await waitFor(() => expect(parallel.result.current[1].data).toEqual(ada));
    normal.unmount();
    suspense.unmount();
    parallel.unmount();
  });

  it("executes parameterized Core operations with exact args and scoped keys", async () => {
    const transport = createFakeTransport((request) => ({
      body: request.url.includes("/42") ? ada : [ada],
    }));
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://example.com",
      transport,
      resources: { users: { path: "/organizations/:orgId/users" } },
    });
    const queryClient = client();
    const list = createResourceQueryOptions(api.users, {
      queryKey: ["users"],
      scope: ["tenant", "acme"],
      args: [{ params: { orgId: "acme" } }],
    });
    expect(list.queryKey).toEqual(["tenant", "acme", "users", "list", [{ params: { orgId: "acme" } }]]);
    expect(await queryClient.fetchQuery(list)).toEqual([ada]);
    const detail = createResourceQueryOptions(api.users, {
      queryKey: ["users"],
      scope: ["tenant", "acme"],
      operation: "getById",
      args: ["42", { params: { orgId: "acme" } }],
    });
    expect(await queryClient.fetchQuery(detail)).toEqual(ada);
  });

  it("delegates distinct cache actions to QueryClient and keeps filter variants isolated", async () => {
    const resource = {
      getAll: vi.fn(async (options?: { query?: { active: boolean } }) =>
        options?.query?.active ? [ada] : [],
      ),
    };
    const queryClient = client();
    const controller = createResourceQueryController(resource, {
      queryKey: ["users"],
      scope: ["tenant", "acme"],
    });
    const active = createResourceQueryOptions(resource, {
      queryKey: ["users"],
      scope: ["tenant", "acme"],
      query: { active: true },
    });
    const inactive = createResourceQueryOptions(resource, {
      queryKey: ["users"],
      scope: ["tenant", "acme"],
      query: { active: false },
    });
    await controller.prefetch(queryClient, active);
    await controller.prefetch(queryClient, inactive);
    expect(controller.getCached(queryClient, active)).toEqual([ada]);
    expect(controller.getCached(queryClient, inactive)).toEqual([]);
    controller.setCached(queryClient, active, (old) => [...(old ?? []), { ...ada, id: "43" }]);
    expect(controller.getCached(queryClient, active)).toHaveLength(2);
    await controller.invalidateLists(queryClient);
    expect(queryClient.getQueryState(active.queryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(inactive.queryKey)?.isInvalidated).toBe(true);
    await controller.reset(queryClient);
    expect(controller.getCached(queryClient, active)).toBeUndefined();
    await controller.ensure(queryClient, active);
    controller.remove(queryClient);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("uses TanStack retry counts without adding another query retry layer", async () => {
    let calls = 0;
    const resource = {
      getAll: async () => {
        calls++;
        if (calls < 3) throw new Error("temporary");
        return [ada];
      },
    };
    const { result } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          retry: 2,
          retryDelay: () => 0,
        }),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(3);
    expect(result.current.failureCount).toBe(0);
  });

  it("keeps Core transport retries inside one TanStack query attempt", async () => {
    let attempts = 0;
    const transport = createFakeTransport(() => {
      attempts++;
      return attempts === 1 ? { status: 503, body: { error: "temporary" } } : { body: [ada] };
    });
    const api = defineApi<{ users: { entity: User } }>()({
      baseURL: "https://example.test",
      transport,
      retry: { retries: 1, baseDelayMs: 0, jitter: false },
      resources: { users: { path: "/users" } },
    });
    const { result } = renderHook(
      () =>
        useResourceQuery(api.users, {
          queryKey: ["users"],
          retry: false,
        }),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => expect(result.current.data).toEqual([ada]));
    expect(attempts).toBe(2);
  });

  it("preserves Core HTTP and timeout error classes", async () => {
    const failed = defineApi({
      baseURL: "https://example.test",
      transport: createFakeTransport(() => ({ status: 503, body: { error: "down" } })),
      resources: { users: { path: "/users" } },
    });
    const http = renderHook(
      () =>
        useResourceQuery(failed.users, {
          queryKey: ["http"],
          retry: false,
        }),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => expect(http.result.current.isError).toBe(true));
    expect(isHttpError(http.result.current.error)).toBe(true);
    http.unmount();

    const slow = defineApi({
      baseURL: "https://example.test",
      timeout: 10,
      transport: createFakeTransport(() => new Promise(() => {})),
      resources: { users: { path: "/users" } },
    });
    const timeout = renderHook(
      () =>
        useResourceQuery(slow.users, {
          queryKey: ["timeout"],
          retry: false,
        }),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => expect(timeout.result.current.isError).toBe(true));
    expect(isTimeoutError(timeout.result.current.error)).toBe(true);
    timeout.unmount();
  });

  it("uses native polling and focus refetch without extra Apixa observers", async () => {
    const resource = { getAll: vi.fn(async () => [ada]) };
    const queryClient = client();
    const { unmount } = renderHook(
      () =>
        useResourceQuery(resource, {
          queryKey: ["users"],
          refetchInterval: 25,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: true,
          staleTime: 0,
        }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(resource.getAll.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ["users", "list"] })
        ?.getObserversCount(),
    ).toBe(1);
    focusManager.setFocused(false);
    const beforeFocus = resource.getAll.mock.calls.length;
    focusManager.setFocused(true);
    await waitFor(() => expect(resource.getAll.mock.calls.length).toBeGreaterThan(beforeFocus));
    unmount();
    focusManager.setFocused(undefined);
  });

  it("pauses an online query while offline and resumes on reconnect", async () => {
    onlineManager.setOnline(false);
    try {
      const resource = { getAll: vi.fn(async () => [ada]) };
      const { result } = renderHook(
        () =>
          useResourceQuery(resource, {
            queryKey: ["users"],
            networkMode: "online",
            refetchOnReconnect: true,
          }),
        { wrapper: wrapper(client()) },
      );
      expect(result.current.isPaused).toBe(true);
      expect(resource.getAll).not.toHaveBeenCalled();
      onlineManager.setOnline(true);
      await waitFor(() => expect(result.current.data).toEqual([ada]));
      expect(resource.getAll).toHaveBeenCalledTimes(1);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("deduplicates two mounted readers and rebinds to a changed resource on refetch", async () => {
    let resolveFirst!: (value: User[]) => void;
    const pending = new Promise<User[]>((resolve) => {
      resolveFirst = resolve;
    });
    const first = { getAll: vi.fn(() => pending) };
    const second = { getAll: vi.fn(async () => [{ ...ada, name: "Grace" }]) };
    const queryClient = client();
    const firstHook = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(first, { queryKey: ["users"], staleTime: Infinity }),
          "data",
        ),
      {
        wrapper: wrapper(queryClient),
      },
    );
    const secondHook = renderHook(
      ({ resource }) =>
        readsDuringRender(
          useResourceQuery(resource, {
            queryKey: ["users"],
            staleTime: Infinity,
          }),
          "data",
        ),
      { wrapper: wrapper(queryClient), initialProps: { resource: first } },
    );
    expect(first.getAll).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst([ada]);
      await pending;
    });
    await waitFor(() => expect(firstHook.result.current.data).toEqual([ada]));
    secondHook.rerender({ resource: second });
    await act(() => secondHook.result.current.refetch());
    await waitFor(() => expect(secondHook.result.current.data?.[0]?.name).toBe("Grace"));
    expect(second.getAll).toHaveBeenCalledTimes(1);
    firstHook.unmount();
    secondHook.unmount();
  });
});
