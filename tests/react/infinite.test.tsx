/** @vitest-environment jsdom */
import { defineApi, type TransportRequest } from "@apixa/core";
import { dehydrate, hydrate, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createResourceInfiniteQueryOptions,
  prefetchResourceInfiniteQuery,
} from "../../packages/react/src/query-options.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { deferred, newClient, wrap } from "../helpers/query.js";
import { readsDuringRender } from "../helpers/render.js";

type Post = { id: string };
type CursorPage = { data: Post[]; nextCursor: string | null };
type NumberPage = { data: Post[]; total: number; page: number; pageSize: number };

const ALL = Array.from({ length: 7 }, (_, i) => ({ id: String(i + 1) }));

function cursorApi(options: { gate?: () => Promise<void> } = {}) {
  const requests: TransportRequest[] = [];
  const api = defineApi<{
    posts: { entity: Post };
    pages: { entity: Post };
  }>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport(async (request) => {
      requests.push(request);
      await options.gate?.();
      const url = new URL(request.url);
      if (url.pathname === "/pages") {
        const page = Number(url.searchParams.get("page"));
        return { body: { items: ALL.slice((page - 1) * 3, page * 3), page, totalPages: 3 } };
      }
      const start = Number(url.searchParams.get("cursor") ?? 0);
      const limit = Number(url.searchParams.get("limit"));
      const end = start + limit;
      return {
        body: { items: ALL.slice(start, end), nextCursor: end < ALL.length ? String(end) : null },
      };
    }),
    resources: {
      posts: {
        path: "/posts",
        pagination: {
          type: "cursor",
          fields: { data: "items", nextCursor: "nextCursor" },
          params: { pageSize: "limit" },
        },
      },
      pages: {
        path: "/pages",
        pagination: {
          type: "page",
          parseList: (body: { items: Post[]; page: number; totalPages: number }) => ({
            data: body.items,
            page: body.page,
            pageSize: 3,
            total: body.totalPages * 3,
          }),
        },
      },
    },
  });
  const urls = () => requests.map((r) => new URL(r.url).pathname + new URL(r.url).search);
  return { api, requests, urls };
}

const cursorPaging = {
  initialPageParam: null as string | null,
  getNextPageParam: (last: CursorPage) => last.nextCursor,
  query: (cursor: string | null) => ({ ...(cursor !== null ? { cursor } : {}), pageSize: 3 }),
};

