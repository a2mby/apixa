import type { BUILTIN_CONVENTIONS, OperationKindsOf } from "@apixa/core";
import type { InvalidateQueryFilters, QueryKey } from "@tanstack/react-query";

// Structural resource ops — `any` only at the boundary so Core clients assign cleanly.
// Inference helpers below extract precise types from the concrete `TResource`.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type AsyncFn = (...args: any[]) => Promise<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Minimal structural shape of an Apixa resource client (builtins). */
export type ResourceLike = {
  getAll: AsyncFn;
  getById?: AsyncFn;
  create?: AsyncFn;
  update?: AsyncFn;
  delete?: AsyncFn;
};

/** Callable methods present on a concrete Core resource. Optional methods are excluded. */
export type CallableOperationName<R> = Extract<
  {
    [K in keyof R]-?: {} extends Pick<R, K> ? never : R[K] extends AsyncFn ? K : never;
  }[keyof R],
  string
>;

/** Methods which may exist only at runtime (for example, selection from a boolean variable). */
export type OptionalOperationName<R> = Extract<
  {
    [K in keyof R]-?: {} extends Pick<R, K>
      ? NonNullable<R[K]> extends AsyncFn
        ? K
        : never
      : never;
  }[keyof R],
  string
>;

/**
 * Core `RequestOptions` slots lose `full: true`: hooks resolve unwrapped payloads, and a generic
 * Core signature cannot be re-expressed through a wrapper. Recognized as objects with both
 * `signal` and `full` keys, so custom parameter objects are untouched.
 */
type WithoutFull<Value> = Value extends object
  ? "full" extends keyof Value
    ? "signal" extends keyof Value
      ? Omit<Value, "full"> & { full?: false }
      : Value
    : Value
  : Value;
type SanitizeArgs<A extends readonly unknown[]> = { [K in keyof A]: WithoutFull<A[K]> };

/** Exact Core argument tuple (with `full` constrained to `false`). */
export type OperationParameters<R, N extends keyof R> = SanitizeArgs<
  Parameters<Extract<NonNullable<R[N]>, AsyncFn>>
>;
/** Resolved payload of an operation (Core's unwrapped `Data`). */
export type OperationReturn<R, N extends keyof R> = Awaited<
  ReturnType<Extract<NonNullable<R[N]>, AsyncFn>>
>;

/** Every operation name (required or optional) on a resource. */
export type AnyOperationName<R> = CallableOperationName<R> | OptionalOperationName<R>;

/**
 * Read/write map: Core's metadata for `defineApi` clients; for plain objects, the builtin read
 * names are reads and everything else is a write (never inferred from a custom name).
 */
export type OperationKinds<R> = [OperationKindsOf<R>] extends [never]
  ? { [K in AnyOperationName<R>]: K extends BuiltinReadOperation ? "read" : "write" }
  : OperationKindsOf<R>;
type KindOf<R, K> = K extends keyof OperationKinds<R> ? OperationKinds<R>[K] : "write";

/** Required / optional operations classified as reads. */
export type InheritedReadName<R> = {
  [K in CallableOperationName<R>]: KindOf<R, K> extends "read" ? K : never;
}[CallableOperationName<R>];
export type OptionalReadName<R> = {
  [K in OptionalOperationName<R>]: KindOf<R, K> extends "read" ? K : never;
}[OptionalOperationName<R>];
export type InheritedWriteName<R> = Exclude<CallableOperationName<R>, InheritedReadName<R>>;
export type OptionalWriteName<R> = Exclude<OptionalOperationName<R>, OptionalReadName<R>>;

/** Directly callable operation with Core's arguments and resolved payload. */
export type OperationCall<R, N extends keyof R> = (
  ...args: OperationParameters<R, N>
) => Promise<OperationReturn<R, N>>;

/** Inherited reads as imperative, QueryClient-cached calls. */
export type InheritedReads<R> = { [K in InheritedReadName<R>]: OperationCall<R, K> } & {
  [K in OptionalReadName<R>]?: OperationCall<R, K>;
};

