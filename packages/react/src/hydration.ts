import {
  dehydrate as dehydrateTanStack,
  type DehydratedState,
  type DehydrateOptions,
} from "@tanstack/react-query";
import type { QueryClient } from "./query-client.js";

export type { DehydratedState, DehydrateOptions };

/** Serialize a (typically request-scoped) client's cache for `ApixaHydrationBoundary`. */
export function dehydrate(client: QueryClient, options?: DehydrateOptions): DehydratedState {
  return dehydrateTanStack(client, options);
}
