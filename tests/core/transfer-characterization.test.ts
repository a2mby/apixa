import { NetworkError, defineApi } from "@apixa/core";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { describe, expect, it } from "vitest";

/**
 * Batch 0 characterization: v1.2.0 behavior that v1.3.0 must preserve. The two stream-lifetime gap
 * tests (abort and timeout not reaching a stream after the operation resolved) were reproduced
 * green on the v1.2.0 code first, then replaced by `stream-lifecycle.test.ts` when fixed.
 */

function api(fetchImpl: typeof fetch) {
  return defineApi<{ docs: { path: "/docs"; entity: { id: string } } }>()({
    baseURL: "https://api.example.com",
    transport: createFetchTransport(fetchImpl),
    resources: {
      docs: {
        path: "/docs",
        operations: {
          feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream" },
          push: { kind: "write", method: "POST", path: "/push", responseType: "text" },
        },
      },
    },
  } as never) as never as {
    docs: {
      feed(options?: Record<string, unknown>): Promise<ReadableStream<Uint8Array> | null>;
      push(body: unknown, options?: Record<string, unknown>): Promise<string>;
    };
  };
}

describe("v1.2.0 preserved behavior", () => {
  it("a mid-body failure is a NetworkError", async () => {
    const client = api((async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1]));
          queueMicrotask(() => c.error(new TypeError("terminated")));
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch);
    await expect(client.docs.push("x")).rejects.toBeInstanceOf(NetworkError);
  });
});
