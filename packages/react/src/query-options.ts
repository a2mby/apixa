import {
  infiniteQueryOptions,
  queryOptions,
  type GetNextPageParamFunction,
  type GetPreviousPageParamFunction,
  type InfiniteData,
  type QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { createResourceKeys } from "./keys.js";
import {
  assertNoFullResponse,
  describeOperations,
  isPlainObject,
  type OperationInfo,
} from "@apixa/internal-shared";
import type {
  AsyncFn,
  InferListQuery,
  OperationParameters,
  OperationReturn,
  QueryOperationName,
} from "./types.js";

type QueryArguments<R, N extends keyof R> = OperationParameters<R, N>;

export type ResourceQueryNativeOptions<TRaw, TSelected = TRaw> = Omit<
  UseQueryOptions<TRaw, Error, TSelected>,
  "queryKey" | "queryFn" | "queryKeyHashFn"
> & {
  /** Resource root. Apixa appends list/detail/operation identity to this key. */
  queryKey: QueryKey;
  /** Optional environment or tenant prefix. */
  scope?: QueryKey;
};

type Arguments<R, N extends keyof R> =
  QueryArguments<R, N> | ((context: QueryFunctionContext) => QueryArguments<R, N>);

type ArgumentSelection<R, N extends keyof R> =
  | {
      /** Exact Core argument tuple. All data-defining arguments become part of the cache key. */
      args: QueryArguments<R, N>;
      keyParts?: QueryKey;
    }
  | {
      /** Bind exact Core arguments, including a signal at the correct position. */
      args: (context: QueryFunctionContext) => QueryArguments<R, N>;
      /** Required because a function cannot be safely hashed as query identity. */
      keyParts: QueryKey;
    };

type OptionalArguments<R, N extends keyof R> =
  [] extends OperationParameters<R, N>
    ? { args?: QueryArguments<R, N>; keyParts?: QueryKey } | ArgumentSelection<R, N>
    : ArgumentSelection<R, N>;

export type DefaultResourceQueryOptions<
  R extends { getAll: AsyncFn },
  TSelected = OperationReturn<R, "getAll">,
> = ResourceQueryNativeOptions<OperationReturn<R, "getAll">, TSelected> &
  OptionalArguments<R, "getAll"> & {
    operation?: undefined;
    /** Compatibility shorthand for the ordinary `getAll({ query })` call. */
    query?: InferListQuery<R>;
  };

export type ExplicitResourceQueryOptions<
  R,
  N extends QueryOperationName<R>,
  TSelected = OperationReturn<R, N>,
> = ResourceQueryNativeOptions<OperationReturn<R, N>, TSelected> &
  OptionalArguments<R, N> & {
    operation: N;
    query?: N extends "getAll" ? InferListQuery<R & { getAll: AsyncFn }> : never;
  };

type DefinedData<T> = { initialData: T | (() => T) };
export type GeneratedQueryOptions<TRaw, TSelected = TRaw> = ReturnType<
  typeof queryOptions<TRaw, Error, TSelected>
> & { queryFn: QueryFunction<TRaw> };
export type GeneratedDefinedQueryOptions<TRaw, TSelected = TRaw> = GeneratedQueryOptions<
  TRaw,
  TSelected
> &
  DefinedData<TRaw>;

export function createResourceQueryOptions<
  R,
  const N extends QueryOperationName<R>,
  TSelected = OperationReturn<R, N>,
>(
  resource: R,
  options: { operation: N } & ExplicitResourceQueryOptions<R, NoInfer<N>, TSelected> &
    DefinedData<OperationReturn<R, N>>,
): GeneratedDefinedQueryOptions<OperationReturn<R, N>, TSelected>;
export function createResourceQueryOptions<
  R,
  const N extends QueryOperationName<R>,
  TSelected = OperationReturn<R, N>,
>(
  resource: R,
  options: { operation: N } & ExplicitResourceQueryOptions<R, NoInfer<N>, TSelected>,
): GeneratedQueryOptions<OperationReturn<R, N>, TSelected>;
export function createResourceQueryOptions<
  R extends { getAll: AsyncFn },
  TSelected = OperationReturn<R, "getAll">,
>(
  resource: R,
  options: DefaultResourceQueryOptions<R, TSelected> & DefinedData<OperationReturn<R, "getAll">>,
): GeneratedDefinedQueryOptions<OperationReturn<R, "getAll">, TSelected>;
export function createResourceQueryOptions<
  R extends { getAll: AsyncFn },
  TSelected = OperationReturn<R, "getAll">,
>(
  resource: R,
  options: DefaultResourceQueryOptions<R, TSelected>,
): GeneratedQueryOptions<OperationReturn<R, "getAll">, TSelected>;
export function createResourceQueryOptions(
  resource: object,
  options: RuntimeQueryOptions,
): GeneratedQueryOptions<unknown> {
  return buildResourceQueryOptions(resource, options);
}

/** Shared runtime engine; public callers use the typed createResourceQueryOptions overloads. */
export function buildResourceQueryOptions(
  resource: object,
  options: RuntimeQueryOptions,
): GeneratedQueryOptions<unknown> {
  if (Object.prototype.hasOwnProperty.call(options, "readOperations")) {
    throw new Error('readOperations was removed; declare kind: "read" on the Core operation.');
  }
  const {
    queryKey,
    scope,
    operation = "getAll",
    args,
    keyParts,
    query,
    ...nativeOptions
  } = options;
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    throw new Error("Resource query requires a non-empty queryKey.");
  }
  const run = (resource as Record<string, unknown>)[operation];
  if (typeof run !== "function") {
    throw new Error(`Resource has no ${operation} operation.`);
  }
  const info = describeOperations(resource).get(operation)!;
  if (info.kind !== "read") {
    throw new Error(`Operation ${operation} is not a read; declare kind: "read" in Core.`);
  }
  if (typeof args === "function" && keyParts === undefined) {
    throw new Error("Argument-builder queries require keyParts.");
  }
  if (query !== undefined && args !== undefined) {
    throw new Error("Use either query or args for getAll; combining them is ambiguous.");
  }
  const staticArgs = Array.isArray(args)
    ? args
    : query === undefined
      ? undefined
      : info.optionsIndex === null
        ? [{ query }]
        : withOptions([], info, { query });
  if (staticArgs) assertNoFullResponse(staticArgs, info);

  const keys = createResourceKeys({ queryKey, scope });
  const identity = keyParts ?? normalizeIdentity(staticArgs ?? [], info);
  let generatedKey: QueryKey;
  if (operation === "getAll") {
    const listQuery = query !== undefined ? query : listQueryOf(identity, info);
    generatedKey =
      keyParts !== undefined
        ? keys.list(keyParts)
        : identity.length === 0
          ? keys.list()
          : listQuery !== undefined
            ? keys.list(listQuery)
            : keys.list(identity);
  } else if (operation === "getById") {
    generatedKey = [...keys.detail(identity[0]), ...identity.slice(1)];
  } else {
    generatedKey = keys.operation(operation, identity);
  }

  const missingDetailId =
    operation === "getById" && typeof args !== "function" && missingIdentifier(staticArgs?.[0]);
  const enabled = missingDetailId ? false : nativeOptions.enabled;

  return queryOptions({
    ...nativeOptions,
    enabled,
    queryKey: generatedKey,
    queryFn: (context) => {
      const callArgs = typeof args === "function" ? args(context) : (staticArgs ?? []);
      if (operation === "getById" && missingIdentifier(callArgs[0])) {
        throw new Error("getById requires a valid identifier.");
      }
      assertNoFullResponse(callArgs, info);
      const bound =
        typeof args === "function"
          ? callArgs
          : withOptions(callArgs, info, { signal: bindSignal(callArgs, info, context.signal) });
      return (run as (...values: unknown[]) => Promise<unknown>)(...bound);
    },
  }) as GeneratedQueryOptions<unknown>;
}

