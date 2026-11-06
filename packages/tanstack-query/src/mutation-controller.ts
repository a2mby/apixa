import { mutationOptions, type MutationFunctionContext } from "@tanstack/react-query";
import { syncCacheAfterCreate, syncCacheAfterDelete, syncCacheAfterUpdate } from "./cache.js";
import { createResourceKeys } from "./keys.js";
import { describeOperations } from "./operations.js";
import type {
  AsyncFn,
  CreateResourceControllerConfig,
  InheritedWriteName,
  OperationParameters,
  OperationReturn,
  ResourceKeyFactory,
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
  if (describeOperations(resource).get(operationName)?.kind === "read") {
    throw new Error(
      `Operation ${operationName} is a read; use createResourceQueryOptions instead.`,
    );
  }
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
 * Conventional names exposed only when a write exists. Variables are the exact Core argument
 * tuple; callers can use `operationMutationOptions` for any other write name.
 */
type NamedOptions<R extends object, N extends keyof R> = (
  config?: OperationMutationConfig<OperationReturn<R, N>, OperationParameters<R, N>>,
) => ReturnType<typeof mutationOptions<OperationReturn<R, N>, Error, OperationParameters<R, N>>>;

export type ResourceMutationController<R extends object> = {
  keys: ResourceKeyFactory<R>;
} & ("create" extends InheritedWriteName<R>
  ? { createOptions: NamedOptions<R, "create" & keyof R> }
  : {}) &
  ("update" extends InheritedWriteName<R>
    ? { updateOptions: NamedOptions<R, "update" & keyof R> }
    : {}) &
  ("delete" extends InheritedWriteName<R>
    ? { deleteOptions: NamedOptions<R, "delete" & keyof R> }
    : {});

/** Hook-free mutation options for enabled conventional writes, including write-only resources. */
export function createResourceMutationController<R extends object>(
  resource: R,
  config: CreateResourceControllerConfig,
  keys: ResourceKeyFactory = createResourceKeys(config),
): ResourceMutationController<R> {
  const result: Record<string, unknown> = { keys };
  const table = describeOperations(resource);
  for (const name of ["create", "update", "delete"] as const) {
    if (table.get(name)?.kind !== "write") continue;
    result[`${name}Options`] = (options: OperationMutationConfig<unknown, unknown[]> = {}) =>
      operationMutationOptions(resource as Record<string, AsyncFn>, name, keys, {
        ...options,
        invalidate: false,
        onSuccess: async (data, args, onMutateResult, context) => {
          if (options.invalidate !== false) {
            if (name === "create") await syncCacheAfterCreate(context.client, keys, data);
            if (name === "update")
              await syncCacheAfterUpdate(context.client, keys, data, { id: args[0] });
            if (name === "delete") await syncCacheAfterDelete(context.client, keys, args[0]);
          }
          await options.onSuccess?.(data, args, onMutateResult, context);
        },
      });
  }
  return result as ResourceMutationController<R>;
}
