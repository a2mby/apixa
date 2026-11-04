"use client";

import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { composeResult } from "./compose.js";
import type {
  ResourceMutationOperations,
  UseResourceMutationOptions,
  WriteStates,
} from "./mutation-types.js";
import {
  NATIVE_RESULT_KEYS,
  useResourceQueryState,
  type ListResource,
  type OperationOnlyQueryOptions,
  type QueryResultKey,
  type ResourceOperationsQueryResult,
  type RuntimeOptions,
  type UseResourceQueryOptions,
} from "./use-resource-query.js";
import {
  useResourceMutationState,
  type RuntimeResourceMutationOptions,
} from "./use-resource-mutation.js";
import type {
  CallableOperationName,
  InheritedReadName,
  InheritedReads,
  OperationReturn,
  OptionalReadName,
} from "./types.js";

type HasList<R> = "getAll" extends CallableOperationName<R> ? true : false;
type DefaultData<R> = HasList<R> extends true ? OperationReturn<ListResource<R>, "getAll"> : never;
type Shared = "queryKey" | "scope";

export type UseResourceOptions<R, Selected = DefaultData<R>, M = {}> = {
  /** Resource identity shared by the query and every mutation. */
  queryKey: QueryKey;
  /** Apixa key prefix, shared (TanStack's mutation `scope` stays per operation). */
  scope?: QueryKey;
  /** Exactly `useResourceQuery`'s options, minus the shared identity. */
  query?: HasList<R> extends true
    ? Omit<UseResourceQueryOptions<R, Selected>, Shared>
    : Omit<OperationOnlyQueryOptions, Shared>;
  /** Exactly `useResourceMutation`'s options, minus the shared identity. */
  mutation?: Omit<UseResourceMutationOptions<R, M>, Shared>;
};

/** Reads run through the QueryClient cache; writes and client-only operations through mutations. */
export type ResourceOperations<R, M = {}> = InheritedReads<R> &
  Omit<ResourceMutationOperations<R, M>, InheritedReadName<R> | OptionalReadName<R>>;

type FacadeKey = QueryResultKey | "states";

export type ResourceResult<
  R extends object,
  Selected = DefaultData<R>,
  M = {},
> = (HasList<R> extends true
  ? UseQueryResult<Selected, Error> & { query: UseQueryResult<Selected, Error> }
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
export function useResource<R extends object, Selected = DefaultData<R>, M extends object = {}>(
  resource: R,
  options: UseResourceOptions<R, Selected, M>,
): ResourceResult<R, Selected, M>;
export function useResource(resource: object, options: RuntimeResourceOptions): unknown {
  const { queryKey, scope } = options;
  const query = useResourceQueryState(resource, { ...options.query, queryKey, scope });
  const mutation = useResourceMutationState(
    resource,
    { ...options.mutation, queryKey, scope },
    // Reads route through the query layer; never through both engines.
    (name, store) => !store.isRead(name),
  );
  const operations = { ...mutation.operations, ...query.helpers.operations };
  const flat: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(operations)) {
    if (!NATIVE_RESULT_KEYS.has(name) && !FACADE_KEYS.has(name)) flat[name] = fn;
  }
  return composeResult(query.observed ? query.native : undefined, {
    ...flat,
    ...query.helpers,
    ...(query.observed ? { query: query.native } : {}),
    operations: Object.freeze(operations),
    states: mutation.states(),
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
  mutation?: Omit<RuntimeResourceMutationOptions, Shared>;
};
