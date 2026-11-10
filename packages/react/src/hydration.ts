import {
  defaultShouldDehydrateQuery,
  dehydrate as dehydrateTanStack,
  type DehydratedState,
  type DehydrateOptions,
} from "@tanstack/react-query";
import type { QueryClient } from "./query-client.js";

export type { DehydratedState, DehydrateOptions };

/**
 * Data that must not be handed to a Server -> Client boundary: a stream is single-use (serializing
 * it consumes it), a `Blob` / `File` / `ArrayBuffer` copies its bytes into the page payload, and
 * React 18 or older Next versions cannot serialize them at all. The client fetches such queries
 * itself; everything else is dehydrated exactly as before.
 */
function isBinary(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return (
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    value instanceof ArrayBuffer ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
  );
}

/**
 * Serialize a (typically request-scoped) client's cache for `ApixaHydrationBoundary`. Queries whose
 * data is binary (`Blob`, `File`, `ArrayBuffer`) or a stream are left out; a `shouldDehydrateQuery`
 * option still applies on top (both must agree).
 */
export function dehydrate(client: QueryClient, options?: DehydrateOptions): DehydratedState {
  const shouldDehydrateQuery = options?.shouldDehydrateQuery ?? defaultShouldDehydrateQuery;
  return dehydrateTanStack(client, {
    ...options,
    shouldDehydrateQuery: (query) => shouldDehydrateQuery(query) && !isBinary(query.state.data),
  });
}
