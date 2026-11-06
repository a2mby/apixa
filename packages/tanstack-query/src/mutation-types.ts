import type {
  MutationFunctionContext,
  MutationObserverResult,
  QueryClient,
  QueryKey,
  UseMutationOptions,
} from "@tanstack/react-query";
import type { OptimisticTarget } from "./optimistic.js";
import type {
  AnyOperationName,
  InferGetByIdArg,
  CallableOperationName,
  InheritedWriteName,
  OperationParameters,
  OperationReturn,
  OptionalOperationName,
  OptionalWriteName,
  ResourceKeyFactory,
} from "./types.js";

/** What to invalidate after a successful mutation. Default: `"all"`. */
export type MutationInvalidation<TData, TArgs> =
  /** `true` / `"all"`: every query under the resource key. `false`: nothing. */
  | boolean
  | "all"
  /** Only `[..., "list", …]` queries. */
  | "lists"
  /** Lists and/or specific details whose identity you derive from the result or arguments. */
  | {
      lists?: boolean;
      details?: (data: TData, args: TArgs) => readonly unknown[];
    }
  /** Full control; awaited before the consumer `onSuccess`. */
  | ((context: {
      client: QueryClient;
      keys: ResourceKeyFactory;
      data: TData;
      args: TArgs;
    }) => unknown);

type NativeMutationOptions<TData, TArgs, TContext> = Omit<
  UseMutationOptions<TData, Error, TArgs, TContext>,
  "mutationFn" | "mutationKey"
>;

type DetailData<R> =
  "getById" extends AnyOperationName<R> ? OperationReturn<R, "getById" & keyof R> : never;
type ListData<R> =
  "getAll" extends AnyOperationName<R> ? OperationReturn<R, "getAll" & keyof R> : never;
type DetailId<R> = InferGetByIdArg<{ [K in keyof R]-?: NonNullable<R[K]> }>;

/**
 * Declarative optimistic update for one write. Runs before the request, rolls back on failure
 * (only this call's change), and is replaced by server data after invalidation. Updaters get the
 * raw cached data (never `select` output) and must return new objects (no mutation).
 */
export type OptimisticOptions<R, TArgs> = (
  | {
      /** Detail cache entries to update (every cached variant of each id). */
      detail: (args: TArgs) => DetailId<R> | readonly DetailId<R>[] | null | undefined;
      update: (current: DetailData<R>, args: TArgs) => DetailData<R>;
    }
  | { detail?: never; update?: never }
) & {
  /** Every cached list (`[..., "list", …]`) of the resource. Not infinite lists. */
  list?: (current: ListData<R>, args: TArgs) => ListData<R>;
  /** Any other cache entries (custom reads, infinite lists, other resources). */
  targets?: (args: TArgs, keys: ResourceKeyFactory<R>) => readonly OptimisticTarget[];
};

/** Per-operation config for an inherited Core operation: every native mutation option. */
export type OperationMutationOptions<TData, TArgs, TContext = unknown> = NativeMutationOptions<
  TData,
  TArgs,
  TContext
> & {
  invalidate?: MutationInvalidation<TData, TArgs>;
  /** Inherited operations always run Core's implementation; they cannot be redefined. */
  mutationFn?: never;
};

/** A client-only operation: its signature and result come from `mutationFn`. */
export type ClientMutationOptions<
  TArgs extends readonly unknown[],
  TData,
  TContext = unknown,
> = NativeMutationOptions<TData, TArgs, TContext> & {
  invalidate?: MutationInvalidation<TData, TArgs>;
  mutationFn: (...args: TArgs) => Promise<TData>;
};

type ClientFn = (...args: never[]) => Promise<unknown>;
type ClientArgs<F> = F extends (...args: infer A) => Promise<unknown> ? A : never;
type ClientData<F> = F extends (...args: never[]) => Promise<infer D> ? D : never;

/**
 * `mutations: {}`, inferred per key (`M` is reverse-mapped from the literal):
 * - an operation of the resource: native options + `invalidate`; `M[K]` is its `onMutate` result
 *   (TanStack's `TOnMutateResult`);
 * - any other key: a client-only operation; `M[K]` is its `mutationFn`, which is required.
 */
