import type { Transport, TransportRequest } from "@apixa/core";
import { mockResponse } from "./response.js";
import { buildStore, findStore, handleStoreRequest, type MockStore } from "./store.js";
import type { Dataset } from "./types.js";

export interface CreateMockTransportOptions {
  /** One or more local datasets; routed by `meta.resource.path`. */
  dataset?: Dataset;
  datasets?: Dataset[];
}

/**
 * Mock `Transport` seeded from local dataset(s).
 * Supports builtin CRUD against `meta.resource.path` with an in-memory store.
 * Does not touch Core’s production Fetch path.
 */
export function createMockTransport(options: CreateMockTransportOptions): Transport {
  const datasets = options.datasets ?? (options.dataset ? [options.dataset] : []);
  if (datasets.length === 0) {
    throw new Error("createMockTransport requires dataset or datasets");
  }

  const stores: MockStore[] = datasets.map((dataset) => buildStore(dataset));

  return {
    async request(input: TransportRequest) {
      const url = new URL(input.url, "https://mock.local");
      const match = findStore(stores, url.pathname);
      if (!match) {
        return mockResponse(404, { message: `No mock dataset for ${url.pathname}` });
      }
      return handleStoreRequest(match.store, input, url);
    },
  };
}

export interface SelectiveMockTransportOptions {
  stores: MockStore[];
  /** Real network transport for non-mocked paths. */
  fallback: Transport;
}

/** Route matched paths to mock stores; everything else goes to `fallback`. */
export function createSelectiveMockTransport(
  options: SelectiveMockTransportOptions,
): Transport {
  const { stores, fallback } = options;

  return {
    async request(input: TransportRequest) {
      const url = new URL(input.url, "https://mock.local");
      const match = findStore(stores, url.pathname);
      if (!match) {
        return fallback.request(input);
      }
      return handleStoreRequest(match.store, input, url);
    },
  };
}
