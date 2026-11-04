"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type InvalidateQueryFilters,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { createResourceController, type ResourceController } from "./controller.js";
import type {
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

export type UseResourceQueryOptions<TResource extends ResourceLike> = {
  /** Required root key segment(s). */
  queryKey: QueryKey;
  /** Optional tenant/env prefix prepended to every key. */
  scope?: QueryKey;
  /** List `getAll` query params — included in the list query key. */
  query?: InferListQuery<TResource>;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean | "always";
  /** Per-operation mutation option overrides (composed after Apixa cache sync). */
  mutations?: {
    create?: Pick<
      UseMutationOptions<InferEntity<TResource>, Error, InferCreateBody<TResource>>,
      "onSuccess" | "onError" | "onSettled" | "onMutate" | "retry" | "meta"
    >;
    update?: Pick<
      UseMutationOptions<InferEntity<TResource>, Error, UpdateVariables<TResource>>,
      "onSuccess" | "onError" | "onSettled" | "onMutate" | "retry" | "meta"
    >;
    delete?: Pick<
      UseMutationOptions<void, Error, InferDeleteId<TResource>>,
      "onSuccess" | "onError" | "onSettled" | "onMutate" | "retry" | "meta"
    >;
  };
};

export type ResourceQueryResult<TResource extends ResourceLike> = {
  data: InferListData<TResource> | undefined;
  error: Error | null;
  isPending: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  status: UseQueryResult<InferListData<TResource>, Error>["status"];
  query: UseQueryResult<InferListData<TResource>, Error>;
  invalidate: (filters?: InvalidateQueryFilters) => Promise<void>;
  refetch: () => Promise<UseQueryResult<InferListData<TResource>, Error>>;
  keys: ResourceKeyFactory;
  mutations: (TResource extends { create: NonNullable<ResourceLike["create"]> }
    ? { create: UseMutationResult<InferEntity<TResource>, Error, InferCreateBody<TResource>> }
    : {}) &
    (TResource extends { update: NonNullable<ResourceLike["update"]> }
      ? { update: UseMutationResult<InferEntity<TResource>, Error, UpdateVariables<TResource>> }
      : {}) &
    (TResource extends { delete: NonNullable<ResourceLike["delete"]> }
      ? { delete: UseMutationResult<void, Error, InferDeleteId<TResource>> }
      : {});
  /** @advanced shared controller (keys / options factories). */
  controller: ResourceController<TResource>;
} & (TResource extends { getById: NonNullable<ResourceLike["getById"]> }
  ? { getById: (id: InferGetByIdArg<TResource>) => Promise<InferEntity<TResource>> }
  : {}) &
  (TResource extends { create: NonNullable<ResourceLike["create"]> }
    ? { create: (input: InferCreateBody<TResource>) => Promise<InferEntity<TResource>> }
    : {}) &
  (TResource extends { update: NonNullable<ResourceLike["update"]> }
    ? {
        update: (
          id: InferUpdateId<TResource>,
          body: InferUpdateBody<TResource>,
        ) => Promise<InferEntity<TResource>>;
      }
    : {}) &
  (TResource extends { delete: NonNullable<ResourceLike["delete"]> }
    ? { delete: (id: InferDeleteId<TResource>) => Promise<void> }
    : {});

/**
 * Unified Apixa × TanStack Query resource hook.
 *
 * Mounts one list `useQuery` and three `useMutation` observers unconditionally.
 * List fields (`data`, `isPending`, …) never include mutation pending state.
 */
export function useResourceQuery<TResource extends ResourceLike>(
  resource: TResource,
  options: UseResourceQueryOptions<TResource>,
): ResourceQueryResult<TResource> {
  const queryClient = useQueryClient();

  const queryKeySerialized = JSON.stringify(options.queryKey);
  const scopeSerialized = JSON.stringify(options.scope ?? null);
  const listQuerySerialized = JSON.stringify(options.query ?? null);

  const controller = useMemo(
    () =>
      createResourceController(resource, {
        queryKey: options.queryKey,
        scope: options.scope,
        query: options.query,
      }),
    // Serialize key segments so inline `["users"]` does not thrash the controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resource is a stable client
    [resource, queryKeySerialized, scopeSerialized, listQuerySerialized],
  );

  const listQuery = useQuery(
    controller.listOptions({
      enabled: options.enabled,
      staleTime: options.staleTime,
      gcTime: options.gcTime,
      refetchOnWindowFocus: options.refetchOnWindowFocus,
    }),
  );

  const createMutation = useMutation(controller.createOptions(options.mutations?.create));
  const updateMutation = useMutation(controller.updateOptions(options.mutations?.update));
  const deleteMutation = useMutation(controller.deleteOptions(options.mutations?.delete));

  const getById = useCallback(
    (id: InferGetByIdArg<TResource>) => controller.fetchDetail(queryClient, id),
    [controller, queryClient],
  );

  const createAsync = createMutation.mutateAsync;
  const updateAsync = updateMutation.mutateAsync;
  const deleteAsync = deleteMutation.mutateAsync;

  const create = useCallback(
    (input: InferCreateBody<TResource>) => createAsync(input),
    [createAsync],
  );

  const update = useCallback(
    (id: InferUpdateId<TResource>, body: InferUpdateBody<TResource>) => updateAsync({ id, body }),
    [updateAsync],
  );

  const remove = useCallback((id: InferDeleteId<TResource>) => deleteAsync(id), [deleteAsync]);

  const invalidate = useCallback(
    (filters?: InvalidateQueryFilters) => controller.invalidate(queryClient, filters),
    [controller, queryClient],
  );

  const refetch = useCallback(() => listQuery.refetch(), [listQuery]);

  return {
    data: listQuery.data,
    error: listQuery.error,
    isPending: listQuery.isPending,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    isSuccess: listQuery.isSuccess,
    status: listQuery.status,
    query: listQuery,
    ...(resource.getById ? { getById } : {}),
    ...(resource.create ? { create } : {}),
    ...(resource.update ? { update } : {}),
    ...(resource.delete ? { delete: remove } : {}),
    invalidate,
    refetch,
    keys: controller.keys,
    mutations: {
      ...(resource.create ? { create: createMutation } : {}),
      ...(resource.update ? { update: updateMutation } : {}),
      ...(resource.delete ? { delete: deleteMutation } : {}),
    },
    controller,
  } as ResourceQueryResult<TResource>;
}
