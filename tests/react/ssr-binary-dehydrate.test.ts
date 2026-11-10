import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { dehydrate, prefetchResourceQuery } from "../../packages/react/src/advanced.js";
import { QueryClient } from "../../packages/react/src/query-client.js";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";

/**
 * F3. A prefetched binary or stream result must not be handed to a Server -> Client boundary:
 * a stream is single-use (serializing it consumes it), a Blob duplicates its bytes into the page
 * payload, and React 18 / older Next versions cannot serialize them at all. Serializable data is
 * dehydrated exactly as before.
 */
const fetchImpl = (async (url: string) => {
  if (String(url).endsWith("/list")) return Response.json([{ id: "1" }]);
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: { "content-type": "application/octet-stream" },
  });
}) as typeof fetch;

const api = defineApi<{ docs: { path: "/docs"; entity: { id: string } } }>()({
  baseURL: "https://x.dev",
  transport: createFetchTransport(fetchImpl),
  resources: {
    docs: {
      path: "/docs",
      operations: {
        list: { kind: "read", method: "GET", path: "/list" },
        blob: { kind: "read", method: "GET", path: "/blob", responseType: "blob" },
        buffer: { kind: "read", method: "GET", path: "/buffer", responseType: "arrayBuffer" },
        text: { kind: "read", method: "GET", path: "/text", responseType: "text" },
        feed: { kind: "read", method: "GET", path: "/feed", responseType: "stream" },
      },
    },
  },
});

async function prefetchAll() {
  const client = new QueryClient();
  for (const operation of ["list", "blob", "buffer", "text", "feed"]) {
    await prefetchResourceQuery(client, api.docs, {
      queryKey: ["d", operation],
      operation,
    } as never);
  }
  return client;
}

describe("dehydrate and binary data (F3)", () => {
  it("keeps serializable results and drops Blob, ArrayBuffer and stream results", async () => {
    const state = dehydrate(await prefetchAll());
    const keys = state.queries.map((q) => String(q.queryKey[1]));
    expect(keys.sort()).toEqual(["list", "text"]);
  });

  it("a stream is left untouched: still readable by its owner", async () => {
    const client = await prefetchAll();
    dehydrate(client);
    const stream = client.getQueryData([
      "d",
      "feed",
      ...(client
        .getQueryCache()
        .findAll({ queryKey: ["d", "feed"] })[0]
        ?.queryKey.slice(2) ?? []),
    ] as never) as ReadableStream | undefined;
    const data = client.getQueryCache().findAll({ queryKey: ["d", "feed"] })[0]!.state
      .data as ReadableStream<Uint8Array>;
    void stream;
    expect(data).toBeInstanceOf(ReadableStream);
    expect(data.locked).toBe(false);
  });

  it("composes with a caller's shouldDehydrateQuery (both must agree)", async () => {
    const client = await prefetchAll();
    const state = dehydrate(client, {
      shouldDehydrateQuery: (q) => String(q.queryKey[1]) !== "text",
    });
    expect(state.queries.map((q) => String(q.queryKey[1]))).toEqual(["list"]);
  });

  it("without options it equals TanStack's default for plain data", async () => {
    const client = new QueryClient();
    await prefetchResourceQuery(client, api.docs, {
      queryKey: ["d", "list"],
      operation: "list",
    } as never);
    expect(dehydrate(client).queries).toHaveLength(1);
  });
});
