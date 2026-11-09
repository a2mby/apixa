/** @vitest-environment jsdom */
import { ValidationError, defineApi, type FileViolation } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { newClient, wrap } from "../helpers/query.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Pet = { id: string; name: string; photo?: string | null };

function makeApi() {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ id: "1", name: "ok" }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const api = defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
    baseURL: "https://x.dev/v1",
    transport: createFetchTransport(fetchImpl),
    resources: {
      pets: {
        path: "/pets",
        fileFields: { photo: { maxSize: 4, accept: ["image/*"] } },
        operations: {
          export: {
            kind: "read",
            method: "GET",
            path: "/export",
            responseType: "text",
            maxResponseSize: 1000,
          },
        },
      },
    },
  });
  return { api, urls };
}

describe("file validation through the React hooks", () => {
  it("useResourceMutation: a rule violation surfaces as a typed ValidationError and nothing is sent", async () => {
    const { api, urls } = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.pets, { queryKey: ["pets"] }), {
      wrapper: wrap(newClient()),
    });
    expectTypeOf<IsAny<typeof result.current>>().toEqualTypeOf<false>();
    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .create({
          name: "x",
          photo: new File([new Uint8Array(50)], "a.png", { type: "image/png" }),
        } as never)
        .catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(ValidationError);
    const violations: readonly FileViolation[] = (caught as ValidationError).violations;
    expect(violations[0]).toMatchObject({
      code: "FILE_TOO_LARGE",
      path: "$.photo",
      limit: 4,
      actual: 50,
    });
    expect(urls).toEqual([]);
    expect(result.current.states.create.isError).toBe(true);
  });

  it("a valid file goes through the same hook", async () => {
    const { api, urls } = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.pets, { queryKey: ["pets"] }), {
      wrapper: wrap(newClient()),
    });
    await act(async () => {
      await result.current.create({
        name: "x",
        photo: new File([new Uint8Array(2)], "a.png", { type: "image/png" }),
      } as never);
    });
    expect(urls).toHaveLength(1);
  });

  it("rules coexist with onTransfer, and a per-call maxResponseSize is not part of the query key", async () => {
    const { api } = makeApi();
    const client = newClient();
    const events: string[] = [];
    const { result } = renderHook(
      () => ({
        a: useResourceQuery(api.pets, {
          queryKey: ["e"],
          operation: "export",
          args: [{ maxResponseSize: 10 }],
        }),
        b: useResourceQuery(api.pets, {
          queryKey: ["e"],
          operation: "export",
          args: [{ maxResponseSize: 99, onTransfer: (e) => void events.push(e.phase) }],
        }),
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => expect(result.current.a.isSuccess || result.current.a.isError).toBe(true));
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("useResource stays fully typed with rules configured", () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.pets, { queryKey: ["pets"] }), {
      wrapper: wrap(newClient()),
    });
    expectTypeOf<IsAny<typeof result.current>>().toEqualTypeOf<false>();
  });
});
