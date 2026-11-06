/** @vitest-environment jsdom */
import { defineApi, type Transport, type TransportRequest } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";
import { newClient, wrap } from "../helpers/query.js";
import { readsDuringRender } from "../helpers/render.js";

type User = { id: string; name: string };

/** Answers only the requests the test releases; the others wait until aborted. */
function heldTransport() {
  const requests: TransportRequest[] = [];
  const releases: Array<() => void> = [];
  const transport: Transport = {
    request: (input) => {
      requests.push(input);
      return new Promise((resolve, reject) => {
        input.signal?.addEventListener("abort", () => reject(input.signal!.reason), { once: true });
        releases.push(() =>
          resolve({
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            raw: new Response(),
            body: [{ id: "1", name: new URL(input.url).searchParams.get("search") ?? "" }],
          }),
        );
      });
    },
  };
  return { transport, requests, releases };
}

function api(transport: Transport) {
  return defineApi<{ users: { entity: User; query: { search: string } } }>()({
    baseURL: "https://x.dev",
    transport,
    resources: {
      users: {
        path: "/users",
        operations: {
          feed: {
            kind: "read",
            run: (ctx, search: string, signal?: AbortSignal) =>
              ctx.request<User[]>({ query: { search }, signal }),
          },
        },
      },
    },
  });
}

describe("query cancellation", () => {
  it("a search change aborts the obsolete Core request; the new one wins", async () => {
    const held = heldTransport();
    const client = api(held.transport);
    const { result } = renderHook(
      () => {
        const [search, setSearch] = useState("a");
        const users = useResourceQuery(client.users, {
          queryKey: ["users", { search }],
          query: { search },
        });
        return { users: readsDuringRender(users, "data", "error", "status"), setSearch };
      },
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(held.requests).toHaveLength(1));
    act(() => result.current.setSearch("b"));
    await waitFor(() => expect(held.requests).toHaveLength(2));
    // The first observer is gone, so TanStack aborts its signal; Core stops the transport call.
    await waitFor(() => expect(held.requests[0]!.signal?.aborted).toBe(true));
    act(() => held.releases[1]!());
    await waitFor(() => expect(result.current.users.data).toEqual([{ id: "1", name: "b" }]));
    expect(result.current.users.error).toBeNull();
  });

  it("unmount aborts the in-flight request", async () => {
    const held = heldTransport();
    const client = api(held.transport);
    const { unmount } = renderHook(() => useResourceQuery(client.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(held.requests).toHaveLength(1));
    unmount();
    await waitFor(() => expect(held.requests[0]!.signal?.aborted).toBe(true));
  });

  it("cancel() reverts native state without an error and without a retry", async () => {
    const held = heldTransport();
    const client = api(held.transport);
    const { result } = renderHook(
      () =>
        readsDuringRender(
          useResourceQuery(client.users, { queryKey: ["users"], retry: 3, retryDelay: 0 }),
          "status",
          "fetchStatus",
          "error",
        ),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(held.requests).toHaveLength(1));
    await act(() => result.current.cancel());
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(held.requests[0]!.signal?.aborted).toBe(true);
    expect(result.current.status).toBe("pending");
    expect(result.current.error).toBeNull();
    expect(held.requests).toHaveLength(1); // no retry of an intentional abort
  });

  it("a custom operation receives the signal only when its arguments ask for it", async () => {
    const held = heldTransport();
    const client = api(held.transport);
    const { unmount } = renderHook(
      () =>
        useResourceQuery(client.users, {
          queryKey: ["users"],
          operation: "feed",
          args: (context) => ["x", context.signal],
          keyParts: ["x"],
        }),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(held.requests).toHaveLength(1));
    unmount();
    await waitFor(() => expect(held.requests[0]!.signal?.aborted).toBe(true));
  });

  it("metadata-free resources receive exactly their own arguments", async () => {
    const getAll = vi.fn(async (...args: unknown[]) => {
      void args;
      return [] as User[];
    });
    const getById = vi.fn(async (id: string) => ({ id, name: "" }));
    const { result } = renderHook(
      () =>
        readsDuringRender(useResourceQuery({ getAll, getById }, { queryKey: ["plain"] }), "status"),
      { wrapper: wrap(newClient()) },
    );
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(getAll).toHaveBeenCalledWith();
    await act(() => result.current.getById("1"));
    expect(getById).toHaveBeenCalledWith("1");
  });
});