export type MutationsConfig<R, M> = {
  // `keyof M` keeps per-key inference; the operation names make editors suggest every operation.
  [K in keyof M | AnyOperationName<R>]?: K extends InheritedWriteName<R> | OptionalWriteName<R>
    ? InheritedConfig<
        R,
        OperationReturn<R, K>,
        OperationParameters<R, K>,
        K extends keyof M ? M[K] : unknown
      >
    : K extends AnyOperationName<R>
      ? never
      : K extends keyof M
        ? ClientMutationOptions<ClientArgs<M[K]>, ClientData<M[K]>> & {
            mutationFn: M[K] & ClientFn;
          }
        : never;
};

/**
 * `M[K]` is inferred from `onMutate`'s raw return (possibly a Promise, as TanStack allows); the
 * other callbacks and `states[K].context` receive the awaited value.
 */
type InheritedConfig<R, TData, TArgs, TRaw> = Omit<
  OperationMutationOptions<TData, TArgs, Awaited<TRaw>>,
  "onMutate"
> & {
  onMutate?: (variables: TArgs, context: MutationFunctionContext) => TRaw;
  optimistic?: OptimisticOptions<R, TArgs>;
};

type ClientName<R, M> = Exclude<keyof M, AnyOperationName<R>> & string;
type ContextOf<M, K> = K extends keyof M ? Awaited<M[K]> : unknown;

export type UseResourceMutationOptions<R, M = {}> = {
  /** Resource root, shared with `useResourceQuery`. Mutation keys: `[...root, "mutation", op]`. */
  queryKey: QueryKey;
  /** Apixa key prefix (tenant / backend). TanStack's mutation `scope` lives per operation. */
  scope?: QueryKey;
  /** Overrides for inherited operations, and client-only operations (with `mutationFn`). */
  mutations?: MutationsConfig<R, M>;
};

type MutationState<TData, TArgs, TContext> = MutationObserverResult<TData, Error, TArgs, TContext>;

/** Native mutation fields readable directly on a callable operation. */
export type MutationStateKey =
  | "data"
  | "error"
  | "variables"
  | "context"
  | "status"
  | "isIdle"
  | "isPending"
  | "isSuccess"
  | "isError"
  | "isPaused"
  | "failureCount"
  | "failureReason"
  | "submittedAt"
  | "reset";

type DistributivePick<T, K extends keyof T> = T extends unknown ? Pick<T, K> : never;

/**
 * A callable write that also exposes its native mutation state: `users.create(body)` and
 * `users.create.isPending`. State is the latest invocation (like `useMutation`): with concurrent
 * calls, `isPending` turning false does not mean every earlier call finished — await each call's
 * promise for that.
 */
export type MutationOperation<TData, TArgs extends readonly unknown[], TContext = unknown> = ((
  ...args: TArgs
) => Promise<TData>) &
  Readonly<DistributivePick<MutationState<TData, TArgs, TContext>, MutationStateKey>>;

/** Every inherited write plus client-only ones, called with their own separate arguments. */
export type ResourceMutationOperations<R, M = {}> = {
  [K in InheritedWriteName<R>]: MutationOperation<
    OperationReturn<R, K>,
    OperationParameters<R, K>,
    ContextOf<M, K>
  >;
} & {
  [K in OptionalWriteName<R>]?: MutationOperation<
    OperationReturn<R, K>,
    OperationParameters<R, K>,
    ContextOf<M, K>
  >;
} & {
  [K in ClientName<R, M>]: MutationOperation<ClientData<M[K]>, ClientArgs<M[K]>>;
};

/** Native mutation state per operation (latest invocation, like `useMutation`). */
export type ResourceMutationStates<R, M = {}> = {
  readonly [K in InheritedWriteName<R>]: MutationState<
    OperationReturn<R, K>,
    OperationParameters<R, K>,
    ContextOf<M, K>
  >;
} & {
  readonly [K in OptionalWriteName<R>]?: MutationState<
    OperationReturn<R, K>,
    OperationParameters<R, K>,
    ContextOf<M, K>
  >;
} & {
  readonly [K in ClientName<R, M>]: MutationState<ClientData<M[K]>, ClientArgs<M[K]>, unknown>;
};

export type MutationResultKey = "operations" | "states" | "keys";

export type ResourceMutationResult<R, M = {}> = Omit<
  ResourceMutationOperations<R, M>,
  MutationResultKey
> & {
  /** Guaranteed namespace: every operation, even ones whose name clashes with a result field. */
  operations: ResourceMutationOperations<R, M>;
  states: ResourceMutationStates<R, M>;
  keys: ResourceKeyFactory<R, M>;
};

/** Operations the unified facade routes through mutations (writes and client-only). */
export type WriteStates<R, M> = ResourceMutationStates<R, M>;
