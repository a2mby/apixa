/** @vitest-environment jsdom */
import { TimeoutError, defineApi } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { newClient, wrap } from "../helpers/query.js";
import { makeApi as makeFilesApi } from "../helpers/framework-files.js";
import { createResourceQueryOptions } from "../../packages/react/src/advanced.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { AbortError } from "@apixa/core";

type Doc = { id: string; name: string };

interface Track {
  requests: number;
  aborted: number;
  cancelled: number;
  signals: AbortSignal[];
}

/** Every response body is a stream that tracks cancel and the request signal's abort. */
function makeApi(extra: Record<string, unknown> = {}) {
  const track: Track = { requests: 0, aborted: 0, cancelled: 0, signals: [] };
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    track.requests++;
    const signal = init?.signal as AbortSignal;
    track.signals.push(signal);
    signal.addEventListener("abort", () => track.aborted++);
    let sent = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          if (!sent) {
            sent = true;
            c.enqueue(new Uint8Array([1, 2, 3]));
            return;
          }
          // Hold the stream open until the request is aborted (a long-lived download).
          return new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }).catch((e) => c.error(e));
        },
        cancel() {
          track.cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, { headers: { "content-type": "application/octet-stream" } });
  }) as typeof fetch;
  const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://x.dev/v1",
    transport: createFetchTransport(fetchImpl),
    resources: {
      docs: {
        path: "/docs",
        operations: {
          feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream", ...extra },
          blob: { kind: "read", method: "GET", path: "/blob", responseType: "blob" },
        },
      },
    },
  });
  return { api, track };
}

describe("F2/F5: streams held by a query", () => {
  it("F5: unmounting while the request is in flight aborts it (TanStack signal -> Core)", async () => {
    // Headers never arrive: only the signal can end this.
    const aborted: string[] = [];
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init!.signal!.addEventListener("abort", () => {
          aborted.push("abort");
          reject(init!.signal!.reason);
        });
      })) as typeof fetch;
    const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
      baseURL: "https://x.dev/v1",
      transport: createFetchTransport(fetchImpl),
      resources: {
        docs: {
          path: "/docs",
          operations: {
            blob: { kind: "read", method: "GET", path: "/blob", responseType: "blob" },
          },
        },
      },
    });
    const { unmount } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["b"], operation: "blob" }),
      {
        wrapper: wrap(newClient()),
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    unmount();
    await waitFor(() => expect(aborted).toEqual(["abort"]));
  });

  it("F5: StrictMode double mount does not leave two live requests for one entry", async () => {
    const { api, track } = makeApi();
    const client = newClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StrictMode>
    );
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["b"], operation: "blob" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isFetching || result.current.isSuccess).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(track.requests).toBeLessThanOrEqual(2);
    // Every request except the surviving one was aborted.
    expect(track.aborted).toBeGreaterThanOrEqual(track.requests - 1);
  });

  it("a stream result is cached as the app's to consume: the query resolves with a reader-able stream", async () => {
    const { api } = makeApi();
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["f"], operation: "feed" }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stream = result.current.data as ReadableStream<Uint8Array>;
    expect(stream).toBeInstanceOf(ReadableStream);
    const first = await stream.getReader().read();
    expect(first.value).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("F2 (characterized): a refetch replaces the cached stream without cancelling the old one", async () => {
    const { api, track } = makeApi();
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["f"], operation: "feed" }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.refetch();
    });
    expect(track.requests).toBe(2);
    // Core cannot know the cache dropped the first stream: it stays open until its owner ends it.
    expect(track.cancelled).toBe(0);
  });

  it("F2: the call timeout still ends a stream the cache has forgotten (no unbounded leak)", async () => {
    const { api } = makeApi({ timeout: 300 });
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["f"], operation: "feed" }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const reader = (result.current.data as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    const error = await reader.read().catch((e) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it("F2: the owner can always end a cached stream, and removal from the cache does not throw", async () => {
    const { api, track } = makeApi();
    const client = newClient();
    const { result, unmount } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["f"], operation: "feed" }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stream = result.current.data as ReadableStream<Uint8Array>;
    unmount();
    client.removeQueries();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    await stream.cancel("done");
    expect(track.cancelled).toBe(1);
  });
});

describe("F11 (defect, fixed): a caller's AbortSignal is honored by hook reads", () => {
  it("useResource flat read: the caller's signal cancels the download", async () => {
    const { api } = makeFilesApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    const controller = new AbortController();
    const pending = (
      result.current as never as { download(id: string, o: object): Promise<unknown> }
    )
      .download("1", { signal: controller.signal })
      .catch((e: unknown) => e);
    setTimeout(() => controller.abort(), 6);
    expect(await pending).toBeInstanceOf(AbortError);
  });

  it("the query function aborts when either the caller's or TanStack's signal aborts", async () => {
    const { api } = makeFilesApi();
    const caller = new AbortController();
    const options = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      operation: "download",
      args: ["1", { signal: caller.signal }],
    } as never);
    const run = (signal: AbortSignal) =>
      (options.queryFn as (c: unknown) => Promise<unknown>)({
        signal,
        queryKey: options.queryKey,
        meta: undefined,
      });
    const first = run(new AbortController().signal).catch((e) => e);
    setTimeout(() => caller.abort(), 6);
    expect(await first).toBeInstanceOf(AbortError);

    const tanstack = new AbortController();
    const fresh = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      operation: "download",
      args: ["1", { signal: new AbortController().signal }],
    } as never);
    const second = (fresh.queryFn as (c: unknown) => Promise<unknown>)({
      signal: tanstack.signal,
      queryKey: fresh.queryKey,
    }).catch((e) => e);
    setTimeout(() => tanstack.abort(), 6);
    expect(await second).toBeInstanceOf(AbortError);
  });

  it("without a caller signal the TanStack signal is still bound (unchanged)", async () => {
    const { api } = makeFilesApi();
    const options = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      operation: "download",
      args: ["1"],
    } as never);
    const tanstack = new AbortController();
    const pending = (options.queryFn as (c: unknown) => Promise<unknown>)({
      signal: tanstack.signal,
      queryKey: options.queryKey,
    }).catch((e) => e);
    setTimeout(() => tanstack.abort(), 6);
    expect(await pending).toBeInstanceOf(AbortError);
  });
});
