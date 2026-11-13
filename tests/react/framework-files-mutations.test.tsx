/** @vitest-environment jsdom */
import { ValidationError } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { makeApi, type Doc } from "../helpers/framework-files.js";
import { newClient, wrap } from "../helpers/query.js";

const png = (size = 4) => new File([new Uint8Array(size)], "a.png", { type: "image/png" });
const gets = (requests: string[]) => requests.filter((r) => r === "GET /v1/docs").length;

describe("mutations with files: native state", () => {
  it("states.create goes pending -> success with the typed result; reset clears it", async () => {
    const { api } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.states.create.isIdle).toBe(true);
    let created: Doc | undefined;
    await act(async () => {
      created = await result.current.create({ name: "x", photo: png() } as never);
    });
    expect(created).toMatchObject({ id: "2", name: "made" });
    await waitFor(() => expect(result.current.states.create.isSuccess).toBe(true));
    expect(result.current.states.create.data).toMatchObject({ id: "2" });
    act(() => result.current.states.create.reset());
    await waitFor(() => expect(result.current.states.create.isIdle).toBe(true));
  });

  it("a rejected file puts the mutation in error with the typed ValidationError and sends nothing", async () => {
    const { api, requests } = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .create({ name: "x", photo: png(50) } as never)
        .catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).violations[0]).toMatchObject({
      code: "FILE_TOO_LARGE",
      path: "$.photo",
      limit: 8,
      actual: 50,
    });
    await waitFor(() => expect(result.current.states.create.isError).toBe(true));
    expect(result.current.states.create.error).toBeInstanceOf(ValidationError);
    expect(requests).toEqual([]);
  });

  it("retries: a replayable body is re-sent by TanStack retry; a validation failure is never retried", async () => {
    const { api, behavior, requests } = makeApi();
    behavior.next = () => new Response("busy", { status: 503 });
    const { result } = renderHook(
      () =>
        useResourceMutation(api.docs, {
          queryKey: ["d"],
          mutations: { create: { retry: 1, retryDelay: 0 } },
        }),
      { wrapper: wrap(newClient()) },
    );
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    expect(requests.filter((r) => r.startsWith("POST"))).toHaveLength(2);

    const rejected: string[] = [];
    await act(async () => {
      await result.current
        .create({ name: "x", photo: png(99) } as never)
        .catch(() => rejected.push("rejected"));
    });
    expect(requests.filter((r) => r.startsWith("POST"))).toHaveLength(2); // no new request for the invalid file
    expect(rejected).toEqual(["rejected"]);
  });
});

describe("cache invalidation with files", () => {
  it("a created file invalidates the resource's queries (resource-wide, the default) and refetches active ones", async () => {
    const { api, requests } = makeApi();
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gets(requests)).toBe(1);
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    await waitFor(() => expect(gets(requests)).toBe(2));
  });

  it("other resources' queries are untouched", async () => {
    const { api } = makeApi();
    const client = newClient();
    client.setQueryData(["other", "list"], ["kept"]);
    const { result } = renderHook(() => useResource(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    expect(client.getQueryState(["other", "list"])?.isInvalidated).toBe(false);
  });

  it("scoped recipe: invalidate: { details } keeps the list query untouched; invalidate: false skips everything", async () => {
    const { api, requests } = makeApi();
    const { result } = renderHook(
      () =>
        useResource(api.docs, {
          queryKey: ["d"],
          mutations: {
            create: { invalidate: { details: (data) => [(data as Doc).id] } },
            update: { invalidate: false },
          },
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    await act(async () => {
      await result.current.update("1", { body: { name: "y" } as never });
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(gets(requests)).toBe(1); // the list was never refetched
  });

  it("scoped recipe: invalidate: 'lists' refetches lists only", async () => {
    const { api, requests } = makeApi();
    const { result } = renderHook(
      () => ({
        list: useResource(api.docs, {
          queryKey: ["d"],
          mutations: { create: { invalidate: "lists" } },
        }),
        detail: useResourceQuery(api.docs, { queryKey: ["d"], operation: "getById", args: ["1"] }),
      }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() =>
      expect(result.current.list.isSuccess && result.current.detail.isSuccess).toBe(true),
    );
    const detailRequests = () => requests.filter((r) => r === "GET /v1/docs/1").length;
    expect(detailRequests()).toBe(1);
    await act(async () => {
      await result.current.list.create({ name: "x", photo: png() } as never);
    });
    await waitFor(() => expect(gets(requests)).toBe(2));
    expect(detailRequests()).toBe(1);
  });
});

describe("optimistic updates with files", () => {
  it("an optimistic row appears at once, is replaced by the server row, and rolls back when the file is rejected", async () => {
    const { api } = makeApi();
    const { result } = renderHook(
      () =>
        useResource(api.docs, {
          queryKey: ["d"],
          mutations: {
            create: {
              optimistic: {
                list: (list: Doc[], [body]) => [...list, { id: "temp", name: (body as Doc).name }],
              },
            },
          },
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    let rejected: unknown;
    await act(async () => {
      rejected = await result.current
        .create({ name: "optimistic", photo: png(99) } as never)
        .catch((e: unknown) => e);
    });
    expect(rejected).toBeInstanceOf(ValidationError);
    expect((result.current.data ?? []).some((d) => d.id === "temp")).toBe(false); // rolled back
    await act(async () => {
      await result.current.create({ name: "kept", photo: png() } as never);
    });
    await waitFor(() =>
      expect((result.current.data ?? []).some((d) => d.id === "temp")).toBe(false),
    );
  });
});
