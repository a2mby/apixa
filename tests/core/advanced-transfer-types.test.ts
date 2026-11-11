import {
  defineApi,
  type AdvancedTransferConfig,
  type ApiResponse,
  type TransferCheckpoint,
} from "apixa/core";
import { expectTypeOf, it } from "vitest";
import { protocolServer } from "../helpers/advanced-transfer-protocol.js";

it("preserves body/result inference and versioned checkpoint types", () => {
  const server = protocolServer();
  const api = server.client();
  expectTypeOf<Parameters<typeof api.files.create>[0]>().toMatchTypeOf<{ document: Blob | File }>();
  expectTypeOf<Awaited<ReturnType<typeof api.files.create>>>().toMatchTypeOf<{
    id: string;
    document: string;
  }>();
  expectTypeOf<TransferCheckpoint["version"]>().toEqualTypeOf<1>();
});

// Compile-only negative contract: never executes network work.
function compileContract(config: AdvancedTransferConfig) {
  defineApi<{ files: { entity: { id: string; file: string } } }>()({
    baseURL: "https://api.example",
    resources: {
      files: {
        path: "/files",
        fileFields: ["file"],
        operations: {
          // @ts-expect-error literal source must name a declared file field
          create: { transfer: { ...config, source: "missing" } },
        },
      },
    },
  });
  defineApi({
    baseURL: "https://api.example",
    resources: {
      files: {
        path: "/files",
        operations: {
          // @ts-expect-error reads cannot enable chunked uploads
          getAll: { transfer: config },
        },
      },
    },
  });
  const api = defineApi<{ files: { entity: { id: string; file: string } } }>()({
    baseURL: "https://api.example",
    resources: {
      files: { path: "/files", fileFields: ["file"], operations: { create: { transfer: config } } },
    },
  });
  const functionApi = defineApi({
    baseURL: "https://api.example",
    resources: {
      files: {
        path: "/files",
        operations: {
          send: {
            kind: "write",
            run: (ctx, body: Blob) => ctx.transfer(config, body, { full: true }),
          },
        },
      },
    },
  });
  expectTypeOf<Awaited<ReturnType<typeof functionApi.files.send>>>().toEqualTypeOf<
    ApiResponse<unknown>
  >();
  const full = api.files.create({ file: new Blob([]) }, { full: true });
  expectTypeOf(full).toEqualTypeOf<Promise<ApiResponse<{ id: string; file: string }>>>();
  // @ts-expect-error source is binary input, not a number
  api.files.create({ file: 123 });
  // @ts-expect-error malformed checkpoint is rejected at compile time
  api.files.create({ file: new Blob([]) }, { transfer: { checkpoint: { version: 2 } } });
}
void compileContract;
