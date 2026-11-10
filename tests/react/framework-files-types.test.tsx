import { defineApi, type FileViolation, type TransferEvent, ValidationError } from "@apixa/core";
import { renderHook } from "@testing-library/react";
import { describe, expectTypeOf, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResourceQuery } from "../../packages/react/src/use-resource-query.js";

/** Compile-time contract: files and transfers through the hooks keep full inference (no `any`). */
type IsAny<T> = 0 extends 1 & T ? true : false;
type Doc = { id: string; name: string; photo?: string | null; gallery?: string[] | null };
const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
  baseURL: "https://x.dev",
  resources: {
    docs: {
      path: "/docs",
      fileFields: { photo: { maxSize: 10, accept: ["image/*"] }, gallery: { max: 3 } },
      operations: {
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
        raw: { kind: "read", method: "GET", path: "/:id/raw", responseType: "arrayBuffer" },
        note: { kind: "read", method: "GET", path: "/:id/note", responseType: "text" },
        send: { kind: "write", method: "PUT", path: "/send", responseType: "text" },
      },
    },
  },
});

describe("hook typing with files", () => {
  it("useResourceQuery: binary results and typed onTransfer in args", () => {
    const run = () => {
      const blob = renderHook(() =>
        useResourceQuery(api.docs, {
          queryKey: ["a"],
          operation: "download",
          args: [
            "1",
            {
              onTransfer: (e) => {
                expectTypeOf(e).toEqualTypeOf<TransferEvent>();
              },
            },
          ],
        }),
      ).result.current;
      expectTypeOf(blob.data).toEqualTypeOf<Blob | undefined>();
      expectTypeOf<IsAny<typeof blob>>().toEqualTypeOf<false>();
      const raw = renderHook(() =>
        useResourceQuery(api.docs, { queryKey: ["b"], operation: "raw", args: ["1"] }),
      ).result.current;
      expectTypeOf(raw.data).toEqualTypeOf<ArrayBuffer | undefined>();
      const note = renderHook(() =>
        useResourceQuery(api.docs, {
          queryKey: ["c"],
          operation: "note",
          args: ["1"],
          select: (text) => text.length,
        }),
      ).result.current;
      expectTypeOf(note.data).toEqualTypeOf<number | undefined>();
    };
    void run;
  });

  it("useResourceMutation / useResource: file inputs, per-call onTransfer and results", () => {
    const run = async () => {
      const m = renderHook(() => useResourceMutation(api.docs, { queryKey: ["d"] })).result.current;
      expectTypeOf<IsAny<typeof m>>().toEqualTypeOf<false>();
      const created = await m.create(
        { name: "x", photo: new File([], "a.png"), gallery: [new Blob([]), new File([], "b")] },
        {
          onTransfer: (e) => {
            expectTypeOf(e).toEqualTypeOf<TransferEvent>();
          },
        },
      );
      expectTypeOf(created).toEqualTypeOf<Doc>();
      // @ts-expect-error `name` is a string field, not a file field
      void m.create({ name: new File([], "a") });
      const sent = await m.send(new ReadableStream<Uint8Array>() as never, {
        onTransfer: () => {},
      });
      expectTypeOf(sent).toEqualTypeOf<string>();
      const r = renderHook(() => useResource(api.docs, { queryKey: ["d"] })).result.current;
      expectTypeOf<IsAny<typeof r>>().toEqualTypeOf<false>();
      expectTypeOf(await r.download("1")).toEqualTypeOf<Blob>();
      expectTypeOf(r.states.create.error).toEqualTypeOf<Error | null>();
    };
    void run;
  });

  it("errors narrow to ValidationError with typed violations", () => {
    const narrow = (error: unknown) => {
      if (error instanceof ValidationError) {
        expectTypeOf(error.violations).toEqualTypeOf<readonly FileViolation[]>();
        void (error.code satisfies string);
      }
    };
    void narrow;
  });
});
