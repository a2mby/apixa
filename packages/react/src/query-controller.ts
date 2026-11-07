import type {
  InvalidateQueryFilters,
  QueryClient,
  QueryFilters,
  QueryKey,
  Updater,
} from "@tanstack/react-query";
import { createResourceKeys } from "./keys.js";
import {
  buildResourceQueryOptions,
  type DefaultResourceQueryOptions,
  type ExplicitResourceQueryOptions,
  type GeneratedQueryOptions,
  type ResourceQueryNativeOptions,
} from "./query-options.js";
import type {
  AsyncFn,
  CreateResourceControllerConfig,
  InferGetByIdArg,
  InferListQuery,
  InheritedReadName,
  OperationParameters,
  OperationReturn,
  QueryOperationName,
  ResourceKeyFactory,
} from "./types.js";

export type ListOverrides<R extends { getAll: AsyncFn }> = Omit<
  DefaultResourceQueryOptions<R>,
  "queryKey" | "scope"
>;

/** React-free resource keys, query configurations, and QueryClient cache operations. */
export type ResourceQueryController<R extends object> = {
  keys: ResourceKeyFactory<R>;
  listQueryParams: R extends { getAll: AsyncFn } ? InferListQuery<R> | undefined : undefined;
  listOptions: R extends { getAll: AsyncFn }
    ? [] extends OperationParameters<R, "getAll">
      ? (overrides?: ListOverrides<R>) => GeneratedQueryOptions<OperationReturn<R, "getAll">>
      : (overrides: ListOverrides<R>) => GeneratedQueryOptions<OperationReturn<R, "getAll">>
    : never;
  detailOptions: R extends { getById: AsyncFn }
    ? (
        id: InferGetByIdArg<R>,
        overrides?: Omit<
          ResourceQueryNativeOptions<OperationReturn<R, "getById">>,
          "queryKey" | "scope"
        >,
      ) => GeneratedQueryOptions<OperationReturn<R, "getById">>
    : never;
  operationOptions: <const N extends QueryOperationName<R>, Selected = OperationReturn<R, N>>(
    options: { operation: N } & Omit<
      ExplicitResourceQueryOptions<R, NoInfer<N>, Selected>,
      "queryKey" | "scope"
    >,
  ) => GeneratedQueryOptions<OperationReturn<R, N>, Selected>;
  invalidate: (client: QueryClient, filters?: InvalidateQueryFilters) => Promise<void>;
  invalidateLists: (client: QueryClient, filters?: InvalidateQueryFilters) => Promise<void>;
  invalidateDetail: (
    client: QueryClient,
    id: R extends { getById: AsyncFn } ? InferGetByIdArg<R> : never,
    filters?: InvalidateQueryFilters,
  ) => Promise<void>;
  refetch: (client: QueryClient, filters?: QueryFilters) => Promise<void>;
  cancel: (client: QueryClient, filters?: QueryFilters) => Promise<void>;
  remove: (client: QueryClient, filters?: QueryFilters) => void;
  reset: (client: QueryClient, filters?: QueryFilters) => Promise<void>;
  getCached: {
    <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>): Data | undefined;
    <Data>(client: QueryClient, key: QueryKey): Data | undefined;
  };
  setCached: {
    <Data>(
      client: QueryClient,
      options: GeneratedQueryOptions<Data>,
      updater: Updater<Data | undefined, Data | undefined>,
    ): Data | undefined;
    <Data>(
      client: QueryClient,
      key: QueryKey,
      updater: Updater<Data | undefined, Data | undefined>,
    ): Data | undefined;
  };
  fetch: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) => Promise<Data>;
  prefetch: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) => Promise<void>;
  ensure: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) => Promise<Data>;
  fetchDetail: R extends { getById: AsyncFn }
    ? (client: QueryClient, id: InferGetByIdArg<R>) => Promise<OperationReturn<R, "getById">>
    : never;
  /** Imperative cached read of any inherited read operation (same key as the reactive query). */
  fetchOperation: <N extends InheritedReadName<R>>(
    client: QueryClient,
    operation: N,
    ...args: OperationParameters<R, N>
  ) => Promise<OperationReturn<R, N>>;
};

