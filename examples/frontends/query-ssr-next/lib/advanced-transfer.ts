import {
  NetworkError,
  defineApi,
  type AdvancedTransferConfig,
  type ApiResponse,
  type TransferPartAck,
} from "apixa/core";

type Uploaded = { id: string; size: number; document?: string };
/** Demonstration protocol, with one explicit simulated interruption before the second part. */
export function createAdvancedApi() {
  let interruptOnce = true;
  const transfer: AdvancedTransferConfig<Uploaded> = {
    strategy: "chunked",
    source: "document",
    chunkSize: 4,
    concurrency: 1,
    protocol: {
      id: "next-example-parts",
      version: 1,
      independentParts: true,
      replaySafeParts: true,
      emptyFile: "complete",
      initiate: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "POST",
          path: "/sessions",
          body: { size: input.source.size },
        }),
      inspect: async (ctx, input) => {
        const response = await ctx.request<
          ApiResponse<{ state: "active" | "completed"; parts: TransferPartAck[]; result: Uploaded }>
        >({ kind: "read", method: "GET", path: `/sessions/${input.session.id}`, full: true });
        return response.data.state === "completed"
          ? { state: "completed", result: { ...response, data: response.data.result } }
          : { state: "active", parts: response.data.parts };
      },
      uploadPart: (ctx, input) => {
        if (input.part.index === 1 && interruptOnce) {
          interruptOnce = false;
          throw new NetworkError("Demonstration interruption; resume from the checkpoint.");
        }
        return ctx.request({
          kind: "write",
          method: "PUT",
          path: `/sessions/${input.session.id}/parts/${input.part.index}`,
          body: input.part.blob,
        });
      },
      complete: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "POST",
          path: `/sessions/${input.session.id}/complete`,
          body: { parts: input.parts },
          full: true,
        }),
      abort: async (ctx, input) => {
        await ctx.request({
          kind: "write",
          method: "DELETE",
          path: `/sessions/${input.session.id}`,
        });
      },
    },
  };
  return defineApi<{
    transfers: { entity: Uploaded; operations: { create: { body: { document: Blob } } } };
  }>()({
    baseURL: "/api",
    resources: {
      transfers: {
        path: "/transfers",
        fileFields: ["document"],
        fileLimits: { maxTotalSize: 1024 },
        operations: { create: { transfer } },
      },
    },
  });
}
