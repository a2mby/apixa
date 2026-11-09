/** @vitest-environment jsdom */
import { defineApi, mockFiles } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";
import { newClient, wrap } from "../helpers/query.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Doc = { id: string; name: string; file?: string | null };

/** jsdom's Blob has no arrayBuffer(). */
const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function makeApi() {
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://x.dev/v1",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: [{ id: "1", name: "Seed", file: null as string | null }],
        operations: {
          download: {
            kind: "read",
            method: "GET",
            path: "/:id/file",
            responseType: "blob",
            mock: ({ params, store, files }) =>
              files.get(store.get(params.id).file as string).blob(),
          },
          report: {
            kind: "write",
            method: "POST",
            path: "/report",
            responseType: "arrayBuffer",
            mock: ({ files }) => files.list()[0] && files.get(files.list()[0]!.ref).bytes(),
          },
        },
      },
    },
  });
}

async function seeded() {
  const api = makeApi();
  const doc = await api.docs.create({
    name: "Doc",
    file: new File([PNG], "a.png", { type: "image/png" }),
  });
  return { api, doc };
}

describe("binary downloads through the React hooks", () => {
  it("useResourceQuery: typed Blob data from a download operation, with select", async () => {
    const { api, doc } = await seeded();
    const { result } = renderHook(
      () => ({
        plain: useResourceQuery(api.docs, {
          queryKey: ["file", doc.id],
          operation: "download",
          args: [doc.id],
        }),
        sized: useResourceQuery(api.docs, {
          queryKey: ["size", doc.id],
          operation: "download",
          args: [doc.id],
          select: (blob) => blob.size,
        }),
      }),
      { wrapper: wrap(newClient()) },
    );
    expectTypeOf(result.current.plain.data).toEqualTypeOf<Blob | undefined>();
    expectTypeOf(result.current.sized.data).toEqualTypeOf<number | undefined>();
    expectTypeOf<IsAny<typeof result.current.plain>>().toEqualTypeOf<false>();
    await waitFor(() => expect(result.current.plain.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.sized.isSuccess).toBe(true));
    const blob = result.current.plain.data!;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(await bytesOf(blob)).toEqual(PNG);
    expect(result.current.sized.data).toBe(PNG.length);
  });

  it("useResource: a download observed as the query, flat operations typed, Blob results", async () => {
    const { api, doc } = await seeded();
    const { result } = renderHook(
      () =>
        useResource(api.docs, {
          queryKey: ["docs"],
          query: { operation: "download", args: [doc.id] },
        }),
      { wrapper: wrap(newClient()) },
    );
    type R = typeof result.current;
    expectTypeOf<IsAny<R>>().toEqualTypeOf<false>();
    expectTypeOf<R["data"]>().toEqualTypeOf<Blob | undefined>();
    expectTypeOf<ReturnType<R["download"]>>().toEqualTypeOf<Promise<Blob>>();
    expectTypeOf<ReturnType<R["report"]>>().toEqualTypeOf<Promise<ArrayBuffer>>();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Blob);
    const again = await result.current.download(doc.id);
    expect(again).toBeInstanceOf(Blob);
  });

  it("a write operation that returns a file works through useResourceMutation", async () => {
    const { api } = await seeded();
    const { result } = renderHook(() => useResourceMutation(api.docs, { queryKey: ["docs"] }), {
      wrapper: wrap(newClient()),
    });
    type W = typeof result.current;
    expectTypeOf<IsAny<W>>().toEqualTypeOf<false>();
    expectTypeOf<ReturnType<W["report"]>>().toEqualTypeOf<Promise<ArrayBuffer>>();
    let bytes: ArrayBuffer | undefined;
    await act(async () => {
      bytes = await result.current.report({ format: "bin" });
    });
    expect(new Uint8Array(bytes!)).toEqual(PNG);
    expect(mockFiles(api as never).size).toBe(1);
  });
});
