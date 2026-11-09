/** @vitest-environment jsdom */
import { defineApi, type TransferEvent } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { newClient, wrap } from "../helpers/query.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Doc = { id: string; name: string };

const body = new Uint8Array([1, 2, 3, 4, 5]);

function makeApi() {
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    // Drain an observed upload body so the upload completes.
    if (init?.body instanceof ReadableStream) {
      const reader = init.body.getReader();
      while (!(await reader.read()).done) {
        /* consume */
      }
    }
    return new Response(body, {
      headers: {
        "content-length": String(body.length),
        "content-type": "application/octet-stream",
      },
    });
  }) as typeof fetch;
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://x.dev/v1",
    transport: createFetchTransport(fetchImpl),
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          push: { kind: "write", method: "PUT", path: "/push", responseType: "blob" },
        },
      },
    },
  });
}

describe("onTransfer through the React hooks", () => {
  it("useResourceQuery: typed onTransfer in args, events delivered, result typed Blob", async () => {
    const api = makeApi();
    const events: TransferEvent[] = [];
    const { result } = renderHook(
      () =>
        useResourceQuery(api.docs, {
          queryKey: ["file"],
          operation: "download",
          args: [
            "1",
            {
              onTransfer: (event) => {
                expectTypeOf(event).toEqualTypeOf<TransferEvent>();
                events.push(event);
              },
            },
          ],
        }),
      { wrapper: wrap(newClient()) },
    );
    expectTypeOf<IsAny<typeof result.current>>().toEqualTypeOf<false>();
    expectTypeOf(result.current.data).toEqualTypeOf<Blob | undefined>();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(events.at(0)).toMatchObject({
      phase: "start",
      direction: "download",
      loaded: 0,
      total: 5,
    });
    expect(events.at(-1)).toMatchObject({ phase: "complete", loaded: 5, total: 5 });
  });

  it("onTransfer is not part of the query key: different callbacks share one cache entry", async () => {
    const api = makeApi();
    const client = newClient();
    const a = () => {};
    const b = () => {};
    const { result } = renderHook(
      () => ({
        one: useResourceQuery(api.docs, {
          queryKey: ["f"],
          operation: "download",
          args: ["1", { onTransfer: a }],
        }),
        two: useResourceQuery(api.docs, {
          queryKey: ["f"],
          operation: "download",
          args: ["1", { onTransfer: b }],
        }),
        plain: useResourceQuery(api.docs, { queryKey: ["f"], operation: "download", args: ["1"] }),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.plain.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("useResource and useResourceMutation: flat operations accept onTransfer and stay typed", async () => {
    const api = makeApi();
    const { result } = renderHook(
      () => ({
        resource: useResource(api.docs, { queryKey: ["docs"] }),
        mutation: useResourceMutation(api.docs, { queryKey: ["docs"] }),
      }),
      { wrapper: wrap(newClient()) },
    );
    type R = typeof result.current;
    expectTypeOf<IsAny<R["resource"]>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<R["mutation"]>>().toEqualTypeOf<false>();
    expectTypeOf<ReturnType<R["mutation"]["push"]>>().toEqualTypeOf<Promise<Blob>>();
    const events: TransferEvent[] = [];
    let out: Blob | undefined;
    await act(async () => {
      const upload = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(body);
          c.close();
        },
      });
      out = await result.current.mutation.push(upload, {
        onTransfer: (event) => {
          events.push(event);
        },
      });
    });
    expect(out).toBeInstanceOf(Blob);
    expect(events.filter((e) => e.direction === "upload").at(-1)).toMatchObject({
      phase: "complete",
      loaded: 5,
    });
    expect(events.filter((e) => e.direction === "download").at(-1)).toMatchObject({
      phase: "complete",
    });
  });
});
