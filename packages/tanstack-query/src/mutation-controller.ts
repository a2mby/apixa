import { mutationOptions, type MutationFunctionContext } from "@tanstack/react-query";
import { syncCacheAfterCreate, syncCacheAfterDelete, syncCacheAfterUpdate } from "./cache.js";
import { createResourceKeys } from "./keys.js";
import type {
  AsyncFn,
  CreateResourceControllerConfig,
  InferCreateBody,
  InferDeleteId,
  InferEntity,
  ResourceKeyFactory,
  ResourceLike,
  UpdateVariables,
} from "./types.js";

/** Consumer lifecycle callbacks, run after Apixa's own cache work on success. */
export type ConsumerMutationHandlers<TData, TVariables> = {
  onMutate?: (
    variables: TVariables,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onError?: (
    error: Error,
    variables: TVariables,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
};

/** Data / tuple-args of a named resource operation. */
export type OperationData<
  TResource extends Record<string, AsyncFn>,
  TName extends keyof TResource,
> = Awaited<ReturnType<TResource[TName]>>;
export type OperationArgs<
  TResource extends Record<string, AsyncFn>,
  TName extends keyof TResource,
> = Parameters<TResource[TName]>;

export type OperationMutationConfig<TData, TArgs> = ConsumerMutationHandlers<TData, TArgs> & {
  /** Invalidate every query under the resource root on success. Default `true`. */
  invalidate?: boolean;
  retry?: boolean | number;
  meta?: Record<string, unknown>;
};

/**
 * `mutationOptions` for any named operation, called with tuple args: `mutate([id, body])`.
 * On success: `await invalidate(keys.all())` (unless `invalidate: false`), then consumer `onSuccess`.
 */
export function operationMutationOptions<
  TResource extends Record<string, AsyncFn>,
  TName extends keyof TResource & string,
>(
  resource: TResource,
  operationName: TName,
  keys: ResourceKeyFactory,
  config: OperationMutationConfig<
    OperationData<TResource, TName>,
    OperationArgs<TResource, TName>
  > = {},
) {
  type TData = OperationData<TResource, TName>;
  type TArgs = OperationArgs<TResource, TName>;
  return mutationOptions<TData, Error, TArgs>({
    mutationKey: keys.mutation(operationName),
    mutationFn: (args: TArgs) => {
      const run = resource[operationName];
      if (typeof run !== "function") {
        throw new Error(`Resource has no ${operationName} operation.`);
      }
      return run(...args) as Promise<TData>;
    },
    onMutate: config.onMutate,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (config.invalidate !== false) {
        await context.client.invalidateQueries({ queryKey: keys.all() });
      }
      await config.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: config.onError,
    onSettled: config.onSettled,
    retry: config.retry,
    meta: config.meta,
  });
}

/**
 * Advanced: create/update/delete `mutationOptions` with per-op cache sync
 * (detail seed/removal + list invalidation), then consumer `onSuccess`.
 */
export type ResourceMutationController<TResource extends ResourceLike> = {
  keys: ResourceKeyFactory;
  createOptions: (
    handlers?: ConsumerMutationHandlers<InferEntity<TResource>, InferCreateBody<TResource>>,
  ) => ReturnType<
    typeof mutationOptions<InferEntity<TResource>, Error, InferCreateBody<TResource>>
  >;
  updateOptions: (
    handlers?: ConsumerMutationHandlers<InferEntity<TResource>, UpdateVariables<TResource>>,
  ) => ReturnType<
    typeof mutationOptions<InferEntity<TResource>, Error, UpdateVariables<TResource>>
  >;
  deleteOptions: (
    handlers?: ConsumerMutationHandlers<void, InferDeleteId<TResource>>,
  ) => ReturnType<typeof mutationOptions<void, Error, InferDeleteId<TResource>>>;
};

/** Pure (React-free) mutation controller for the conventional write operations. */
export function createResourceMutationController<TResource extends ResourceLike>(
  resource: TResource,
  config: CreateResourceControllerConfig,
  keys: ResourceKeyFactory = createResourceKeys(config),
): ResourceMutationController<TResource> {
  const createOptions: ResourceMutationController<TResource>["createOptions"] = (handlers) =>
    mutationOptions({
      mutationKey: keys.mutation("create"),
      mutationFn: (body: InferCreateBody<TResource>) => {
        if (!resource.create) throw new Error("Resource has no create operation.");
        return resource.create(body) as Promise<InferEntity<TResource>>;
      },
      onMutate: handlers?.onMutate,
      onSuccess: async (data, variables, onMutateResult, context) => {
        // Apixa cache sync first, then consumer
        await syncCacheAfterCreate(context.client, keys, data);
        await handlers?.onSuccess?.(data, variables, onMutateResult, context);
      },
      onError: handlers?.onError,
      onSettled: handlers?.onSettled,
    });

  const updateOptions: ResourceMutationController<TResource>["updateOptions"] = (handlers) =>
    mutationOptions({
      mutationKey: keys.mutation("update"),
      mutationFn: ({ id, body }: UpdateVariables<TResource>) => {
        if (!resource.update) throw new Error("Resource has no update operation.");
        return resource.update(id, body) as Promise<InferEntity<TResource>>;
      },
      onMutate: handlers?.onMutate,
      onSuccess: async (data, variables, onMutateResult, context) => {
        await syncCacheAfterUpdate(context.client, keys, data, variables);
        await handlers?.onSuccess?.(data, variables, onMutateResult, context);
      },
      onError: handlers?.onError,
      onSettled: handlers?.onSettled,
    });

  const deleteOptions: ResourceMutationController<TResource>["deleteOptions"] = (handlers) =>
    mutationOptions({
      mutationKey: keys.mutation("delete"),
      mutationFn: (id: InferDeleteId<TResource>) => {
        if (!resource.delete) throw new Error("Resource has no delete operation.");
        return resource.delete(id) as Promise<void>;
      },
      onMutate: handlers?.onMutate,
      onSuccess: async (_data, id, onMutateResult, context) => {
        await syncCacheAfterDelete(context.client, keys, id);
        await handlers?.onSuccess?.(undefined as void, id, onMutateResult, context);
      },
      onError: handlers?.onError,
      onSettled: handlers?.onSettled,
    });

  return { keys, createOptions, updateOptions, deleteOptions };
}
