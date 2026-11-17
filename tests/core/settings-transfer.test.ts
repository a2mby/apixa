import { HttpError, SchemaValidationError, defineApi, isHttpError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

const Uploaded = z
  .object({ id: z.string(), size: z.number(), document: z.string() })
  .transform((row) => ({
    ...row,
    ready: true as const,
  }));

describe("advanced transfer steps do not inherit resource schemas or response order", () => {
  it("validates the outer create and update results and leaves protocol steps alone", async () => {
    const server = protocolServer();
    const complete: (typeof server.config.protocol)["complete"] = async (ctx, input) => {
      const response = await server.config.protocol.complete(ctx, input);
      return { ...response, data: { ...response.data, document: "stored" } };
    };
    const uploadPart: (typeof server.config.protocol)["uploadPart"] = async (ctx, input) => {
      await ctx.request({
        kind: "write",
        method: "PUT",
        path: `/sessions/${input.session.id}/parts/${input.part.index}`,
        body: input.part.blob,
        responseType: "text",
        headers: {
          "x-offset": String(input.part.offset),
          ...(input.part.checksum ? { "x-checksum": input.part.checksum } : {}),
        },
      });
      return {
        index: input.part.index,
        offset: input.part.offset,
        size: input.part.size,
        verification: "unverified" as const,
      };
    };
    const textParts = { ...server.config.protocol, uploadPart, complete };
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: server.transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          schema: { response: Uploaded },
          settings: {
            response: { order: ["parse", "unwrap", "transform", "normalize", "validate"] },
          },
          operations: {
            create: { transfer: { ...server.config, protocol: textParts } },
            update: { transfer: { ...server.config, protocol: textParts } },
          },
        },
      },
    });
    await expect(api.files.create({ document: source(), size: 13, ready: true })).resolves.toEqual({
      id: "1",
      size: 13,
      document: "stored",
      ready: true,
    });
    await expect(api.files.update("9", { document: source() })).resolves.toEqual({
      id: "2",
      size: 13,
      document: "stored",
      ready: true,
    });
  });

  it("keeps a resource error schema on the outer operation and off protocol steps", async () => {
    const server = protocolServer();
    server.faults.failStatus = 410;
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: server.transport,
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          schema: {
            error: z.object({ error: z.string() }).transform((body) => ({ code: body.error })),
          },
          operations: { create: { transfer: server.config } },
        },
      },
    });
    const failure = await api.files.create({ document: source() }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).not.toBeInstanceOf(SchemaValidationError);
    expect(isHttpError(failure) ? failure.data : undefined).toEqual({ error: "expired url" });

    const missing = await api.files.getById("absent").catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(SchemaValidationError);
    expect(missing).toMatchObject({ phase: "error", status: 404 });
  });
});
