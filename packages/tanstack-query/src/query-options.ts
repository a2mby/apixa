import {
  queryOptions,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { createResourceKeys } from "./keys.js";
import {
  assertNoFullResponse,
  describeOperations,
  isPlainObject,
  type OperationInfo,
} from "./operations.js";
import type {
  AsyncFn,
  CustomOperationName,
  InferListQuery,
  InheritedReadName,
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
    ? { args?: Arguments<R, N>; keyParts?: QueryKey }
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
  } & (N extends InheritedReadName<R>
    ? { readOperations?: never }
    : N extends CustomOperationName<R>
      ? {
          /**
           * Legacy opt-in for a custom operation Core does not classify as a read. Prefer
           * `kind: "read"` on the Core operation.
           */
          readOperations: readonly N[];
          keyParts: QueryKey;
        }
      : never);

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
  const {
    queryKey,
    scope,
    operation = "getAll",
    args,
    keyParts,
    readOperations,
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
  const declared = readOperations?.includes(operation) === true;
  if (info.kind !== "read" && !declared) {
    throw new Error(
      `Operation ${operation} is not a read; mark it kind: "read" in Core (or list it in readOperations).`,
    );
  }
  if (declared && info.kind !== "read" && keyParts === undefined) {
    throw new Error(`Custom query operation ${operation} requires keyParts.`);
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
      : withOptions([], info, { query });
  if (staticArgs) assertNoFullResponse(staticArgs, info);

  const keys = createResourceKeys({ queryKey, scope });
  const identity = keyParts ?? normalizeIdentity(staticArgs ?? [], info);
  let generatedKey: QueryKey;
  if (operation === "getAll") {
    const listQuery = listQueryOf(identity, info);
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
          : withOptions(callArgs, info, { signal: context.signal });
      return (run as (...values: unknown[]) => Promise<unknown>)(...bound);
    },
  }) as GeneratedQueryOptions<unknown>;
}

export type RuntimeQueryOptions = ResourceQueryNativeOptions<unknown> & {
  operation?: string;
  args?: readonly unknown[] | ((context: QueryFunctionContext) => readonly unknown[]);
  keyParts?: QueryKey;
  readOperations?: readonly string[];
  query?: unknown;
};

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

/**
 * Data-defining identity: the exact arguments minus the request signal, with an empty options
 * object and trailing `undefined`s dropped so equivalent calls share one cache entry.
 */
export function normalizeIdentity(values: readonly unknown[], info: OperationInfo): unknown[] {
  const result = [...values];
  const index = info.optionsIndex;
  if (index !== null && isPlainObject(result[index])) {
    const { signal: _signal, ...rest } = result[index] as Record<string, unknown>;
    result[index] = Object.keys(rest).length === 0 ? undefined : rest;
  }
  while (result.length > 0 && result[result.length - 1] === undefined) result.pop();
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
