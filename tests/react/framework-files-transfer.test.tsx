/** @vitest-environment jsdom */
import {
  AbortError,
  TimeoutError,
  defineApi,
  type TransferEvent,
  type Transport,
} from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { makeApi } from "../helpers/framework-files.js";
import { newClient, wrap } from "../helpers/query.js";

const phases = (events: TransferEvent[]) => events.map((e) => `${e.direction}:${e.phase}`);
const stream = (chunks: number, size = 4) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < chunks; i++) c.enqueue(new Uint8Array(size));
      c.close();
    },
  });

describe("transfer events through the hooks", () => {
  it("useResourceQuery: a download reports counted progress with a trustworthy total", async () => {
    const { api } = makeApi();
    const events: TransferEvent[] = [];
    const { result } = renderHook(
      () =>
        useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "download",
          args: [{ onTransfer: (e) => void events.push(e), params: { id: "1" } }],
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.size).toBe(12);
    expect(phases(events)).toEqual([
      "download:start",
      "download:progress",
      "download:progress",
      "download:progress",
      "download:complete",
    ]);
    expect(events.at(-1)).toMatchObject({ loaded: 12, total: 12, attempt: 0 });
  });

  it("useResource: a flat write with a stream body is counted; a sized body is honestly `unsupported` here", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    const counted: TransferEvent[] = [];
    await act(async () => {
      await result.current.send(stream(3), {
        onTransfer: (e: TransferEvent) => void counted.push(e),
      });
    });
    expect(counted.filter((e) => e.direction === "upload").map((e) => e.phase)).toEqual([
      "start",
      "progress",
      "progress",
      "progress",
      "complete",
    ]);
    expect(counted.find((e) => e.direction === "upload" && e.phase === "complete")).toMatchObject({
      loaded: 12,
    });

    // jsdom's Blob has no stream(): the sized-body probe says unsupported and nothing is faked.
    const sized: TransferEvent[] = [];
    await act(async () => {
      await result.current.send(new Blob([new Uint8Array(6)]) as never, {
        onTransfer: (e: TransferEvent) => void sized.push(e),
      });
    });
    expect(sized.filter((e) => e.direction === "upload")).toEqual([
      expect.objectContaining({ phase: "unsupported" }),
    ]);
  });

  it("useResourceMutation: create with a file reports through the per-call option and is not stored in any key", async () => {
    const { api } = makeApi();
    const client = newClient();
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(client),
    });
    const events: TransferEvent[] = [];
    await act(async () => {
      await result.current.create(
        {
          name: "x",
          photo: new File([new Uint8Array(4)], "a.png", { type: "image/png" }),
        } as never,
        { onTransfer: (e: TransferEvent) => void events.push(e) },
      );
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ phase: "complete", direction: "download" });
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((m) => m.options.mutationKey),
      ),
    ).not.toContain("onTransfer");
  });

  it("a retry starts a new attempt sequence through the hook (progress isolated per attempt)", async () => {
    const { api, behavior, requests } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true)); // the default list query goes first
    behavior.next = () => new Response("busy", { status: 503 });
    const events: TransferEvent[] = [];
    await act(async () => {
      await result.current.send(new Blob([new Uint8Array(2)]) as never, {
        retry: { retries: 2, baseDelayMs: 0, maxDelayMs: 0, methods: ["PUT"] },
        onTransfer: (e: TransferEvent) => void events.push(e),
      });
    });
    expect(requests.filter((r) => r.startsWith("PUT"))).toHaveLength(2);
    expect([...new Set(events.map((e) => e.attempt))]).toEqual([0, 1]);
    expect(events.find((e) => e.attempt === 0 && e.phase === "error")).toMatchObject({
      willRetry: true,
    });
  });

  it("a custom transport that ignores onTransfer works through a hook and is reported unsupported", async () => {
    const transport: Transport = {
      async request() {
        const raw = new Response(JSON.stringify([{ id: "1", name: "x" }]), {
          headers: { "content-type": "application/json" },
        });
        return { status: 200, headers: raw.headers, raw, body: [{ id: "1", name: "x" }] };
      },
    };
    const api = defineApi<{ docs: { path: "/docs"; entity: { id: string; name: string } } }>()({
      baseURL: "https://x.dev",
      transport,
      resources: { docs: { path: "/docs" } },
    });
    const events: TransferEvent[] = [];
    const { result } = renderHook(
      () =>
        useResourceQuery(api.docs, {
          queryKey: ["d"],
          args: [{ onTransfer: (e: TransferEvent) => void events.push(e) }],
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(events).toEqual([
      expect.objectContaining({ phase: "unsupported", direction: "download" }),
    ]);
  });
});

describe("cancellation and timeout through the hooks", () => {
  it("a mutation-hook download aborted by its AbortController rejects with AbortError and ends with one abort event", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    const controller = new AbortController();
    const events: TransferEvent[] = [];
    let caught: unknown;
    await act(async () => {
      const pending = result.current
        .download({
          ...{
            signal: controller.signal,
            onTransfer: (e: TransferEvent) => void events.push(e),
          },
          params: { id: "1" },
        })
        .catch((e: unknown) => e);
      setTimeout(() => controller.abort(), 8);
      caught = await pending;
    });
    expect(caught).toBeInstanceOf(AbortError);
    expect(events.filter((e) => e.phase === "abort")).toHaveLength(1);
    expect(events.filter((e) => ["complete", "error"].includes(e.phase))).toHaveLength(0);
  });

  it("a stalled download hits the call timeout: TimeoutError reaches the caller and the transfer error event", async () => {
    const { api, behavior } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    behavior.next = (_u, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(2));
            (init.signal as AbortSignal).addEventListener("abort", () =>
              c.error((init.signal as AbortSignal).reason),
            );
          },
        }),
        { headers: { "content-length": "100" } },
      );
    const events: TransferEvent[] = [];
    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .download({
          ...{ timeout: 30, onTransfer: (e: TransferEvent) => void events.push(e) },
          params: { id: "1" },
        })
        .catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(TimeoutError);
    expect(events.at(-1)).toMatchObject({
      phase: "error",
      loaded: 2,
      total: 100,
      willRetry: false,
    });
  });

  it("a query's timeout reaches `error` (not a hang)", async () => {
    const { api, behavior } = makeApi();
    behavior.next = (_u, init) =>
      new Promise((_, reject) =>
        (init.signal as AbortSignal).addEventListener("abort", () =>
          reject((init.signal as AbortSignal).reason),
        ),
      );
    const { result } = renderHook(
      () =>
        useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "download",
          args: [{ ...{ timeout: 30 }, params: { id: "1" } }],
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(TimeoutError);
  });

  it("F6: events delivered after unmount reach the callback without throwing (guard state with a ref)", async () => {
    const { api } = makeApi();
    const { result, unmount } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    let mounted = true;
    const seen: string[] = [];
    const pending = result.current.download({
      ...{
        onTransfer: (e: TransferEvent) => {
          if (mounted) seen.push(e.phase); // the documented recipe: never set state once unmounted
        },
      },
      params: { id: "1" },
    });
    unmount();
    mounted = false;
    await expect(pending).resolves.toBeDefined();
    expect(seen.length).toBeLessThan(5);
  });
});
