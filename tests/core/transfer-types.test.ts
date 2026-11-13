import {
  defineApi,
  type ApiResponse,
  type TransferEvent,
  type TransferObserver,
  type TransferSupport,
  detectTransferSupport,
} from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";

/**
 * v1.3.0 compile-time contract for `onTransfer`. Calls live in never-invoked functions;
 * `tsc -p tests/tsconfig.json` checks the assertions.
 */

type IsAny<T> = 0 extends 1 & T ? true : false;
type Doc = { id: string; name: string };
type AppApi = { docs: { path: "/docs"; entity: Doc } };
const baseURL = "https://api.example.com";

const client = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: {
            kind: "read",
            method: "GET",
            path: "/:id/file",
            responseType: "blob",
            onTransfer: (event) => {
              expectTypeOf(event).toEqualTypeOf<TransferEvent>();
            },
          },
          plain: { kind: "read", method: "GET", path: "/plain" },
          archive: {
            kind: "write",
            run: async (ctx, id: string) => {
              const blob = await ctx.request({
                method: "POST",
                path: `/${id}/archive`,
                responseType: "blob",
                onTransfer: (event) => {
                  expectTypeOf(event).toEqualTypeOf<TransferEvent>();
                },
              });
              expectTypeOf(blob).toEqualTypeOf<Blob>();
              return blob;
            },
          },
        },
      },
    },
  });

describe("onTransfer types", () => {
  it("is typed on builtins, declarative operations and function operations", () => {
    const run = () => {
      const api = client();
      const seen: TransferObserver = (event) => {
        if (event.phase === "unsupported") {
          expectTypeOf(event.reason).toEqualTypeOf<string>();
          // @ts-expect-error `loaded` does not exist on an unsupported event
          event.loaded;
        } else {
          expectTypeOf(event.loaded).toEqualTypeOf<number>();
          expectTypeOf(event.total).toEqualTypeOf<number | undefined>();
          expectTypeOf(event.attempt).toEqualTypeOf<number>();
        }
        if (event.phase === "error") {
          expectTypeOf(event.willRetry).toEqualTypeOf<boolean>();
          expectTypeOf(event.error).toEqualTypeOf<Error>();
        }
        expectTypeOf(event.direction).toEqualTypeOf<"upload" | "download">();
      };
      void api.docs.getAll({ onTransfer: seen });
      void api.docs.getById("1", {
        onTransfer: (event) => {
          expectTypeOf(event).toEqualTypeOf<TransferEvent>();
        },
      });
      void api.docs.create({ name: "x" }, { onTransfer: seen });
      void api.docs.download({ ...({ onTransfer: seen }), params: { id: "1" } });
      void api.docs.plain({ onTransfer: seen });
      // @ts-expect-error onTransfer takes a function
      void api.docs.download({ ...({ onTransfer: "nope" }), params: { id: "1" } });
      // @ts-expect-error the callback receives a TransferEvent, not a number
      void api.docs.download({ ...({ onTransfer: (n: number) => n }), params: { id: "1" } });
    };
    void run;
  });

  it("does not change result inference", () => {
    const run = async () => {
      const api = client();
      const onTransfer: TransferObserver = () => {};
      const blob = await api.docs.download({ ...({ onTransfer }), params: { id: "1" } });
      expectTypeOf(blob).toEqualTypeOf<Blob>();
      const full = await api.docs.download({ ...({ onTransfer, full: true }), params: { id: "1" } });
      expectTypeOf(full).toEqualTypeOf<ApiResponse<Blob>>();
      const entity = await api.docs.getById("1", { onTransfer });
      expectTypeOf(entity).toEqualTypeOf<Doc>();
      expectTypeOf<IsAny<typeof entity>>().toEqualTypeOf<false>();
      const buf = await api.docs.getById("1", { onTransfer, responseType: "arrayBuffer" });
      expectTypeOf(buf).toEqualTypeOf<ArrayBuffer>();
      const list = await api.docs.getAll({ onTransfer });
      expectTypeOf<IsAny<typeof list>>().toEqualTypeOf<false>();
      const archived = await api.docs.archive("1");
      expectTypeOf(archived).toEqualTypeOf<Blob>();
    };
    void run;
  });

  it("exports a typed capability probe", () => {
    expectTypeOf(detectTransferSupport()).toEqualTypeOf<TransferSupport>();
    expectTypeOf<TransferSupport>().toEqualTypeOf<{
      uploadProgress: boolean;
      streamingUpload: boolean;
      downloadProgress: boolean;
      streamTransform: boolean;
    }>();
  });
});
