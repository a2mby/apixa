import type {
  FetchQueryOptions,
  InfiniteData,
  QueryClient,
  QueryKey,
  Updater,
} from "@tanstack/react-query";
import {
  buildResourceInfiniteQueryOptions,
  buildResourceQueryOptions,
  type ResourceInfiniteConfig,
  type RuntimeInfiniteConfig,
} from "./query-options.js";
import type {
  AsyncFn,
  InferListQuery,
  InheritedReadName,
  OperationParameters,
  OperationReturn,
  OptionalReadName,
  ResourceKeyFactory,
} from "./types.js";

type ReadName<R> = Extract<InheritedReadName<R> | OptionalReadName<R>, string>;
type Req<R> = { [K in keyof R]-?: NonNullable<R[K]> };

type ListQueryOf<R> = InferListQuery<{ getAll: Extract<Req<R>["getAll" & keyof Req<R>], AsyncFn> }>;

type ArgsOf<R, N extends keyof R> =
  [] extends OperationParameters<R, N>
    ? { args?: OperationParameters<R, N> }
    : { args: OperationParameters<R, N> };

/** A regular read cache entry: exactly the key the hook (or controller) would use. */
export type QueryTarget<R> =
  | {
      [N in ReadName<R>]: { operation: N; keyParts?: QueryKey; infinite?: undefined } & ArgsOf<
        Req<R>,
        N & keyof Req<R>
      > &
        (N extends "getAll" ? { query?: ListQueryOf<R> } : { query?: never });
    }[ReadName<R>]
  | ("getAll" extends ReadName<R>
      ? {
          operation?: undefined;
          infinite?: undefined;
          keyParts?: QueryKey;
          args?: OperationParameters<Req<R>, "getAll" & keyof Req<R>>;
          query?: ListQueryOf<R>;
        }
      : never);

/** An infinite cache entry by identity (no paging config needed to read, write, or remove it). */
export type InfiniteKeyTarget<R> = {
  infinite: true;
  operation?: ReadName<R>;
  keyParts?: QueryKey;
};

/** An infinite query to prefetch (the paging config builds the first page). */
export type InfinitePrefetchTarget<R, N extends ReadName<R>, TPageParam> = {
  operation?: N;
  keyParts?: QueryKey;
  infinite: ResourceInfiniteConfig<Req<R>, N & keyof Req<R>, TPageParam>;
};

/** Resource-wide prefixes (only for `remove` / `cancel`, never the default). */
export type PrefixTarget = { all: true } | { lists: true };

/** Raw cached data of a target (never `select` output). */
export type TargetData<R, T> = T extends { infinite: true; operation?: infer N }
  ? InfiniteData<
      N extends keyof Req<R>
        ? OperationReturn<Req<R>, N>
        : OperationReturn<Req<R>, "getAll" & keyof Req<R>>
    >
  : T extends { operation: infer N extends keyof Req<R> }
    ? OperationReturn<Req<R>, N>
    : OperationReturn<Req<R>, "getAll" & keyof Req<R>>;

/** Native fetch options a prefetch may set; unset ones are inherited from the hook. */
export type PrefetchNativeOptions = Pick<
  FetchQueryOptions<unknown, Error>,
  "staleTime" | "gcTime" | "retry" | "retryDelay" | "networkMode" | "meta"
>;

/** `undefined` = the observed query; with no observed query, pass a target. */
export type ResourceCache<R, TRaw> = {
  /** `queryClient.getQueryData` for the observed query or a target. Never fetches. */
  get: ([TRaw] extends [never] ? {} : { (): TRaw | undefined }) & {
    <const T extends QueryTarget<R> | InfiniteKeyTarget<R>>(
      target: T,
    ): TargetData<R, T> | undefined;
  };
  /** `queryClient.setQueryData` (raw data, not `select` output). Never fetches. */
  set: ([TRaw] extends [never]
    ? {}
    : { (updater: Updater<TRaw | undefined, TRaw | undefined>): TRaw | undefined }) & {
    <const T extends QueryTarget<R> | InfiniteKeyTarget<R>>(
      updater: Updater<TargetData<R, T> | undefined, TargetData<R, T> | undefined>,
      target: T,
    ): TargetData<R, T> | undefined;
  };
  /** `queryClient.removeQueries`: the observed query (exact) or an explicit target / prefix. */
  remove: (target?: QueryTarget<R> | InfiniteKeyTarget<R> | PrefixTarget) => void;
};

export type ResourcePrefetch<R> = {
  /** The observed query (normal or infinite), with the hook's options. */
  (): Promise<void>;
  /** Any read, with the hook's staleTime / gcTime / retry unless overridden. */
  <const T extends QueryTarget<R>>(target: T & PrefetchNativeOptions): Promise<void>;
  /** An infinite list (first page, or `pages` pages). */
  <N extends ReadName<R> = Extract<"getAll", ReadName<R>>, TPageParam = unknown>(
    target: InfinitePrefetchTarget<R, N, TPageParam> & PrefetchNativeOptions & { pages?: number },
  ): Promise<void>;
};

export type ResourceCancel<R> = (
  target?: QueryTarget<R> | InfiniteKeyTarget<R> | PrefixTarget,
) => Promise<void>;

