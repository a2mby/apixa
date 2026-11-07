/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { ApixaHydrationBoundary, ApixaProvider, QueryClient, useResourceQuery } from "@apixa/react";
import {
  OptimisticLayers,
  createResourceQueryController,
  dehydrate,
  prefetchResourceQuery,
  QueryClient as ServerQueryClient,
} from "@apixa/react/advanced";
import {
  QueryClient as TanStackQueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string };
const ada: User = { id: "1", name: "Ada" };

function usersApi() {
  const requests: TransportRequest[] = [];
  const api = defineApi<{ users: { entity: User } }>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport((request) => {
      requests.push(request);
      return { body: [ada] };
    }),
    resources: { users: { path: "/users" } },
  });
  return { api, requests };
}

describe("QueryClient", () => {
  it("is TanStack's QueryClient, so there is one cache engine", () => {
    const client = new QueryClient();
    expect(client).toBeInstanceOf(TanStackQueryClient);
    expect(ServerQueryClient).toBe(QueryClient);
  });

  it("maps the five shorthand fields to query defaults and leaves mutations alone", () => {
    const meta = { source: "test" };
    const client = new QueryClient({
      staleTime: 5_000,
      gcTime: 9_000,
      retry: 2,
      networkMode: "always",
      meta,
    });
    expect(client.getDefaultOptions().queries).toEqual({
      staleTime: 5_000,
      gcTime: 9_000,
      retry: 2,
      networkMode: "always",
      meta,
    });
    expect(client.getDefaultOptions().mutations).toBeUndefined();
  });

  it("lets an explicit defaultOptions.queries entry win and keeps other native options", () => {
    const client = new QueryClient({
      staleTime: 1_000,
      retry: false,
      defaultOptions: { queries: { staleTime: 7_000 }, mutations: { retry: 1 } },
    });
    expect(client.getDefaultOptions().queries).toEqual({ staleTime: 7_000, retry: false });
    expect(client.getDefaultOptions().mutations).toEqual({ retry: 1 });
  });

  it("does not invent defaults when nothing is configured, and ignores undefined shorthands", () => {
    expect(new QueryClient().getDefaultOptions()).toEqual({});
    expect(new QueryClient({ staleTime: undefined }).getDefaultOptions()).toEqual({});
    const native = new QueryClient({ defaultOptions: { queries: { gcTime: 3 } } });
    expect(native.getDefaultOptions().queries).toEqual({ gcTime: 3 });
  });

  it("keeps separate caches per instance (request-scoped clients never share data)", () => {
    const a = new QueryClient();
    const b = new QueryClient();
    a.setQueryData(["users", "list"], [ada]);
    expect(b.getQueryData(["users", "list"])).toBeUndefined();
  });
});

describe("ApixaProvider", () => {
  it("creates one stable client from config and does not recreate it on re-render", () => {
    const seen: TanStackQueryClient[] = [];
    const { rerender } = renderHook(() => seen.push(useQueryClient()), {
      wrapper: ({ children }) => (
        <ApixaProvider config={{ staleTime: 42 }}>{children}</ApixaProvider>
      ),
    });
    rerender();
    rerender();
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBeInstanceOf(QueryClient);
    expect(seen[0]?.getDefaultOptions().queries?.staleTime).toBe(42);
  });

  it("uses an explicitly supplied client over config", () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useQueryClient(), {
      wrapper: ({ children }) => (
        <ApixaProvider client={client} config={{ staleTime: 1 }}>
          {children}
        </ApixaProvider>
      ),
    });
    expect(result.current).toBe(client);
    expect(client.getDefaultOptions().queries).toBeUndefined();
  });

  it("gives separate provider trees separate caches", () => {
    const first = renderHook(() => useQueryClient(), { wrapper: ApixaProvider });
    const second = renderHook(() => useQueryClient(), { wrapper: ApixaProvider });
    expect(first.result.current).not.toBe(second.result.current);
  });

  it("serves the existing hooks, controllers and optimistic layers from one cache", async () => {
    const { api, requests } = usersApi();
    const client = new QueryClient({ retry: false });
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: ({ children }) => <ApixaProvider client={client}>{children}</ApixaProvider>,
    });
    await waitFor(() => expect(result.current.data).toEqual([ada]));
    expect(requests).toHaveLength(1);
    const controller = createResourceQueryController(api.users, { queryKey: ["users"] });
    expect(controller.getCached(client, controller.keys.list())).toEqual([ada]);
    expect(OptimisticLayers.for(client)).toBe(OptimisticLayers.for(client));
  });

  it("is optional: the hooks also work under TanStack's own provider", async () => {
    const { api } = usersApi();
    const client = new TanStackQueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.data).toEqual([ada]));
  });
});

describe("server prefetch and hydration", () => {
  function Users({ api }: { api: ReturnType<typeof usersApi>["api"] }) {
    const query = useResourceQuery(api.users, { queryKey: ["users"] });
    return <p>{query.data?.map((u) => u.name).join(",") ?? "loading"}</p>;
  }

  it("hydrates prefetched data on first render without a second request", async () => {
    const { api, requests } = usersApi();
    // Server: a request-scoped client, prefetch, dehydrate.
    const server = new ServerQueryClient();
    await prefetchResourceQuery(server, api.users, { queryKey: ["users"] });
    const state = dehydrate(server);
    expect(requests).toHaveLength(1);

    // Client: a fresh cache, hydrated through the boundary.
    render(
      <ApixaProvider config={{ staleTime: 60_000, retry: false }}>
        <ApixaHydrationBoundary state={state}>
          <Users api={api} />
        </ApixaHydrationBoundary>
      </ApixaProvider>,
    );
    expect(screen.getByText("Ada")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toHaveLength(1);
  });

  it("keeps request-scoped server caches isolated", async () => {
    const { api } = usersApi();
    const one = new ServerQueryClient();
    const two = new ServerQueryClient();
    await prefetchResourceQuery(one, api.users, { queryKey: ["users"] });
    expect(dehydrate(one).queries).toHaveLength(1);
    expect(dehydrate(two).queries).toHaveLength(0);
  });
});
