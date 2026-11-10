/** @vitest-environment jsdom */
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchTransport, defineApi } from "apixa/core";
import { createResourceQueryOptions } from "../../packages/react/src/advanced.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { useResource } from "../../packages/react/src/use-resource.js";
import { newClient, wrap } from "../helpers/query.js";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
describe("advanced operations through existing hooks", () => {
  it("useResourceMutation preserves inferred results and acknowledged progress", async () => {
    const server = protocolServer();
    const api = server.client();
    const progress: number[] = [];
    const { result } = renderHook(
      () => useResourceMutation(api.files, { queryKey: ["advanced"] }),
      { wrapper: wrap(newClient()) },
    );
    await act(async () => {
      const value = await result.current.create(
        { document: source() },
        {
          transfer: {
            onSession(s) {
              progress.push(s.confirmedBytes);
            },
          },
        },
      );
      expect(value.size).toBe(13);
    });
    expect(progress.at(-1)).toBe(13);
    expect(server.completions).toBe(1);
  });
  it("useResource calls the same Core transfer, without a new hook or cache engine", async () => {
    const server = protocolServer();
    const api = server.client();
    const { result } = renderHook(
      () => useResource(api.files, { queryKey: ["advanced-facade"], query: { enabled: false } }),
      { wrapper: wrap(newClient()) },
    );
    await act(async () => {
      await result.current.create({ document: source() });
    });
    expect(server.completions).toBe(1);
  });
  it("transfer controls never enter automatic query identities", () => {
    const api = defineApi({
      baseURL: "https://api.example",
      resources: { files: { path: "/files" } },
    });
    const plain = createResourceQueryOptions(api.files, { queryKey: ["identity"] });
    const extra = createResourceQueryOptions(api.files, {
      queryKey: ["identity"],
      args: [{ transfer: { onSession() {} } }],
    });
    expect(extra.queryKey).toEqual(plain.queryKey);
  });
  it("presigned queries require an explicit safe identity instead of retaining signed URLs", () => {
    const api = defineApi({
      baseURL: "https://api.example",
      transport: createFetchTransport(),
      resources: {
        files: {
          path: "/files",
          operations: {
            download: {
              kind: "read",
              method: "GET",
              presigned: { origins: ["https://storage.example"] },
            },
          },
        },
      },
    });
    const args = [{ presigned: { url: "https://storage.example/key?signature=secret" } }] as [
      { presigned: { url: string } },
    ];
    expect(() =>
      createResourceQueryOptions(api.files, { queryKey: ["signed"], operation: "download", args }),
    ).toThrow(/keyParts/);
    const query = createResourceQueryOptions(api.files, {
      queryKey: ["signed"],
      operation: "download",
      args,
      keyParts: ["object-1"],
    });
    expect(JSON.stringify(query.queryKey)).not.toContain("secret");
  });
});