/** Current observed state, read when a helper is called (helpers themselves are stable). */
export type ObservedState = {
  options: Record<string, unknown> & { queryKey: QueryKey; scope?: QueryKey };
  /** The options passed to `useQuery` / `useInfiniteQuery`, or `undefined` when nothing is observed. */
  built: { queryKey: QueryKey } | undefined;
  infinite: boolean;
};

const INHERITED = ["staleTime", "gcTime", "retry", "retryDelay", "networkMode", "meta"] as const;

/** React-free prefetch / cache / cancel bound to one resource and the current observed state. */
export function createQueryHelpers(
  resource: object,
  client: QueryClient,
  keys: ResourceKeyFactory,
  current: () => ObservedState,
) {
  const observed = () => {
    const state = current();
    if (!state.built) {
      throw new Error(
        'This resource query observes nothing (no getAll); pass a target such as { operation: "getById", args: [id] }.',
      );
    }
    return state;
  };
  const inherited = (overrides: Record<string, unknown>) => {
    const { options } = current();
    const out: Record<string, unknown> = { queryKey: options.queryKey, scope: options.scope };
    for (const key of INHERITED) if (options[key] !== undefined) out[key] = options[key];
    return { ...out, ...overrides, queryKey: options.queryKey, scope: options.scope };
  };

  /** Exact key (or prefix) of a target, and whether it holds InfiniteData. */
  const resolve = (
    target: Record<string, unknown> | undefined,
  ): { queryKey: QueryKey; exact: boolean; infinite: boolean } => {
    if (target === undefined) {
      const state = observed();
      return { queryKey: state.built!.queryKey, exact: true, infinite: state.infinite };
    }
    if (target.all === true) return { queryKey: keys.all(), exact: false, infinite: false };
    if (target.lists === true) return { queryKey: keys.lists(), exact: false, infinite: false };
    if (target.infinite === true) {
      return {
        queryKey: keys.infinite(
          (target.operation as string | undefined) ?? "getAll",
          (target.keyParts as QueryKey | undefined) ?? [],
        ),
        exact: true,
        infinite: true,
      };
    }
    if (target.infinite !== undefined) {
      const built = buildResourceInfiniteQueryOptions(resource, {
        ...inherited(target),
        infinite: target.infinite as RuntimeInfiniteConfig,
      } as never);
      return { queryKey: built.queryKey, exact: true, infinite: true };
    }
    const built = buildResourceQueryOptions(resource, inherited(target) as never);
    return { queryKey: built.queryKey, exact: true, infinite: false };
  };

  const exactOnly = (target: Record<string, unknown> | undefined, what: string) => {
    const resolved = resolve(target);
    if (!resolved.exact) throw new Error(`cache.${what} needs one entry, not a prefix target.`);
    return resolved;
  };

  const prefetch = (target?: Record<string, unknown>): Promise<void> => {
    if (target === undefined) {
      const state = observed();
      return state.infinite
        ? client.prefetchInfiniteQuery(state.built as never)
        : client.prefetchQuery(state.built as never);
    }
    if (target.infinite === true) {
      throw new Error(
        "prefetch needs the paging config: { infinite: { initialPageParam, getNextPageParam, … } }.",
      );
    }
    if (target.infinite !== undefined) {
      const { pages, infinite, ...rest } = target;
      const options = buildResourceInfiniteQueryOptions(resource, {
        ...inherited(rest),
        infinite: infinite as RuntimeInfiniteConfig,
      } as never);
      return client.prefetchInfiniteQuery({
        ...(options as object),
        ...(pages === undefined ? {} : { pages }),
      } as never);
    }
    return client.prefetchQuery(buildResourceQueryOptions(resource, inherited(target) as never));
  };

  const cache = {
    get: (target?: Record<string, unknown>) =>
      client.getQueryData(exactOnly(target, "get").queryKey),
    set: (updater: unknown, target?: Record<string, unknown>) => {
      const { queryKey, infinite } = exactOnly(target, "set");
      return client.setQueryData(queryKey, (previous: unknown) => {
        const next =
          typeof updater === "function"
            ? (updater as (value: unknown) => unknown)(previous)
            : updater;
        if (infinite && next !== undefined) assertInfiniteData(next);
        return next;
      });
    },
    remove: (target?: Record<string, unknown>) => {
      const { queryKey, exact } = resolve(target);
      client.removeQueries({ queryKey, exact });
    },
  };

  const cancel = (target?: Record<string, unknown>) => {
    const { queryKey, exact } = resolve(target);
    return client.cancelQueries({ queryKey, exact });
  };

  return { prefetch, cache, cancel };
}

/** Infinite entries must keep `pages` and `pageParams` aligned (TanStack relies on it). */
function assertInfiniteData(value: unknown): void {
  const data = value as { pages?: unknown; pageParams?: unknown };
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.pages) ||
    !Array.isArray(data.pageParams) ||
    data.pages.length !== data.pageParams.length
  ) {
    throw new Error(
      "cache.set on an infinite query must return { pages, pageParams } arrays of equal length.",
    );
  }
}
