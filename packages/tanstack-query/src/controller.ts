import {
  mutationOptions,
  queryOptions,
  type InvalidateQueryFilters,
  type MutationFunctionContext,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { syncCacheAfterCreate, syncCacheAfterDelete, syncCacheAfterUpdate } from "./cache.js";
import { createResourceKeys } from "./keys.js";
import type {
  CreateResourceControllerConfig,
  InferCreateBody,
  InferDeleteId,
  InferEntity,
  InferGetByIdArg,
  InferListData,
  InferListQuery,
  InferUpdateBody,
  InferUpdateId,
  ResourceKeyFactory,
  ResourceLike,
  UpdateVariables,
} from "./types.js";

type ConsumerMutationHandlers<TData, TVariables> = {
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
  onMutate?: (
    variables: TVariables,
    context: MutationFunctionContext,
  ) => unknown | Promise<unknown>;
};

type ListOverrides<TResource extends ResourceLike> = {
  query?: InferListQuery<TResource>;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean | "always";
  [key: string]: unknown;
};

export type ResourceController<TResource extends ResourceLike> = {
  keys: ResourceKeyFactory;
  listQueryParams: InferListQuery<TResource> | undefined;
  listOptions: (
    overrides?: ListOverrides<TResource>,
  ) => ReturnType<typeof queryOptions<InferListData<TResource>, Error>>;
  detailOptions: (
    id: InferGetByIdArg<TResource>,
    overrides?: { enabled?: boolean; [key: string]: unknown },
  ) => ReturnType<typeof queryOptions<InferEntity<TResource>, Error>>;
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
  invalidate: (client: QueryClient, filters?: InvalidateQueryFilters) => Promise<void>;
  fetchDetail: (
    client: QueryClient,
    id: InferGetByIdArg<TResource>,
  ) => Promise<InferEntity<TResource>>;
};

/**
 * Pure controller: keys + TanStack `queryOptions` / `mutationOptions`.
 * Used by `useResourceQuery` and advanced escape hatches.
 */
export function createResourceController<TResource extends ResourceLike>(
  resource: TResource,
  config: CreateResourceControllerConfig,
): ResourceController<TResource> {
  const keys = createResourceKeys({
    queryKey: config.queryKey,
    scope: config.scope,
  });
  const defaultListQuery = config.query as InferListQuery<TResource> | undefined;

  function listOptions(overrides: ListOverrides<TResource> = {}) {
    const {
      query: queryOverride,
      enabled,
      staleTime,
      gcTime,
      refetchOnWindowFocus,
      ...rest
    } = overrides;
    const listQuery = (queryOverride as InferListQuery<TResource> | undefined) ?? defaultListQuery;

    return queryOptions({
      queryKey: keys.list(listQuery),
      queryFn: ({ signal }) => {
        const callOptions = listQuery === undefined ? { signal } : { query: listQuery, signal };
        return resource.getAll(callOptions) as Promise<InferListData<TResource>>;
      },
      enabled,
      staleTime,
      gcTime,
      refetchOnWindowFocus,
      ...rest,
    });
  }

  function detailOptions(
    id: InferGetByIdArg<TResource>,
    overrides: { enabled?: boolean; [key: string]: unknown } = {},
  ) {
    const { enabled, ...rest } = overrides;
    return queryOptions({
      queryKey: keys.detail(id),
      queryFn: ({ signal }) => {
        if (!resource.getById) throw new Error("Resource has no getById operation.");
        return resource.getById(id, { signal }) as Promise<InferEntity<TResource>>;
      },
      enabled: enabled ?? (id !== undefined && id !== null && id !== ""),
      ...rest,
    });
  }

  const createOptions: ResourceController<TResource>["createOptions"] = (handlers) =>
    mutationOptions({
      mutationKey: keys.mutation("create"),
      mutationFn: (body: InferCreateBody<TResource>) => {
        if (!resource.create) throw new Error("Resource has no create operation.");
        return resource.create(body) as Promise<InferEntity<TResource>>;
      },
      onMutate: handlers?.onMutate,
      onSuccess: async (data, variables, onMutateResult, context) => {
        // D1 — Apixa cache sync first, then consumer
        await syncCacheAfterCreate(context.client, keys, data);
        await handlers?.onSuccess?.(data, variables, onMutateResult, context);
      },
      onError: handlers?.onError,
      onSettled: handlers?.onSettled,
    });

  const updateOptions: ResourceController<TResource>["updateOptions"] = (handlers) =>
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

  const deleteOptions: ResourceController<TResource>["deleteOptions"] = (handlers) =>
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

  return {
    keys,
    listQueryParams: defaultListQuery,
    listOptions,
    detailOptions,
    createOptions,
    updateOptions,
    deleteOptions,
    invalidate: (client, filters) => client.invalidateQueries({ queryKey: keys.all(), ...filters }),
    fetchDetail: (client, id) =>
      client.fetchQuery(detailOptions(id)) as Promise<InferEntity<TResource>>,
  } as ResourceController<TResource>;
}

export type { InferCreateBody, InferEntity, InferListData, InferUpdateBody, InferUpdateId };
