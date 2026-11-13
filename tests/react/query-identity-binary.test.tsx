/** @vitest-environment jsdom */
import { defineApi } from "@apixa/core";
import { QueryClient, hashKey } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import {
  createResourceQueryOptions,
  prefetchResourceQuery,
} from "../../packages/react/src/advanced.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { newClient, wrap } from "../helpers/query.js";

type Doc = { id: string; name: string };

function makeApi() {
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const body =
      new URL(url).pathname === "/v1/docs/1" ? { id: "1", name: "x" } : [{ id: "1", name: "x" }];
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://x.dev/v1",
    transport: createFetchTransport(fetchImpl),
    resources: {
      docs: {
        path: "/docs",
        operations: {
          // A read that takes a File-like argument (for example a lookup by uploaded content).
          lookup: {
            kind: "read",
            run: async (ctx: { request: (init: object) => Promise<unknown> }, probe: unknown) => {
              void probe;
              return ctx.request({ path: "/lookup" });
            },
          },
        },
      },
    },
  });
  return { api, calls };
}

describe("F1: binary values in query identity", () => {
  it("TanStack hashes two different Files identically (the root of the risk)", () => {
    const a = new File(["aaa"], "a.txt");
    const b = new File(["bbbbbb"], "b.bin");
    expect(hashKey(["probe", a])).toBe(hashKey(["probe", b]));
    expect(hashKey(["probe", new Blob(["x"])])).toBe(hashKey(["probe", new Blob(["yyyy"])]));
  });
});

describe("F4: execution-only options stay out of query identity", () => {
  const options = {
    signal: new AbortController().signal,
    timeout: 5,
    retry: 2,
    onTransfer: () => {},
    maxResponseSize: 10,
  };

  it("plain queries: the key is the same with or without the options", () => {
    const { api } = makeApi();
    const bare = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      operation: "getById",
      args: ["1"],
    });
    const withOptions = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      operation: "getById",
      args: ["1", options],
    });
    expect(hashKey(withOptions.queryKey)).toBe(hashKey(bare.queryKey));
  });

  it("list queries keep the compatible key", () => {
    const { api } = makeApi();
    const bare = createResourceQueryOptions(api.docs, { queryKey: ["d"] });
    const withOptions = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      args: [{ onTransfer: () => {}, maxResponseSize: 5, timeout: 1 }],
    });
    expect(hashKey(withOptions.queryKey)).toBe(hashKey(bare.queryKey));
  });

  it("infinite queries: identity is the caller's keyParts, never the callbacks", () => {
    const { api } = makeApi();
    const a = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      infinite: { initialPageParam: 1, getNextPageParam: () => undefined, query: () => ({}) },
      keyParts: ["feed"],
    } as never);
    const b = createResourceQueryOptions(api.docs, {
      queryKey: ["d"],
      infinite: {
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        query: () => ({ onTransfer: () => {} }),
      },
      keyParts: ["feed"],
    } as never);
    expect(hashKey(a.queryKey)).toBe(hashKey(b.queryKey));
  });

  it("prefetch uses the same identity: a prefetch with options feeds the plain query", async () => {
    const { api, calls } = makeApi();
    const client = new QueryClient();
    await prefetchResourceQuery(client, api.docs, {
      queryKey: ["d"],
      operation: "getById",
      args: ["1", options],
    } as never);
    expect(calls).toHaveLength(1);
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["d"], operation: "getById", args: ["1"] }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("hook: different callbacks and limits share one cache entry and one request", async () => {
    const { api, calls } = makeApi();
    const client = newClient();
    const { result } = renderHook(
      () => ({
        a: useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "getById",
          args: ["1", { onTransfer: () => {}, maxResponseSize: 99 }],
        }),
        b: useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "getById",
          args: ["1", { onTransfer: () => {}, timeout: 5000 }],
        }),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.a.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});

describe("F1 (defect, fixed): a binary argument can never silently share a cache entry", () => {
  const binaries: Array<[string, () => unknown]> = [
    ["File", () => new File(["a"], "a.txt")],
    ["Blob", () => new Blob(["a"])],
    ["ArrayBuffer", () => new ArrayBuffer(4)],
    ["FormData", () => new FormData()],
    ["ReadableStream", () => new ReadableStream()],
  ];

  it.each(binaries)(
    "%s in args is rejected with a clear error instead of colliding",
    (_name, make) => {
      const { api } = makeApi();
      expect(() =>
        createResourceQueryOptions(api.docs, {
          queryKey: ["d"],
          operation: "lookup",
          args: [make()],
        } as never),
      ).toThrow(/cannot be part of a query's identity/);
    },
  );

  it("also when nested in an options object or array", () => {
    const { api } = makeApi();
    expect(() =>
      createResourceQueryOptions(api.docs, {
        queryKey: ["d"],
        operation: "lookup",
        args: [{ probe: { deep: [new File(["a"], "a")] } }],
      } as never),
    ).toThrow(/cannot be part of a query's identity/);
  });

  it("through the hook the error surfaces at render, naming the fix", () => {
    const { api } = makeApi();
    expect(() =>
      renderHook(
        () =>
          useResourceQuery(api.docs, {
            queryKey: ["d"],
            operation: "lookup",
            args: [new File(["a"], "a")],
          } as never),
        {
          wrapper: wrap(newClient()),
        },
      ),
    ).toThrow(/keyParts/);
  });

  it("an explicit keyParts identity is the supported way to run a query that takes a binary argument", async () => {
    const { api, calls } = makeApi();
    const client = newClient();
    const first = new File(["a"], "a");
    const second = new File(["bbbb"], "b");
    const { result, rerender } = renderHook(
      ({ file, id }: { file: File; id: string }) =>
        useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "lookup",
          args: [file],
          keyParts: [id],
        } as never),
      { wrapper: wrap(client), initialProps: { file: first, id: "a" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ file: second, id: "b" });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });

  it("plain arguments, ids and option objects are unaffected", () => {
    const { api } = makeApi();
    expect(() =>
      createResourceQueryOptions(api.docs, {
        queryKey: ["d"],
        operation: "getById",
        args: ["1", { timeout: 1 }],
      }),
    ).not.toThrow();
    expect(() =>
      createResourceQueryOptions(api.docs, {
        queryKey: ["d"],
        operation: "lookup",
        args: [{ name: "x", tags: ["a"] }],
      } as never),
    ).not.toThrow();
  });
});
