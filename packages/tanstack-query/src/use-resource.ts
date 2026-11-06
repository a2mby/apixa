"use client";

import type {
  DefinedUseQueryResult,
  InfiniteData,
  QueryKey,
  UseInfiniteQueryResult,
  UseQueryResult,
} from "@tanstack/react-query";
import type {
  ExplicitResourceQueryOptions,
  ResourceInfiniteQueryOptions,
} from "./query-options.js";
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
  type ReadHelpers,
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
  TRaw = Observed extends true ? DefaultData<R> : never,
> = (Observed extends true
  ? (Defined extends true
      ? DefinedUseQueryResult<Selected, Error>
      : UseQueryResult<Selected, Error>) & {
      query: Defined extends true
        ? DefinedUseQueryResult<Selected, Error>
        : UseQueryResult<Selected, Error>;
    }
  : {}) &
  FacadeTail<R, M, TRaw>;

/** Helpers, the guaranteed namespaces, and flat operations (shared by every facade mode). */
type FacadeTail<R extends object, M, TRaw> = Omit<ReadHelpers<R, TRaw>, "operations"> & {
  /** Guaranteed namespace: every inherited and client-only operation, collisions included. */
  operations: ResourceOperations<R, M>;
  /** Native mutation state per write / client-only operation (latest invocation). */
  states: WriteStates<R, M>;
} & Omit<ResourceOperations<R, M>, FacadeKey>;

/** `useResource` with `query: { infinite }`: native infinite state plus the same facade. */
export type ResourceInfiniteResult<
  R extends object,
  N extends keyof R,
  TPageParam,
  Selected = InfiniteData<OperationReturn<R, N>, TPageParam>,
  M = {},
> = UseInfiniteQueryResult<Selected, Error> & {
  query: UseInfiniteQueryResult<Selected, Error>;
} & FacadeTail<R, M, InfiniteData<OperationReturn<R, N>, TPageParam>>;

/**
 * Thin facade over `useResourceQuery` + `useResourceMutation` sharing one resource identity.
 * Flat query state (`users.data`), flat operations (`users.create(body)`, `users.getById(id)`),
 * `users.operations.*` for every operation, and `users.states.*` for mutation state.
 */
export function useResource<
  R extends object,
  const N extends QueryOperationName<R> = Extract<"getAll", QueryOperationName<R>>,
  TPageParam = unknown,
  Selected = InfiniteData<OperationReturn<R, N>, TPageParam>,
  M extends object = {},
>(
  resource: R,
  options: Omit<UseResourceOptions<R, never, M>, "query"> & {
    query: WithoutShared<ResourceInfiniteQueryOptions<R, N, TPageParam, Selected>>;
  },
): ResourceInfiniteResult<R, N, TPageParam, Selected, M>;
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
): ResourceResult<R, Selected, M, true, true, OperationReturn<R, N>>;
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
): ResourceResult<R, Selected, M, true, false, OperationReturn<R, N>>;
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
  "prefetch",
  "cache",
  "cancel",
]);

type RuntimeResourceOptions = {
  queryKey: QueryKey;
  scope?: QueryKey;
  query?: Omit<RuntimeOptions, Shared>;
  mutations?: RuntimeResourceMutationOptions["mutations"];
};
