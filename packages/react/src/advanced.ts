/**
 * Advanced / escape-hatch exports.
 * Prefer `useResource`, `useResourceQuery`, and `useResourceMutation` from `@apixa/react`.
 */

export { createResourceQueryController } from "./query-controller.js";
export type { ResourceQueryController, ListOverrides } from "./query-controller.js";
export {
  createResourceQueryOptions,
  createResourceInfiniteQueryOptions,
  prefetchResourceQuery,
  prefetchResourceInfiniteQuery,
} from "./query-options.js";
export type {
  ResourceQueryNativeOptions,
  DefaultResourceQueryOptions,
  ExplicitResourceQueryOptions,
  GeneratedQueryOptions,
  GeneratedInfiniteQueryOptions,
  ResourceInfiniteQueryOptions,
  ResourceInfiniteConfig,
} from "./query-options.js";
export { createQueryHelpers } from "./query-helpers.js";
export type {
  QueryTarget,
  InfiniteKeyTarget,
  PrefixTarget,
  ResourceCache,
  ResourcePrefetch,
  ResourceCancel,
} from "./query-helpers.js";
export { OptimisticLayers } from "./optimistic.js";
export type { OptimisticTarget } from "./optimistic.js";

export {
  createResourceMutationController,
  operationMutationOptions,
} from "./mutation-controller.js";
export type {
  ResourceMutationController,
  ConsumerMutationHandlers,
  OperationMutationConfig,
  OperationArgs,
  OperationData,
} from "./mutation-controller.js";

export { ResourceMutationStore, applyInvalidation } from "./mutation-store.js";
export { describeOperations } from "@apixa/internal-shared";
export type { OperationInfo } from "@apixa/internal-shared";

/** Compatibility: query + mutation controllers composed over one key factory. */
export { createResourceController } from "./controller.js";
export type { ResourceController } from "./controller.js";

export { createResourceKeys } from "./keys.js";

export { syncCacheAfterCreate, syncCacheAfterUpdate, syncCacheAfterDelete } from "./cache.js";
export type { CompleteEntityMapping } from "./cache.js";

export type {
  ResourceLike,
  ResourceKeyFactory,
  CreateResourceControllerConfig,
  InferListData,
  InferEntity,
  InferCreateBody,
  InferUpdateBody,
  UpdateVariables,
  CallableOperationName,
  OptionalOperationName,
  OperationParameters,
  OperationReturn,
  ReadOperationName,
  QueryOperationName,
} from "./types.js";

// Server-safe: no React runtime import. Construct a request-scoped client in a Server Component,
// prefetch with the helpers above, then pass `dehydrate(client)` to `ApixaHydrationBoundary`.
export { QueryClient } from "./query-client.js";
export type { QueryClientConfig } from "./query-client.js";
export { dehydrate } from "./hydration.js";
export type { DehydratedState, DehydrateOptions } from "./hydration.js";
