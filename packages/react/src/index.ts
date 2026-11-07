export { useResourceQuery } from "./use-resource-query.js";
export type {
  UseResourceQueryOptions,
  OperationOnlyQueryOptions,
  ResourceQueryResult,
  ResourceOperationsQueryResult,
  ResourceInfiniteQueryResult,
  ResourceInfiniteQueryOptions,
  ListResource,
} from "./use-resource-query.js";
export type {
  QueryTarget,
  InfiniteKeyTarget,
  PrefixTarget,
  ResourceCache,
  ResourcePrefetch,
  ResourceCancel,
} from "./query-helpers.js";
export type { OptimisticTarget } from "./optimistic.js";

export { useResourceMutation } from "./use-resource-mutation.js";
export type {
  UseResourceMutationOptions,
  MutationsConfig,
  MutationInvalidation,
  OperationMutationOptions,
  ClientMutationOptions,
  ResourceMutationResult,
  ResourceMutationOperations,
  ResourceMutationStates,
  MutationOperation,
  MutationStateKey,
  OptimisticOptions,
} from "./mutation-types.js";
export type { OperationArgs, OperationData } from "./mutation-controller.js";

export { useResource } from "./use-resource.js";
export type {
  UseResourceOptions,
  ResourceResult,
  ResourceInfiniteResult,
  ResourceOperations,
} from "./use-resource.js";

export type {
  AnyOperationName,
  CallableOperationName,
  OptionalOperationName,
  OperationKinds,
  InheritedReadName,
  InheritedWriteName,
  InheritedReads,
  OperationCall,
  OperationParameters,
  OperationReturn,
  ReadOperationName,
  QueryOperationName,
  ResourceLike,
  ResourceKeyFactory,
  InferListData,
  InferEntity,
  InferCreateBody,
  InferUpdateBody,
  InferUpdateId,
  InferDeleteId,
  InferGetByIdArg,
  InferListQuery,
  UpdateVariables,
} from "./types.js";

export { QueryClient } from "./query-client.js";
export type { QueryClientConfig } from "./query-client.js";
export { ApixaProvider } from "./provider.js";
export type { ApixaProviderProps } from "./provider.js";
export { ApixaHydrationBoundary } from "./hydration-boundary.js";
export type { ApixaHydrationBoundaryProps } from "./hydration-boundary.js";
export type { DehydratedState, DehydrateOptions } from "./hydration.js";