describe("infinite mode of useResourceQuery", () => {
  it("cursor pagination: fetches forward and terminates on the last page", async () => {
    const { api, urls } = cursorApi();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
          "data",
          "hasNextPage",
          "isFetchingNextPage",
          "status",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(result.current.data!.pages.flatMap((p) => p.data)).toEqual(ALL);
    expect(result.current.data!.pageParams).toEqual([null, "3", "6"]);
    expect(urls()).toEqual([
      "/posts?limit=3", // Core omits a null query value
      "/posts?cursor=3&limit=3",
      "/posts?cursor=6&limit=3",
    ]);
    expectTypeOf(result.current.data).toEqualTypeOf<
      InfiniteData<CursorPage, string | null> | undefined
    >();
  });

  it("page numbers: forward and backward navigation from a middle page, typed page params", async () => {
    const { api } = cursorApi();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.pages, {
            queryKey: ["pages"],
            infinite: {
              initialPageParam: 2,
              getNextPageParam: (last) =>
                last.page * last.pageSize < last.total ? last.page + 1 : undefined,
              getPreviousPageParam: (first) => (first.page > 1 ? first.page - 1 : undefined),
              query: (page) => ({ page }),
            },
          }),
          "data",
          "hasNextPage",
          "hasPreviousPage",
          "status",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.hasPreviousPage).toBe(true);
    await act(() => result.current.fetchPreviousPage());
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data!.pageParams).toEqual([1, 2, 3]));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.hasPreviousPage).toBe(false);
    expectTypeOf(result.current.data!.pageParams).toEqualTypeOf<number[]>();
  });

  it("maxPages evicts the oldest page", async () => {
    const { api } = cursorApi();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, {
            queryKey: ["posts"],
            infinite: { ...cursorPaging, maxPages: 2 },
          }),
          "data",
          "status",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    await act(() => result.current.fetchNextPage());
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data!.pageParams).toEqual(["3", "6"]));
    expect(result.current.data!.pages).toHaveLength(2);
  });

  it("rapid fetchNextPage calls never duplicate a page", async () => {
    let release = deferred<void>();
    let gated = false;
    const { api } = cursorApi({ gate: () => (gated ? release.promise : Promise.resolve()) });
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
          "data",
          "status",
          "isFetchingNextPage",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    gated = true;
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.fetchNextPage();
      second = result.current.fetchNextPage({ cancelRefetch: false });
    });
    release.resolve();
    await act(() => Promise.all([first, second]));
    gated = false;
    release = deferred();
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    expect(result.current.data!.pageParams).toEqual([null, "3"]);
  });

  it("uses its own cache namespace, never shared with a regular list", async () => {
    const { api } = cursorApi();
    const client = newClient();
    const both = renderHook(
      () => ({
        list: readsDuringRender(useResourceQuery(api.posts, { queryKey: ["posts"] }), "data"),
        infinite: readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
          "data",
        ),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(both.result.current.infinite.data).toBeDefined());
    await waitFor(() => expect(both.result.current.list.data).toBeDefined());
    expect(client.getQueryData(["posts", "list"])).toHaveProperty("data");
    expect(client.getQueryData(["posts", "infinite", "getAll"])).toHaveProperty("pages");
    expect(both.result.current.infinite.keys.infinite()).toEqual(["posts", "infinite", "getAll"]);
  });

  it("keyParts separates filtered lists; the page cursor is never in the key", async () => {
    const { api } = cursorApi();
    const client = newClient();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, {
            queryKey: ["posts"],
            keyParts: [{ tag: "a" }],
            infinite: cursorPaging,
          }),
          "status",
        ),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    await act(() => result.current.fetchNextPage());
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([["posts", "infinite", "getAll", { tag: "a" }]]);
  });

  it("invalidation (resource-wide, lists, and default mutation policy) refetches infinite lists", async () => {
    const { api, requests } = cursorApi();
    const client = newClient();
    const { result } = renderHook(
      () => ({
        posts: readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
          "status",
        ),
        writes: useResourceMutation(api.posts, {
          queryKey: ["posts"],
          mutations: { create: { invalidate: "lists" } },
        }),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.posts.status).toBe("success"));
    await act(() => result.current.posts.invalidateLists());
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(() => result.current.writes.create({}));
    await waitFor(() => expect(requests.filter((r) => r.method === "GET")).toHaveLength(3));
    await act(() => result.current.posts.invalidate());
    await waitFor(() => expect(requests.filter((r) => r.method === "GET")).toHaveLength(4));
  });

  it("cache helpers keep pages and pageParams aligned", async () => {
    const { api } = cursorApi();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
          "data",
          "status",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    act(() => {
      result.current.cache.set((old) => ({
        pages: old!.pages.map((p) => ({ ...p, data: p.data.slice(1) })),
        pageParams: old!.pageParams,
      }));
    });
    await waitFor(() => expect(result.current.data!.pages[0]!.data[0]).toEqual({ id: "2" }));
    expect(() =>
      result.current.cache.set((old) => ({ pages: old!.pages, pageParams: [] })),
    ).toThrow(/equal length/);
    expect(result.current.cache.get({ infinite: true })).toBe(result.current.cache.get());
  });

  it("prefetch, server prefetch, and hydration reuse the same key without refetching", async () => {
    const { api, requests } = cursorApi();
    const server = newClient();
    await prefetchResourceInfiniteQuery(server, api.posts, {
      queryKey: ["posts"],
      infinite: cursorPaging,
    });
    expect(requests).toHaveLength(1);

    const browser = newClient();
    hydrate(browser, dehydrate(server));
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(api.posts, {
            queryKey: ["posts"],
            staleTime: 60_000,
            infinite: cursorPaging,
          }),
          "data",
        ),
      { wrapper: wrap(browser) },
    );
    expect(result.current.data!.pages[0]!.data).toEqual(ALL.slice(0, 3));
    expect(requests).toHaveLength(1);

    // Hook-level prefetch of another infinite list, and of the observed one (fresh: no request).
    await act(() => result.current.prefetch());
    expect(requests).toHaveLength(1);
    await act(() =>
      result.current.prefetch({ keyParts: ["other"], infinite: { ...cursorPaging }, pages: 2 }),
    );
    expect(requests).toHaveLength(3);
    expect(
      (browser.getQueryData(["posts", "infinite", "getAll", "other"]) as InfiniteData<CursorPage>)
        .pages,
    ).toHaveLength(2);

    const options = createResourceInfiniteQueryOptions(api.posts, {
      queryKey: ["posts"],
      infinite: cursorPaging,
    });
    expect(options.queryKey).toEqual(["posts", "infinite", "getAll"]);
  });

  it("forwards TanStack's AbortSignal into Core and cancels on unmount", async () => {
    const release = deferred<void>();
    const { api, requests } = cursorApi({ gate: () => release.promise });
    const { unmount } = renderHook(
      () => useResourceQuery(api.posts, { queryKey: ["posts"], infinite: cursorPaging }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    unmount();
    await waitFor(() => expect(requests[0]!.signal?.aborted).toBe(true));
    release.resolve();
  });

  it("locks the mode for the component's lifetime (hook order safety)", async () => {
    const { api } = cursorApi();
    const { rerender } = renderHook(
      ({ infinite }: { infinite: boolean }) =>
        useResourceQuery(
          api.posts,
          (infinite
            ? { queryKey: ["posts"], infinite: cursorPaging }
            : { queryKey: ["posts"] }) as never,
        ),
      { wrapper: wrap(newClient()), initialProps: { infinite: true } },
    );
    expect(() => rerender({ infinite: false })).toThrow(/switching between infinite and regular/);
  });

  it("validates the paging config", () => {
    const { api } = cursorApi();
    const run = (infinite: unknown, extra: object = {}) =>
      renderHook(
        () => useResourceQuery(api.posts, { queryKey: ["posts"], infinite, ...extra } as never),
        { wrapper: wrap(newClient()) },
      );
    expect(() => run({ getNextPageParam: () => null })).toThrow(/initialPageParam is required/);
    expect(() => run({ initialPageParam: 0 })).toThrow(/getNextPageParam must be a function/);
    expect(() => run(cursorPaging, { query: {} })).toThrow(/inside infinite/);
    expect(() => run({ ...cursorPaging, args: () => [] })).toThrow(
      /either infinite.query or infinite.args/,
    );
  });

  it("works through useResource with mutations next to it", async () => {
    const { api } = cursorApi();
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResource(api.posts, { queryKey: ["posts"], query: { infinite: cursorPaging } }),
          "data",
          "status",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(typeof result.current.fetchNextPage).toBe("function");
    expect(typeof result.current.create).toBe("function");
    expectTypeOf(result.current.data).toEqualTypeOf<
      InfiniteData<CursorPage, string | null> | undefined
    >();
  });

  it("types: callbacks are checked against the page type", () => {
    const { api } = cursorApi();
    void (() =>
      useResourceQuery(api.posts, {
        queryKey: ["posts"],
        infinite: {
          initialPageParam: 0,
          // @ts-expect-error a page has no `cursor` field
          getNextPageParam: (last) => last.cursor,
        },
      }));
    void (() =>
      useResourceQuery(api.posts, {
        queryKey: ["posts"],
        // @ts-expect-error pageSize must be a number (no overload accepts this config)
        infinite: {
          ...cursorPaging,
          query: (cursor) => ({ ...(cursor !== null ? { cursor } : {}), pageSize: "10" }),
        },
      }));
  });
});