export type BuiltinReadOperation = {
  [K in keyof typeof BUILTIN_CONVENTIONS]: (typeof BUILTIN_CONVENTIONS)[K]["access"] extends "read"
    ? K
    : never;
}[keyof typeof BUILTIN_CONVENTIONS];
export type BuiltinWriteOperation = Exclude<keyof typeof BUILTIN_CONVENTIONS, BuiltinReadOperation>;
export type ReadOperationName<R> = Extract<CallableOperationName<R>, BuiltinReadOperation>;
export type CustomOperationName<R> = Exclude<
  CallableOperationName<R>,
  BuiltinReadOperation | BuiltinWriteOperation
>;
/** Custom operations Core classifies as reads (`kind: "read"`). */
export type CustomReadName<R> = Extract<InheritedReadName<R>, CustomOperationName<R>>;
export type QueryOperationName<R> = InheritedReadName<R>;

type PromiseData<F> = F extends (...args: never[]) => Promise<infer R>
  ? R
  : F extends (...args: infer _A) => Promise<infer R>
    ? R
    : never;

export type InferListData<R extends ResourceLike> = PromiseData<R["getAll"]>;
export type InferEntity<R extends ResourceLike> = R extends { getById: infer F }
  ? PromiseData<F>
  : unknown;
export type InferCreateBody<R extends ResourceLike> = R extends {
  create: (...args: infer A) => Promise<unknown>;
}
  ? A[0]
  : never;
export type InferUpdateId<R extends ResourceLike> = R extends {
  update: (...args: infer A) => Promise<unknown>;
}
  ? A[0]
  : never;
export type InferUpdateBody<R extends ResourceLike> = R extends {
  update: (...args: infer A) => Promise<unknown>;
}
  ? A[1]
  : never;
export type InferDeleteId<R extends ResourceLike> = R extends {
  delete: (...args: infer A) => Promise<unknown>;
}
  ? A[0]
  : never;
export type InferGetByIdArg<R> = R extends {
  getById: (...args: infer A) => Promise<unknown>;
}
  ? A[0]
  : never;

/** Query bag passed to `getAll` options (when present). */
export type InferListQuery<R extends ResourceLike> = Parameters<R["getAll"]>[0] extends
  { query?: infer Q } | undefined | null
  ? [unknown] extends [Q]
    ? unknown
    : Q
  : unknown;

export type UpdateVariables<R extends ResourceLike> = {
  id: InferUpdateId<R>;
  body: InferUpdateBody<R>;
};

type ReadKeyName<R> = unknown extends R
  ? string
  : Extract<InheritedReadName<R> | OptionalReadName<R>, string>;
type MutationKeyName<R, M> = unknown extends R
  ? string
  : Extract<
      InheritedWriteName<R> | OptionalWriteName<R> | Exclude<keyof M, AnyOperationName<R>>,
      string
    >;

export type ResourceKeyFactory<R = unknown, M = {}> = {
  all: () => QueryKey;
  lists: () => QueryKey;
  list: (query?: unknown) => QueryKey;
  detail: (id: R extends { getById: AsyncFn } ? InferGetByIdArg<R> : unknown) => QueryKey;
  operation: (op: ReadKeyName<R>, parts?: QueryKey) => QueryKey;
  /** Prefix of every infinite query of the resource. */
  infinites: () => QueryKey;
  /** Infinite query key: `[...root, "infinite", op, ...keyParts]` (no page parameter). */
  infinite: (op?: ReadKeyName<R>, parts?: QueryKey) => QueryKey;
  /** Mutation key for any operation name (`create`, `patch`, a custom op, …). */
  mutation: (op: MutationKeyName<R, M>) => QueryKey;
};

export type CreateResourceControllerConfig = {
  queryKey: QueryKey;
  scope?: QueryKey;
  /** Default list query params (also become part of the list key). */
  query?: unknown;
};

export type InvalidateFn = (filters?: InvalidateQueryFilters) => Promise<void>;
