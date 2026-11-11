/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { makeApi } from "../helpers/framework-files.js";
import { wrap } from "../helpers/query.js";

/**
 * v1.8.0 source audit (R1): TanStack keeps a mutation's variables, including the File, in its
 * mutation cache until the mutation is garbage collected (`gcTime`, 5 minutes by default). That is
 * TanStack's ownership model, so Apixa documents the recipe instead of working around it.
 */
const png = () => new File([new Uint8Array(4)], "a.png", { type: "image/png" });
const heldFiles = (client: QueryClient) =>
  client
    .getMutationCache()
    .getAll()
    .filter((m) =>
      ((m.state.variables as unknown[] | undefined) ?? []).some(
        (v) =>
          v instanceof File ||
          (!!v && typeof v === "object" && Object.values(v).some((x) => x instanceof File)),
      ),
    );

describe("mutation variables retain the uploaded File until the mutation is collected", () => {
  it("characterized: the File stays in the mutation cache after success", async () => {
    const { api } = makeApi();
    const client = new QueryClient();
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(client),
    });
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    expect(heldFiles(client)).toHaveLength(1);
  });

  it("recipe 1: reset() releases the observer's mutation", async () => {
    const { api } = makeApi();
    const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] }), {
      wrapper: wrap(client),
    });
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    act(() => result.current.states.create.reset());
    await waitFor(() => expect(heldFiles(client)).toHaveLength(0));
  });

  it("recipe 2: a QueryClient with mutations.gcTime 0 drops it when the component unmounts", async () => {
    const { api } = makeApi();
    const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result, unmount } = renderHook(
      () => useResourceMutation(api.docs, { queryKey: ["d"] }),
      { wrapper: wrap(client) },
    );
    await act(async () => {
      await result.current.create({ name: "x", photo: png() } as never);
    });
    unmount();
    await waitFor(() => expect(heldFiles(client)).toHaveLength(0));
  });
});
