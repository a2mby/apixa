/** @vitest-environment jsdom */
import { defineApi, getOperationMetadata } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "../../packages/tanstack-query/src/use-resource.js";
import { useResourceMutation } from "../../packages/tanstack-query/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";
import { newClient, wrap } from "../helpers/query.js";

const fetchSpy = vi.fn(() => Promise.reject(new Error("network")));
vi.stubGlobal("fetch", fetchSpy);

const makeApi = () =>
  defineApi({
    baseURL: "https://x.dev/v1",
    resources: {
      users: {
        path: "/users",
        mock: [
          { id: "1", name: "Ada" },
          { id: "2", name: "Grace" },
        ],
        pagination: "page",
        operations: { first: { kind: "read", run: (ctx) => ctx.request<unknown>({ path: "/1" }) } },
      },
    },
  });

describe("TanStack Query over a mocked Core resource", () => {
  it("classifies operations from Core metadata, with no mocking branch", () => {
    const meta = getOperationMetadata(makeApi().users);
    expect(meta?.getAll?.kind).toBe("read");
    expect(meta?.create?.kind).toBe("write");
    expect(meta?.first?.kind).toBe("read");
  });

  it("reads through the QueryClient, writes through the mutation lifecycle, and refetches", async () => {
    const api = makeApi();
    const client = newClient();
    const { result } = renderHook(() => useResource(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data.map((u) => u.name)).toEqual(["Ada", "Grace"]);
    expect(result.current.data?.total).toBe(2);

    await act(async () => {
      await result.current.create({ name: "Linus" });
    });
    await waitFor(() => expect(result.current.data?.total).toBe(3)); // invalidated, refetched
    expect(await api.users.count()).toBe(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates mock errors to the mutation and the query", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await act(async () => {
      await expect(result.current.create({ id: "1", name: "dup" })).rejects.toMatchObject({
        code: "MOCK_DUPLICATE_ID",
      });
    });
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(await api.users.count()).toBe(2);
  });

  it("cancels a pending mocked read when the signal aborts; the query key stays one stable entry", async () => {
    const api = defineApi({
      baseURL: "https://x.dev",
      resources: {
        slow: {
          path: "/slow",
          mock: async () => {
            await new Promise((r) => setTimeout(r, 40));
            return [{ id: "1" }];
          },
        },
      },
    });
    const controller = new AbortController();
    const pending = api.slow.getAll({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORT" });

    const client = newClient();
    const users = makeApi().users;
    const { rerender } = renderHook(() => useResourceQuery(users, { queryKey: ["users"] }), {
      wrapper: wrap(client),
    });
    rerender();
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(1));
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(["users", "list"]);
  });

  describe("custom declarative operations with mock handlers", () => {
    const runs = { getActive: 0, archive: 0 };
    const makeHandlerApi = () => {
      runs.getActive = 0;
      runs.archive = 0;
      return defineApi({
        baseURL: "https://x.dev",
        resources: {
          users: {
            path: "/users",
            mock: [
              { id: "1", name: "Adam", active: true },
              { id: "2", name: "Sarah", active: false },
            ],
            operations: {
              getActive: {
                kind: "read",
                method: "GET",
                path: "/active",
                mock: ({ records }) => {
                  runs.getActive++;
                  return records.filter((u) => u.active);
                },
              },
              archive: {
                kind: "write",
                method: "POST",
                path: "/:id/archive",
                mock: ({ store, params }) => {
                  runs.archive++;
                  return store.patch(params.id, { active: false });
                },
              },
              explode: {
                kind: "write",
                method: "POST",
                path: "/explode",
                mock: () => {
                  throw new Error("handler failed");
                },
              },
            },
          },
        },
      });
    };

    it("exposes custom reads on the query hook and custom writes on the mutation hook", async () => {
      const api = makeHandlerApi();
      const wrapper = wrap(newClient());
      const q = renderHook(() => useResourceQuery(api.users, { queryKey: ["users"] }), { wrapper });
      const m = renderHook(() => useResourceMutation(api.users, { queryKey: ["users"] }), {
        wrapper,
      });
      expect("getActive" in q.result.current).toBe(true);
      expect("archive" in q.result.current).toBe(false);
      expect("archive" in m.result.current).toBe(true);
      expect("getActive" in m.result.current).toBe(false);
      expect(await q.result.current.getActive()).toHaveLength(1);
      expect(runs.getActive).toBe(1);
    });

    it("useResource composes both: archive invalidates, the list refetches, handlers run once", async () => {
      const api = makeHandlerApi();
      const client = newClient();
      const { result } = renderHook(() => useResource(api.users, { queryKey: ["users"] }), {
        wrapper: wrap(client),
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(((await result.current.getActive()) as unknown[]).length).toBe(1);
      await act(async () => {
        await result.current.archive("1");
      });
      expect(runs.archive).toBe(1);
      expect(runs.getActive).toBe(1);
      expect(((await api.users.getActive()) as unknown[]).length).toBe(0);
      await waitFor(() =>
        expect(result.current.data?.map((u) => u.active)).toEqual([false, false]),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("propagates handler errors to the mutation state", async () => {
      const api = makeHandlerApi();
      const { result } = renderHook(() => useResourceMutation(api.users, { queryKey: ["users"] }), {
        wrapper: wrap(newClient()),
      });
      await act(async () => {
        await expect(result.current.explode()).rejects.toThrow("handler failed");
      });
      await waitFor(() => expect(result.current.explode.isError).toBe(true));
    });
  });
});