export type RuntimeQueryOptions = ResourceQueryNativeOptions<unknown> & {
  operation?: string;
  args?: readonly unknown[] | ((context: QueryFunctionContext) => readonly unknown[]);
  keyParts?: QueryKey;
  query?: unknown;
};

/** A signal that aborts when any of the given signals does (`AbortSignal.any` where available). */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([...signals]);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * TanStack's query signal, combined with a signal the caller put in the call options: aborting
 * either one cancels the request (a caller's signal must never be silently replaced).
 */
function bindSignal(
  values: readonly unknown[],
  info: OperationInfo,
  tanstack: AbortSignal,
): AbortSignal {
  const index = info.optionsIndex;
  const current = index === null ? undefined : values[index];
  const own = isPlainObject(current) ? current.signal : undefined;
  return own instanceof AbortSignal ? anySignal([own, tanstack]) : tanstack;
}

/**
 * Merge `extra` into Core's `RequestOptions` slot at its known position. Never touches functions
 * whose signature Core doesn't own (`optionsIndex: null`), nor a slot holding a non-object.
 */
export function withOptions(
  values: readonly unknown[],
  info: OperationInfo,
  extra: Record<string, unknown>,
): unknown[] {
  const index = info.optionsIndex;
  if (index === null) return [...values];
  const current = values[index];
  if (current !== undefined && !isPlainObject(current)) return [...values];
  const result = [...values];
  while (result.length < index) result.push(undefined);
  result[index] = { ...(current ?? {}), ...extra };
  return result;
}

const BINARY_KINDS: ReadonlyArray<[string, (value: unknown) => boolean]> = [
  ["Blob/File", (v) => typeof Blob !== "undefined" && v instanceof Blob],
  ["ArrayBuffer", (v) => v instanceof ArrayBuffer],
  ["FormData", (v) => typeof FormData !== "undefined" && v instanceof FormData],
  ["ReadableStream", (v) => typeof ReadableStream !== "undefined" && v instanceof ReadableStream],
];

/**
 * TanStack hashes a query key with `JSON.stringify`, which turns every `File`, `Blob`, `ArrayBuffer`,
 * `FormData` and stream into `{}`: two different files would share one cache entry and silently
 * return each other's data. Refuse them in a generated identity instead (bounded, cycle-safe walk).
 */
function assertNoBinaryIdentity(identity: readonly unknown[]): void {
  const seen = new Set<object>();
  const walk = (value: unknown, depth: number): string | undefined => {
    if (value === null || typeof value !== "object") return undefined;
    for (const [name, test] of BINARY_KINDS) if (test(value)) return name;
    if (depth > 16 || seen.has(value)) return undefined;
    seen.add(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = walk(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  const found = walk(identity, 0);
  if (found) {
    throw new Error(
      `A ${found} cannot be part of a query's identity: it would hash like {} and share one cache entry with every other value. ` +
        "Send files with a mutation, or give the query an explicit identity with `keyParts` (for example a content hash or an id).",
    );
  }
}

/**
 * Data-defining identity: exact arguments minus transport-only request controls, with an empty options
 * object and trailing `undefined`s dropped so equivalent calls share one cache entry.
 */
export function normalizeIdentity(values: readonly unknown[], info: OperationInfo): unknown[] {
  const result = [...values];
  const index = info.optionsIndex;
  if (index !== null && isPlainObject(result[index])) {
    if ((result[index] as Record<string, unknown>).presigned !== undefined)
      throw new Error("Presigned queries require explicit keyParts without signed URLs.");
    const {
      signal: _signal,
      timeout: _timeout,
      retry: _retry,
      idempotencyKey: _idempotencyKey,
      onTransfer: _onTransfer,
      transfer: _transfer,
      maxResponseSize: _maxResponseSize,
      ...rest
    } = result[index] as Record<string, unknown>;
    result[index] = Object.keys(rest).length === 0 ? undefined : rest;
  }
  while (result.length > 0 && result[result.length - 1] === undefined) result.pop();
  assertNoBinaryIdentity(result);
  return result;
}

/** `getAll({ query })` with nothing else keeps the compatible `[..., "list", query]` key. */
function listQueryOf(identity: readonly unknown[], info: OperationInfo): unknown {
  if (info.optionsIndex !== 0 || identity.length !== 1) return undefined;
  const options = identity[0];
  if (!isPlainObject(options)) return undefined;
  const keys = Object.keys(options);
  return keys.length === 1 && keys[0] === "query" ? options.query : undefined;
}

function missingIdentifier(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const parts = Object.values(value);
    return (
      parts.length === 0 || parts.some((part) => part === undefined || part === null || part === "")
    );
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Infinite queries
// ---------------------------------------------------------------------------------------------

/** List query bag of an operation (`getAll`'s `query`); other reads take it through `args`. */
type QueryBagOf<R, N extends keyof R> =
  OperationParameters<R, N> extends readonly [(infer O)?, ...unknown[]]
    ? NonNullable<O> extends { query?: infer Q }
      ? Q
      : never
    : never;

type PageArguments<R, N extends keyof R, TPageParam> =
  | {
      /** Query parameters for one page (merged into Core's `RequestOptions.query`). */
      query: (pageParam: TPageParam) => QueryBagOf<R, N>;
      args?: never;
    }
  | {
      /** Exact Core arguments for one page. Bind `context.signal` yourself if you need it. */
      args: (pageParam: TPageParam, context: QueryFunctionContext) => OperationParameters<R, N>;
      query?: never;
    }
  | ([] extends OperationParameters<R, N> ? { query?: never; args?: never } : never);

/** Paging config of an infinite resource query (native TanStack semantics). */
export type ResourceInfiniteConfig<R, N extends keyof R, TPageParam> = {
  initialPageParam: TPageParam;
  getNextPageParam: GetNextPageParamFunction<TPageParam, OperationReturn<R, N>>;
  getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, OperationReturn<R, N>>;
  /** Native `maxPages`: older pages are dropped from the cache entry. */
  maxPages?: number;
} & PageArguments<R, N, TPageParam>;

/** Native infinite options except the ones Apixa derives (key, function, paging). */
export type ResourceInfiniteNativeOptions<TPage, TPageParam, TSelected> = Omit<
  UseInfiniteQueryOptions<TPage, Error, TSelected, QueryKey, TPageParam>,
  | "queryKey"
  | "queryFn"
  | "queryKeyHashFn"
  | "initialPageParam"
  | "getNextPageParam"
  | "getPreviousPageParam"
  | "maxPages"
>;

export type ResourceInfiniteQueryOptions<
  R,
  N extends QueryOperationName<R>,
  TPageParam,
  TSelected = InfiniteData<OperationReturn<R, N>, TPageParam>,
> = ResourceInfiniteNativeOptions<OperationReturn<R, N>, TPageParam, TSelected> & {
  /** Resource root, shared with the other hooks. */
  queryKey: QueryKey;
  scope?: QueryKey;
  /** The read that loads one page. Default `getAll`. */
  operation?: N;
  /**
   * Extra cache identity for this infinite list (filters that change the results). The page
   * parameter is never part of the key.
   */
  keyParts?: QueryKey;
  infinite: ResourceInfiniteConfig<R, N, TPageParam>;
};

export type GeneratedInfiniteQueryOptions<TPage, TPageParam, TSelected> = ReturnType<
  typeof infiniteQueryOptions<TPage, Error, TSelected, QueryKey, TPageParam>
>;

/**
 * Hook-free native `infiniteQueryOptions` for a read: use with `useInfiniteQuery`,
 * `useSuspenseInfiniteQuery`, `queryClient.prefetchInfiniteQuery`, or `fetchInfiniteQuery`.
 */
export function createResourceInfiniteQueryOptions<
  R,
  const N extends QueryOperationName<R> = "getAll" & QueryOperationName<R>,
  TPageParam = unknown,
  TSelected = InfiniteData<OperationReturn<R, N>, TPageParam>,
>(
  resource: R,
  options: ResourceInfiniteQueryOptions<R, N, TPageParam, TSelected>,
): GeneratedInfiniteQueryOptions<OperationReturn<R, N>, TPageParam, TSelected> {
  return buildResourceInfiniteQueryOptions(
    resource as object,
    options as unknown as RuntimeInfiniteQueryOptions,
  ) as unknown as GeneratedInfiniteQueryOptions<OperationReturn<R, N>, TPageParam, TSelected>;
}

export type RuntimeInfiniteConfig = {
  initialPageParam: unknown;
  getNextPageParam: (...args: never[]) => unknown;
  getPreviousPageParam?: (...args: never[]) => unknown;
  maxPages?: number;
  query?: (pageParam: unknown) => unknown;
  args?: (pageParam: unknown, context: QueryFunctionContext) => readonly unknown[];
};

export type RuntimeInfiniteQueryOptions = Omit<ResourceQueryNativeOptions<unknown>, "enabled"> & {
  operation?: string;
  keyParts?: QueryKey;
  infinite: RuntimeInfiniteConfig;
  [native: string]: unknown;
};

/** Shared runtime engine for the infinite hook mode, prefetching, and the hook-free factory. */
export function buildResourceInfiniteQueryOptions(
  resource: object,
  options: RuntimeInfiniteQueryOptions,
): GeneratedInfiniteQueryOptions<unknown, unknown, unknown> {
  const { queryKey, scope, operation = "getAll", keyParts, infinite, ...nativeOptions } = options;
  for (const removed of ["args", "query"] as const) {
    if (Object.prototype.hasOwnProperty.call(options, removed)) {
      throw new Error(
        `Infinite queries take ${removed} inside infinite: { ${removed}: (pageParam) => … }.`,
      );
    }
  }
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    throw new Error("Resource query requires a non-empty queryKey.");
  }
  if (!infinite || typeof infinite !== "object") {
    throw new Error("Infinite resource query requires an infinite config.");
  }
  if (!Object.prototype.hasOwnProperty.call(infinite, "initialPageParam")) {
    throw new Error("infinite.initialPageParam is required (use null or 0 for the first page).");
  }
  if (typeof infinite.getNextPageParam !== "function") {
    throw new Error("infinite.getNextPageParam must be a function.");
  }
  if (infinite.query !== undefined && infinite.args !== undefined) {
    throw new Error("Use either infinite.query or infinite.args; combining them is ambiguous.");
  }
  const run = (resource as Record<string, unknown>)[operation];
  if (typeof run !== "function") throw new Error(`Resource has no ${operation} operation.`);
  const info = describeOperations(resource).get(operation)!;
  if (info.kind !== "read") {
    throw new Error(`Operation ${operation} is not a read; declare kind: "read" in Core.`);
  }
  if (infinite.query !== undefined && info.optionsIndex === null && operation !== "getAll") {
    throw new Error(
      `infinite.query needs Core's RequestOptions slot; ${operation} has a signature Core does not own — use infinite.args.`,
    );
  }
  const keys = createResourceKeys({ queryKey, scope });
  const { query: pageQuery, args: pageArgs, initialPageParam, maxPages } = infinite;

  return infiniteQueryOptions({
    ...nativeOptions,
    queryKey: keys.infinite(operation, keyParts ?? []),
    initialPageParam,
    getNextPageParam: infinite.getNextPageParam as GetNextPageParamFunction<unknown, unknown>,
    getPreviousPageParam: infinite.getPreviousPageParam as
      GetPreviousPageParamFunction<unknown, unknown> | undefined,
    ...(maxPages === undefined ? {} : { maxPages }),
    queryFn: (context: QueryFunctionContext<QueryKey, unknown>) => {
      const pageParam = context.pageParam;
      let callArgs: unknown[];
      if (pageArgs) {
        callArgs = [...pageArgs(pageParam, context)];
      } else {
        const query = pageQuery?.(pageParam);
        const extra: Record<string, unknown> = { signal: context.signal };
        if (query !== undefined) extra.query = query;
        callArgs =
          info.optionsIndex === null
            ? query === undefined
              ? []
              : [{ query }]
            : withOptions([], info, extra);
      }
      assertNoFullResponse(callArgs, info);
      return (run as (...values: unknown[]) => Promise<unknown>)(...callArgs);
    },
  } as never) as unknown as GeneratedInfiniteQueryOptions<unknown, unknown, unknown>;
}

/**
 * Server-safe prefetch (no React): `queryClient.prefetchQuery` with exactly the key and function
 * `useResourceQuery` uses for the same options. Use a request-scoped QueryClient on the server.
 */
export function prefetchResourceQuery<R, const N extends QueryOperationName<R>>(
  client: QueryClient,
  resource: R,
  options: { operation: N } & ExplicitResourceQueryOptions<R, NoInfer<N>>,
): Promise<void>;
export function prefetchResourceQuery<R extends { getAll: AsyncFn }>(
  client: QueryClient,
  resource: R,
  options: DefaultResourceQueryOptions<R>,
): Promise<void>;
export function prefetchResourceQuery(
  client: QueryClient,
  resource: object,
  options: RuntimeQueryOptions,
): Promise<void> {
  return client.prefetchQuery(buildResourceQueryOptions(resource, options));
}

/** Server-safe `prefetchInfiniteQuery` for the infinite mode of `useResourceQuery`. */
export function prefetchResourceInfiniteQuery<
  R,
  const N extends QueryOperationName<R> = "getAll" & QueryOperationName<R>,
  TPageParam = unknown,
>(
  client: QueryClient,
  resource: R,
  options: ResourceInfiniteQueryOptions<R, N, TPageParam> & {
    /** Pages to prefetch (native `pages`). Default 1. */
    pages?: number;
  },
): Promise<void> {
  const { pages, ...rest } = options as RuntimeInfiniteQueryOptions & { pages?: number };
  return client.prefetchInfiniteQuery({
    ...(buildResourceInfiniteQueryOptions(resource as object, rest) as object),
    ...(pages === undefined ? {} : { pages }),
  } as never);
}
