export { useResourceQuery } from "./use-resource-query.js";
export type {
  UseResourceQueryOptions,
  OperationOnlyQueryOptions,
  ResourceQueryResult,
  ResourceOperationsQueryResult,
  ListResource,
} from "./use-resource-query.js";

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
} from "./mutation-types.js";
export type { OperationArgs, OperationData } from "./mutation-controller.js";

export { useResource } from "./use-resource.js";
export type { UseResourceOptions, ResourceResult, ResourceOperations } from "./use-resource.js";

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
