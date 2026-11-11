/** @vitest-environment jsdom */
import { AbortError, defineApi } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { newClient, wrap } from "../helpers/query.js";

/**
 * v1.8.0 Batch 5 (register L7). Verdict recorded in versions/v1.8.0: a stream in the TanStack cache
 * is owned by its consumer and Core/React must not cancel it behind the consumer's back. These
 * tests pin the safe behaviors and the reason cancelling on replacement would be unsafe.
 */
type Doc = { id: string };
interface Track {
  requests: number;
  cancelled: number;
}
function makeApi(chunks = 3, failAfter?: number) {
  const track: Track = { requests: 0, cancelled: 0 };
  const fetchImpl = (async () => {
    track.requests++;
    let i = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          if (failAfter !== undefined && i >= failAfter) return c.error(new Error("socket reset"));
          if (i < chunks) c.enqueue(new Uint8Array([i++]));
          else c.close();
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
          feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream" },
        },
      },
    },
  });
  return { api, track };
}

describe("why a cached stream cannot be cancelled on replacement", () => {
  it("cancelling an unlocked stream makes it read as an empty, successful end", async () => {
    // A cancelled-but-held stream would look like an empty download: a misleading success.
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array([1]));
      },
    });
    await stream.cancel("replaced");
    const read = await stream.getReader().read();
    expect(read).toEqual({ done: true, value: undefined });
  });
});

describe("consumer ownership of cached streams", () => {
  it("a refetch never interrupts a consumer that is mid-read on the previous stream", async () => {
    const { api, track } = makeApi(4);
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["feed"], operation: "feed" }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const reader = (result.current.data as ReadableStream<Uint8Array>).getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([0]));
    await act(async () => {
      await result.current.refetch();
    });
    expect(track.requests).toBe(2);
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    expect(track.cancelled).toBe(0);
    await reader.cancel();
    expect(track.cancelled).toBe(1);
  });

  it("a second consumer of the same cached stream is refused while it is locked", async () => {
    const { api } = makeApi();
    const stream = (await api.docs.feed()) as ReadableStream<Uint8Array>;
    const first = stream.getReader();
    expect(() => stream.getReader()).toThrow(TypeError);
    first.releaseLock();
    expect(() => stream.getReader()).not.toThrow();
  });

  it("partial consumption then cancel releases the connection exactly once", async () => {
    const { api, track } = makeApi(10);
    const stream = (await api.docs.feed()) as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel("enough");
    await reader.cancel("again").catch(() => {});
    expect(track.cancelled).toBe(1);
  });

  it("an explicit abort after the response resolved errors the stream with AbortError", async () => {
    const { api } = makeApi(1000);
    const controller = new AbortController();
    const stream = (await api.docs.feed({
      signal: controller.signal,
    })) as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    await reader.read();
    controller.abort();
    const error = await reader.read().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AbortError);
  });

  it("a stream that fails mid-body surfaces the failure to its reader, never a clean end", async () => {
    const { api } = makeApi(5, 1);
    const reader = ((await api.docs.feed()) as ReadableStream<Uint8Array>).getReader();
    expect((await reader.read()).done).toBe(false);
    const error = await reader.read().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("socket reset");
  });

  it("an unread stream that later fails raises no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => void unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const { api } = makeApi(5, 0);
      await api.docs.feed(); // never read, never cancelled
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off("unhandledRejection", listener);
    }
    expect(unhandled).toEqual([]);
  });
});
