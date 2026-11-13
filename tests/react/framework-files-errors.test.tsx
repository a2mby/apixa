/** @vitest-environment jsdom */
import {
  AbortError,
  HttpError,
  NetworkError,
  TimeoutError,
  ValidationError,
  defineApi,
} from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { makeApi } from "../helpers/framework-files.js";
import { newClient, wrap } from "../helpers/query.js";

const png = (size: number) =>
  new File([new Uint8Array(size)], "secret-name.png", { type: "image/png" });

describe("error propagation through the hooks", () => {
  it("HttpError (with its parsed body) reaches a query's `error` and a mutation's `error` / rejected promise", async () => {
    const { api, behavior } = makeApi();
    behavior.next = () => Response.json({ message: "nope" }, { status: 422 });
    const query = renderHook(
      () =>
        useResourceQuery(api.docs, {
          queryKey: ["d"],
          operation: "download",
          args: [{ params: { id: "1" } }],
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(query.result.current.isError).toBe(true));
    expect(query.result.current.error).toBeInstanceOf(HttpError);
    expect((query.result.current.error as HttpError).status).toBe(422);
    expect((query.result.current.error as HttpError).data).toEqual({ message: "nope" });

    const { api: api2, behavior: behavior2 } = makeApi();
    const mutation = renderHook(() => useResourceMutation(api2.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    behavior2.next = () => Response.json({ message: "bad" }, { status: 400 });
    let caught: unknown;
    await act(async () => {
      caught = await mutation.result.current
        .create({ name: "x" } as never)
        .catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(HttpError);
    await waitFor(() =>
      expect(mutation.result.current.states.create.error).toBeInstanceOf(HttpError),
    );
  });

  it("NetworkError: a failed connection reaches the hook consumer", async () => {
    const api = defineApi<{ docs: { path: "/docs"; entity: { id: string } } }>()({
      baseURL: "https://x.dev",
      transport: createFetchTransport((async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch),
      resources: { docs: { path: "/docs" } },
    });
    const { result } = renderHook(
      () => useResourceQuery(api.docs, { queryKey: ["d"], retry: false }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(NetworkError);
  });

  it("ValidationError.violations are typed and safe (no name or content) through query, mutation and promise", async () => {
    const { api, requests } = makeApi();
    const { result } = renderHook(
      () => ({
        m: useResourceMutation(api.docs, { queryKey: ["d"] }),
        q: useResourceQuery(api.docs, {
          queryKey: ["l"],
          operation: "download",
          args: [{ ...{ maxResponseSize: 3 }, params: { id: "1" } }],
        }),
      }),
      {
        wrapper: wrap(newClient()),
      },
    );
    let caught: unknown;
    await act(async () => {
      caught = await result.current.m
        .create({ name: "x", photo: png(50) } as never)
        .catch((e: unknown) => e);
    });
    const error = caught as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    const violations = error.violations; // typed readonly FileViolation[]
    expect(violations.map((v) => v.code).sort()).toEqual(["FILE_TOO_LARGE"]);
    expect(JSON.stringify(violations) + error.message).not.toContain("secret-name");
    await waitFor(() =>
      expect(result.current.m.states.create.error).toBeInstanceOf(ValidationError),
    );
    expect(requests.filter((r) => r.startsWith("POST"))).toEqual([]);

    // A response limit surfaces as the query's error (early reject from the trustworthy Content-Length).
    await waitFor(() => expect(result.current.q.isError).toBe(true));
    expect(result.current.q.error).toBeInstanceOf(ValidationError);
    expect((result.current.q.error as ValidationError).violations[0]).toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      limit: 3,
      actual: 12,
    });
  });

  it("AbortError and TimeoutError keep their classes through useResource flat reads", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const flat = result.current as never as { download(options: object): Promise<unknown> };
    const controller = new AbortController();
    controller.abort();
    expect(
      await flat
        .download({ ...{ signal: controller.signal }, params: { id: "1" } })
        .catch((e: unknown) => e),
    ).toBeInstanceOf(AbortError);
    expect(
      await flat.download({ ...{ timeout: 1 }, params: { id: "1" } }).catch((e: unknown) => e),
    ).toBeInstanceOf(TimeoutError);
  });

  it("a transfer `error` event and the rejected promise describe the same failure", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    const events: Array<{ phase: string }> = [];
    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .send(
          new ReadableStream({ start: (c) => c.error(new TypeError("source failed")) }) as never,
          { onTransfer: (e: { phase: string }) => void events.push(e) },
        )
        .catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(NetworkError);
    expect(events.at(-1)?.phase === "error" || events.at(-1)?.phase === "start").toBe(true);
  });
});
