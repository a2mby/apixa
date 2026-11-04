"use client";

import {
  hashKey,
  skipToken,
  useQuery,
  useQueryClient,
  type DefinedUseQueryResult,
  type InvalidateQueryFilters,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
  type QueryObserverBaseResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { composeResult } from "./compose.js";
import { createResourceKeys } from "./keys.js";
import { describeOperations } from "./operations.js";
import {
  buildResourceQueryOptions,
  type DefaultResourceQueryOptions,
  type ExplicitResourceQueryOptions,
} from "./query-options.js";
import { createResourceQueryController, type ResourceQueryController } from "./query-controller.js";
import type {
  AsyncFn,
  CallableOperationName,
  InferGetByIdArg,
  InheritedReads,
  OperationReturn,
  QueryOperationName,
} from "./types.js";

/** `getAll` of a resource as a required method (optional `getAll` included). */
export type ListResource<R> = {
  getAll: Extract<NonNullable<R["getAll" & keyof R]>, AsyncFn>;
};

export type UseResourceQueryOptions<
  R,
  Selected = OperationReturn<ListResource<R>, "getAll">,
> = DefaultResourceQueryOptions<ListResource<R>, Selected>;

/**
 * Options for a resource without a guaranteed `getAll`: no default query state in the type,
 * inherited reads only. (A runtime-optional `getAll` that exists is still observed.)
 */
export type OperationOnlyQueryOptions = {
  queryKey: QueryKey;
  scope?: QueryKey;
  operation?: undefined;
};

/** Names a native query result owns; inherited reads with these names live only in `operations`. */
export type QueryResultKey =
  | keyof QueryObserverBaseResult
  | "promise"
  | "query"
  | "keys"
  | "controller"
  | "invalidate"
  | "invalidateLists"
  | "invalidateDetail"
  | "operations";

type ReadHelpers<R extends object> = {
  keys: ResourceQueryController<R>["keys"];
  controller: ResourceQueryController<R>;
  invalidate: (filters?: InvalidateQueryFilters) => Promise<void>;
  invalidateLists: (filters?: InvalidateQueryFilters) => Promise<void>;
  invalidateDetail: (
    id: R extends { getById: AsyncFn } ? InferGetByIdArg<R> : never,
    filters?: InvalidateQueryFilters,
  ) => Promise<void>;
  /** Every inherited read as an imperative, QueryClient-cached call (guaranteed namespace). */
  operations: InheritedReads<R>;
} & Omit<InheritedReads<R>, QueryResultKey>;

export type ResourceQueryResult<
  R extends object,
  N extends keyof R & string = Extract<"getAll", keyof R>,
  Selected = OperationReturn<R, N>,
  Defined extends boolean = false,
> = (Defined extends true
  ? DefinedUseQueryResult<Selected, Error>
  : UseQueryResult<Selected, Error>) &
  ReadHelpers<R> & {
    /** The complete native TanStack result (same object TanStack returned, still tracked). */
    query: Defined extends true
      ? DefinedUseQueryResult<Selected, Error>
      : UseQueryResult<Selected, Error>;
  };

/** Result for a resource without `getAll`: no default query state, only helpers and reads. */
export type ResourceOperationsQueryResult<R extends object> = ReadHelpers<R>;

type DefinedData<T> = { initialData: T | (() => T) };

/**
 * Native TanStack read observer with Apixa resource keys plus every inherited read operation.
 * Observes `getAll` (or the selected `operation`); other reads run only when called.
 */
export function useResourceQuery<R extends object>(
  resource: R,
  options: "getAll" extends CallableOperationName<R> ? never : OperationOnlyQueryOptions,
): ResourceOperationsQueryResult<R>;
export function useResourceQuery<
  R extends object,
  const N extends QueryOperationName<R>,
  Selected = OperationReturn<R, N>,
>(
  resource: R,
  options: { operation: N } & ExplicitResourceQueryOptions<R, NoInfer<N>, Selected> &
    DefinedData<OperationReturn<R, N>>,
): ResourceQueryResult<R, N, Selected, true>;
export function useResourceQuery<
  R extends object,
  const N extends QueryOperationName<R>,
  Selected = OperationReturn<R, N>,
>(
  resource: R,
  options: { operation: N } & ExplicitResourceQueryOptions<R, NoInfer<N>, Selected>,
): ResourceQueryResult<R, N, Selected>;
export function useResourceQuery<
  R extends { getAll: AsyncFn },
  Selected = OperationReturn<ListResource<R>, "getAll">,
>(
  resource: R,
  options: UseResourceQueryOptions<R, Selected> &
    DefinedData<OperationReturn<ListResource<R>, "getAll">>,
): ResourceQueryResult<R, "getAll" & keyof R, Selected, true>;
export function useResourceQuery<
  R extends { getAll: AsyncFn },
  Selected = OperationReturn<ListResource<R>, "getAll">,
>(
  resource: R,
  options: UseResourceQueryOptions<R, Selected>,
): ResourceQueryResult<R, "getAll" & keyof R, Selected>;
export function useResourceQuery(resource: object, options: RuntimeOptions): unknown {
  const state = useResourceQueryState(resource, options);
  return state.observed
    ? composeResult(state.native, { ...state.flat, ...state.helpers, query: state.native })
    : composeResult(undefined, { ...state.flat, ...state.helpers });
}

export type RuntimeOptions = {
  queryKey: QueryKey;
  scope?: QueryKey;
  query?: unknown;
  operation?: string;
  args?: readonly unknown[] | ((context: QueryFunctionContext) => readonly unknown[]);
  keyParts?: QueryKey;
  readOperations?: readonly string[];
  [native: string]: unknown;
};

/** @internal Shared by `useResourceQuery` and `useResource`: one observer, helpers, reads. */
export function useResourceQueryState(resource: object, options: RuntimeOptions) {
  const client = useQueryClient();
  const identityHash = hashKey([
    ...(options.scope ?? []),
    ...options.queryKey,
    options.query ?? null,
  ]);
  const controller = useMemo(
    () =>
      createResourceQueryController(resource, {
        queryKey: options.queryKey,
        scope: options.scope,
        query: options.query,
      }),
    // Hashing matches TanStack's default query-key behavior and keeps inline arrays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource, identityHash],
  );
  const observed =
    options.operation !== undefined ||
    typeof (resource as { getAll?: unknown }).getAll === "function";
  // Always exactly one useQuery call. Without a default read it observes an inert, skipped key.
  const native = useQuery(
    observed
      ? buildResourceQueryOptions(resource, options)
      : { queryKey: [...controller.keys.all(), "$apixa", "inert"], queryFn: skipToken },
  );
  const { helpers, flat } = useMemo(
    () => readSurface(resource, controller, client),
    [resource, controller, client],
  );
  return { native, helpers, flat, observed, controller, client };
}

const NATIVE_HELPER_KEYS = new Set<string>([
  "query",
  "keys",
  "controller",
  "invalidate",
  "invalidateLists",
  "invalidateDetail",
  "operations",
]);

function readSurface(
  resource: object,
  controller: ResourceQueryController<object>,
  client: QueryClient,
) {
  const operations: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [name, info] of describeOperations(resource)) {
    if (info.kind !== "read") continue;
    operations[name] = (...args: unknown[]) =>
      (
        controller.fetchOperation as (
          client: QueryClient,
          name: string,
          ...args: unknown[]
        ) => Promise<unknown>
      )(client, name, ...args);
  }
  const helpers = {
    keys: controller.keys,
    controller,
    invalidate: (filters?: InvalidateQueryFilters) => controller.invalidate(client, filters),
    invalidateLists: (filters?: InvalidateQueryFilters) =>
      controller.invalidateLists(client, filters),
    invalidateDetail: (id: unknown, filters?: InvalidateQueryFilters) =>
      (
        controller.invalidateDetail as (
          client: QueryClient,
          id: unknown,
          filters?: InvalidateQueryFilters,
        ) => Promise<void>
      )(client, id, filters),
    operations: Object.freeze(operations),
  };
  const flat: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(operations)) {
    if (!NATIVE_HELPER_KEYS.has(name) && !NATIVE_RESULT_KEYS.has(name)) flat[name] = fn;
  }
  return { helpers, flat };
}

/** Field names of TanStack's query result (kept in sync with `QueryObserverBaseResult`). */
const NATIVE_RESULT_KEY_LIST = [
  "data",
  "dataUpdatedAt",
  "error",
  "errorUpdatedAt",
  "failureCount",
  "failureReason",
  "errorUpdateCount",
  "isError",
  "isFetched",
  "isFetchedAfterMount",
  "isFetching",
  "isLoading",
  "isPending",
  "isLoadingError",
  "isInitialLoading",
  "isPaused",
  "isPlaceholderData",
  "isRefetchError",
  "isRefetching",
  "isStale",
  "isSuccess",
  "isEnabled",
  "refetch",
  "status",
  "fetchStatus",
  "promise",
] as const satisfies ReadonlyArray<keyof QueryObserverBaseResult | "promise">;
// Compile-time guard: a field added to TanStack's result must be added to the list above.
const _allNativeKeysListed: Exclude<
  keyof QueryObserverBaseResult,
  (typeof NATIVE_RESULT_KEY_LIST)[number]
> extends never
  ? true
  : false = true;
void _allNativeKeysListed;
export const NATIVE_RESULT_KEYS: ReadonlySet<string> = new Set(NATIVE_RESULT_KEY_LIST);
