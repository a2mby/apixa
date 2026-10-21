import { AbortError, type Transport, type TransportRequest } from "@apixa/core";
import { findStore, handleStoreRequest, type MockStore } from "./store.js";

export interface SelectiveMockTransportOptions {
  stores: MockStore[];
  /** Real network transport for non-mocked paths. */
  fallback: Transport;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw new AbortError("Request was aborted", { cause: signal.reason });
}

/**
 * Core `defineApi` bridge only (used by the resource `mock` / `mockConfig` processor).
 * Route matched paths to mock stores; everything else goes to `fallback`.
 * Not part of the standalone `defineMockApi()` path.
 */
export function createSelectiveMockTransport(options: SelectiveMockTransportOptions): Transport {
  const { stores, fallback } = options;

  return {
    async request(input: TransportRequest) {
      throwIfAborted(input.signal);
      const url = new URL(input.url, "https://mock.local");
      const match = findStore(stores, url.pathname);
      if (!match) {
        return fallback.request(input);
      }
      return handleStoreRequest(match.store, input, url);
    },
  };
}
