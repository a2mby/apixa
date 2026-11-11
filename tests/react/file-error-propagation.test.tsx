/** @vitest-environment jsdom */
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { ApiError, NetworkError, createTransferControl, type TransferCheckpoint } from "apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { newClient, wrap } from "../helpers/query.js";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

/**
 * v1.8.0 Batch 6 (register L16): failures of advanced transfers reach the hook exactly once, never
 * look like success, never invalidate the cache, and expose the checkpoint needed to recover.
 */
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("advanced transfer failures through useResourceMutation", () => {
  it("rejects once, reports onError once, never succeeds and leaves the cache alone", async () => {
    const server = protocolServer();
    server.faults.failPart = 1;
    const api = server.client();
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const events = { onError: 0, onSuccess: 0, onSettled: 0 };
    const { result } = renderHook(
      () =>
        useResourceMutation(api.files, {
          queryKey: ["files"],
          mutations: {
            create: {
              onError: () => void events.onError++,
              onSuccess: () => void events.onSuccess++,
              onSettled: () => void events.onSettled++,
            },
          },
        }),
      { wrapper: wrap(client) },
    );
    let error: unknown;
    await act(async () => {
      error = await result.current.create({ document: source() }).catch((e: unknown) => e);
    });
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as ApiError).advancedTransfer?.checkpoint).toBeDefined();
    await waitFor(() => expect(result.current.states.create.isError).toBe(true));
    expect(result.current.states.create.isSuccess).toBe(false);
    expect(result.current.states.create.data).toBeUndefined();
    expect(events).toEqual({ onError: 1, onSuccess: 0, onSettled: 1 });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("recovers through the same hook from the checkpoint on the error and then succeeds", async () => {
    const server = protocolServer();
    server.faults.failPart = 2;
    const api = server.client();
    const { result } = renderHook(() => useResourceMutation(api.files, { queryKey: ["files"] }), {
      wrapper: wrap(newClient()),
    });
    let checkpoint: TransferCheckpoint | undefined;
    await act(async () => {
      const error = await result.current.create({ document: source() }).catch((e: unknown) => e);
      checkpoint = (error as ApiError).advancedTransfer?.checkpoint;
    });
    await act(async () => {
      await result.current.create({ document: source() }, { transfer: { checkpoint } });
    });
    await waitFor(() => expect(result.current.states.create.isSuccess).toBe(true));
    expect(result.current.states.create.error).toBeNull();
    expect(server.completions).toBe(1);
    expect(server.sessions.size).toBe(1);
  });

  it("a caller cancel reaches the hook as one AbortError, not as success or a network failure", async () => {
    const server = protocolServer();
    server.faults.latency = () => new Promise((r) => setTimeout(r, 5));
    const api = server.client();
    const control = createTransferControl();
    const { result } = renderHook(() => useResourceMutation(api.files, { queryKey: ["files"] }), {
      wrapper: wrap(newClient()),
    });
    let error: unknown;
    await act(async () => {
      const pending = result.current
        .create(
          { document: source(40) },
          {
            transfer: {
              control,
              onSession: (s) => {
                if (s.confirmedBytes >= 4 && s.phase === "uploading") control.cancel("leave");
              },
            },
          },
        )
        .catch((e: unknown) => e);
      error = await pending;
    });
    expect((error as Error).name).toBe("AbortError");
    await waitFor(() => expect(result.current.states.create.isError).toBe(true));
    expect(result.current.states.create.isSuccess).toBe(false);
    expect(server.completions).toBe(0);
  });
});
