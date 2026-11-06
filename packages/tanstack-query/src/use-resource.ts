"use client";

import type { DefinedUseQueryResult, QueryKey, UseQueryResult } from "@tanstack/react-query";
import type { ExplicitResourceQueryOptions } from "./query-options.js";
import { composeResult } from "./compose.js";
import type {
  ResourceMutationOperations,
  UseResourceMutationOptions,
  WriteStates,
} from "./mutation-types.js";
import {
  NATIVE_RESULT_KEYS,
  useResourceQuery,
  type ListResource,
  type OperationOnlyQueryOptions,
  type QueryResultKey,
  type ResourceOperationsQueryResult,
  type RuntimeOptions,
  type UseResourceQueryOptions,
} from "./use-resource-query.js";
import {
  useResourceMutation,
  type RuntimeResourceMutationOptions,
} from "./use-resource-mutation.js";
import type {
  AsyncFn,
  CallableOperationName,
  QueryOperationName,
  InheritedReadName,
  InheritedReads,
  OperationReturn,
  OptionalReadName,
  OptionalOperationName,
} from "./types.js";

type HasOptionalList<R> = "getAll" extends OptionalOperationName<R> ? true : false;
type HasList<R> = "getAll" extends CallableOperationName<R> ? true : false;
type DefaultData<R> = HasList<R> extends true ? OperationReturn<ListResource<R>, "getAll"> : never;
type Shared = "queryKey" | "scope";
type WithoutShared<T> = T extends unknown ? Omit<T, Shared> : never;
type DefinedData<T> = { initialData: T | (() => T) };

export type UseResourceOptions<R, Selected = DefaultData<R>, M = {}> = {
  /** Resource identity shared by the query and every mutation. */
  queryKey: QueryKey;
  /** Apixa key prefix, shared (TanStack's mutation `scope` stays per operation). */
  scope?: QueryKey;
  /** Exactly `useResourceQuery`'s options, minus the shared identity. */
  query?: HasList<R> extends true
    ? WithoutShared<UseResourceQueryOptions<R, Selected>>
    : HasOptionalList<R> extends true
      ? WithoutShared<UseResourceQueryOptions<R, Selected>>
      : Omit<OperationOnlyQueryOptions, Shared>;
  /** Per-write native mutation options and client-only mutation functions. */
  mutations?: UseResourceMutationOptions<R, M>["mutations"];
};

/** Reads run through the QueryClient cache; writes and client-only operations through mutations. */
export type ResourceOperations<R, M = {}> = InheritedReads<R> &
  Omit<ResourceMutationOperations<R, M>, InheritedReadName<R> | OptionalReadName<R>>;

type FacadeKey = QueryResultKey | "states";

export type ResourceResult<
  R extends object,
  Selected = DefaultData<R>,
  M = {},
  Observed extends boolean = HasList<R>,
  Defined extends boolean = false,
> = (Observed extends true
  ? (Defined extends true
      ? DefinedUseQueryResult<Selected, Error>
      : UseQueryResult<Selected, Error>) & {
      query: Defined extends true
        ? DefinedUseQueryResult<Selected, Error>
        : UseQueryResult<Selected, Error>;
    }
  : {}) &
  Omit<ResourceOperationsQueryResult<R>, "operations" | keyof InheritedReads<R>> & {
    /** Guaranteed namespace: every inherited and client-only operation, collisions included. */
    operations: ResourceOperations<R, M>;
    /** Native mutation state per write / client-only operation (latest invocation). */
    states: WriteStates<R, M>;
  } & Omit<ResourceOperations<R, M>, FacadeKey>;

/**
 * Thin facade over `useResourceQuery` + `useResourceMutation` sharing one resource identity.
 * Flat query state (`users.data`), flat operations (`users.create(body)`, `users.getById(id)`),
 * `users.operations.*` for every operation, and `users.states.*` for mutation state.
 */
export function useResource<
  R extends object,
  const N extends QueryOperationName<R>,
  Selected = OperationReturn<R, N>,
  M extends object = {},
>(
  resource: R,
  options: Omit<UseResourceOptions<R, Selected, M>, "query"> & {
    query: WithoutShared<ExplicitResourceQueryOptions<R, NoInfer<N>, Selected>> & {
      operation: N;
    } & DefinedData<OperationReturn<R, N>>;
  },
): ResourceResult<R, Selected, M, true, true>;
export function useResource<
  R extends object,
  const N extends QueryOperationName<R>,
  Selected = OperationReturn<R, N>,
  M extends object = {},
>(
  resource: R,
  options: Omit<UseResourceOptions<R, Selected, M>, "query"> & {
    query: WithoutShared<ExplicitResourceQueryOptions<R, NoInfer<N>, Selected>> & { operation: N };
  },
): ResourceResult<R, Selected, M, true>;
export function useResource<
  R extends { getAll: AsyncFn },
  Selected = DefaultData<R>,
  M extends object = {},
>(
  resource: R,
  options: Omit<UseResourceOptions<R, Selected, M>, "query"> & {
    query: WithoutShared<UseResourceQueryOptions<R, Selected>> &
      DefinedData<OperationReturn<ListResource<R>, "getAll">>;
  },
): ResourceResult<R, Selected, M, true, true>;
export function useResource<R extends object, Selected = DefaultData<R>, M extends object = {}>(
  resource: R,
  options: UseResourceOptions<R, Selected, M> &
    (HasList<R> extends true
      ? {} extends WithoutShared<UseResourceQueryOptions<R, Selected>>
        ? {}
        : { query: WithoutShared<UseResourceQueryOptions<R, Selected>> }
      : HasOptionalList<R> extends true
        ? {} extends WithoutShared<UseResourceQueryOptions<R, Selected>>
          ? {}
          : { query: WithoutShared<UseResourceQueryOptions<R, Selected>> }
        : {}),
): ResourceResult<R, Selected, M>;
export function useResource(resource: object, options: RuntimeResourceOptions): unknown {
  const { queryKey, scope } = options;
  const query = (
    useResourceQuery as (resource: object, options: RuntimeOptions) => Record<string, unknown>
  )(resource, { ...options.query, queryKey, scope });
  const mutation = (
    useResourceMutation as (
      resource: object,
      options: RuntimeResourceMutationOptions,
    ) => Record<string, unknown>
  )(resource, { mutations: options.mutations, queryKey, scope });
  const operations = {
    ...(mutation.operations as Record<string, unknown>),
    ...(query.operations as Record<string, unknown>),
  };
  const flat: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(operations)) {
    if (!NATIVE_RESULT_KEYS.has(name) && !FACADE_KEYS.has(name)) flat[name] = fn;
  }
  return composeResult(query, {
    ...flat,
    operations: Object.freeze(operations),
    states: mutation.states,
  });
}

const FACADE_KEYS = new Set([
  "query",
  "keys",
  "controller",
  "invalidate",
  "invalidateLists",
  "invalidateDetail",
  "operations",
  "states",
]);

type RuntimeResourceOptions = {
  queryKey: QueryKey;
  scope?: QueryKey;
  query?: Omit<RuntimeOptions, Shared>;
  mutations?: RuntimeResourceMutationOptions["mutations"];
};