/** Create a controller once per resource identity. Its methods delegate cache work to QueryClient. */
export function createResourceQueryController<R extends object>(
  resource: R,
  config: CreateResourceControllerConfig,
  keys: ResourceKeyFactory = createResourceKeys(config),
): ResourceQueryController<R> {
  const root = { queryKey: config.queryKey, scope: config.scope };
  const listOptions = (overrides: Record<string, unknown> = {}) =>
    buildResourceQueryOptions(resource, {
      ...overrides,
      ...root,
      query: overrides.args === undefined ? config.query : undefined,
      ...(overrides.query === undefined ? {} : { query: overrides.query }),
    });
  const detailOptions = (id: unknown, overrides: Record<string, unknown> = {}) =>
    buildResourceQueryOptions(resource, {
      ...overrides,
      ...root,
      operation: "getById",
      args: [id],
    });
  const operationOptions = (options: Record<string, unknown>) =>
    buildResourceQueryOptions(resource, { ...options, ...root });
  const scoped = (filters?: QueryFilters) => ({ ...filters, queryKey: keys.all() });

  return {
    keys,
    listQueryParams: config.query,
    listOptions,
    detailOptions,
    operationOptions,
    invalidate: (client: QueryClient, filters?: InvalidateQueryFilters) =>
      client.invalidateQueries({ ...filters, queryKey: keys.all() }),
    invalidateLists: async (client: QueryClient, filters?: InvalidateQueryFilters) => {
      // Infinite lists are lists too (separate namespace, because their data is InfiniteData).
      await Promise.all([
        client.invalidateQueries({ ...filters, queryKey: keys.lists() }),
        client.invalidateQueries({ ...filters, queryKey: keys.infinites() }),
      ]);
    },
    invalidateDetail: (client: QueryClient, id: unknown, filters?: InvalidateQueryFilters) =>
      // Prefix match: also covers detail variants keyed with extra arguments.
      client.invalidateQueries({ ...filters, queryKey: keys.detail(id) }),
    refetch: (client: QueryClient, filters?: QueryFilters) =>
      client.refetchQueries(scoped(filters)),
    cancel: (client: QueryClient, filters?: QueryFilters) => client.cancelQueries(scoped(filters)),
    remove: (client: QueryClient, filters?: QueryFilters) => client.removeQueries(scoped(filters)),
    reset: (client: QueryClient, filters?: QueryFilters) => client.resetQueries(scoped(filters)),
    getCached: <Data>(client: QueryClient, target: QueryKey | GeneratedQueryOptions<Data>) =>
      client.getQueryData<Data>(
        Array.isArray(target) ? target : (target as GeneratedQueryOptions<Data>).queryKey,
      ),
    setCached: <Data>(
      client: QueryClient,
      target: QueryKey | GeneratedQueryOptions<Data>,
      updater: Updater<Data | undefined, Data | undefined>,
    ) =>
      client.setQueryData<Data>(
        Array.isArray(target) ? target : (target as GeneratedQueryOptions<Data>).queryKey,
        updater,
      ),
    fetch: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) =>
      client.fetchQuery(options),
    prefetch: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) =>
      client.prefetchQuery(options),
    ensure: <Data>(client: QueryClient, options: GeneratedQueryOptions<Data>) =>
      client.ensureQueryData(options),
    fetchDetail: (client: QueryClient, id: unknown) => client.fetchQuery(detailOptions(id)),
    fetchOperation: (client: QueryClient, operation: string, ...args: unknown[]) =>
      client.fetchQuery(buildResourceQueryOptions(resource, { ...root, operation, args })),
  } as unknown as ResourceQueryController<R>;
}
