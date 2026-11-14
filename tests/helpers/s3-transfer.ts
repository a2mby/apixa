import {
  ValidationError,
  type AdvancedTransferConfig,
  type ApiResponse,
  type TransferPartAck,
} from "apixa/core";

/** Backend-mediated S3 recipe: signing credentials never enter this module or the browser. */
export function s3Transfer<T>(
  source: string,
  chunkSize = 8 * 1024 * 1024,
): AdvancedTransferConfig<T> {
  type Part = { partNumber: number; size: number; etag: string };
  type Status =
    | { state: "active"; parts: Part[] }
    | { state: "completed"; result: T }
    | { state: "expired" | "aborted" };
  const ack = (part: Part): TransferPartAck => ({
    index: part.partNumber - 1,
    offset: (part.partNumber - 1) * chunkSize,
    size: part.size,
    etag: part.etag,
    verification: "unverified",
  });
  return {
    strategy: "chunked",
    source,
    chunkSize,
    protocol: {
      id: "backend-s3-multipart",
      version: 1,
      independentParts: true,
      replaySafeParts: true,
      emptyFile: "reject",
      minChunkSize: 5 * 1024 * 1024,
      maxChunkSize: 5 * 1024 * 1024 * 1024,
      maxParts: 10_000,
      initiate: (ctx, input) =>
        ctx.request({
          kind: "write",
          method: "POST",
          path: "/multipart",
          body: { size: input.source.size, type: input.source.type, chunkSize },
        }),
      inspect: async (ctx, input) => {
        const response = await ctx.request<ApiResponse<Status>>({
          kind: "read",
          method: "GET",
          path: `/multipart/${encodeURIComponent(input.session.id)}`,
          full: true,
        });
        const status = response.data;
        if (status.state === "completed")
          return { state: "completed", result: { ...response, data: status.result } };
        if (status.state !== "active") return { state: status.state };
        return { state: "active", parts: status.parts.map(ack) };
      },
      uploadPart: async (ctx, input) => {
        const partNumber = input.part.index + 1;
        // Obtain a fresh URL on each logical invocation. URLs/headers stay out of checkpoints.
        const signed = await ctx.request<{ url: string; headers?: Record<string, string> }>({
          kind: "write",
          method: "POST",
          path: `/multipart/${encodeURIComponent(input.session.id)}/presign`,
          body: { partNumber },
        });
        const response = await ctx.request<ApiResponse<string>>({
          kind: "write",
          method: "PUT",
          presigned: signed,
          body: input.part.blob,
          responseType: "text",
          full: true,
        });
        const etag = response.headers.get("etag");
        if (!etag)
          throw new ValidationError(
            "Storage response did not expose its part ETag; configure CORS ExposeHeaders.",
          );
        return ack({ partNumber, etag, size: input.part.size });
      },
      complete: async (ctx, input) => {
        const response = await ctx.request<ApiResponse<T>>({
          kind: "write",
          method: "POST",
          path: `/multipart/${encodeURIComponent(input.session.id)}/complete`,
          body: {
            parts: input.parts.map((part) => ({ partNumber: part.index + 1, etag: part.etag })),
          },
          full: true,
        });
        // The backend must parse provider XML/embedded errors, including HTTP-200 S3 errors.
        if (response.data && typeof response.data === "object" && "Error" in response.data)
          throw new ValidationError("Storage provider did not confirm multipart completion.");
        return response;
      },
      abort: async (ctx, input) => {
        await ctx.request({
          kind: "write",
          method: "DELETE",
          path: `/multipart/${encodeURIComponent(input.session.id)}`,
        });
      },
      // A 401/403 causes at most one renewal/reconciliation cycle. uploadPart then requests a fresh URL.
      renew: async (ctx, input) => {
        await ctx.request({
          kind: "read",
          method: "GET",
          path: `/multipart/${encodeURIComponent(input.session.id)}`,
        });
      },
    },
  };
}
