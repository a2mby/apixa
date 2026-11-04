import type { InvalidateQueryFilters, QueryKey } from "@tanstack/react-query";

// Structural resource ops — `any` only at the boundary so Core clients assign cleanly.
// Inference helpers below extract precise types from the concrete `TResource`.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AsyncFn = (...args: any[]) => Promise<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Minimal structural shape of an Apixa resource client (builtins). */
export type ResourceLike = {
  getAll: AsyncFn;
  getById?: AsyncFn;
  create?: AsyncFn;
  update?: AsyncFn;
  delete?: AsyncFn;
};

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
export type InferGetByIdArg<R extends ResourceLike> = R extends {
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

export type ResourceKeyFactory = {
  all: () => QueryKey;
  lists: () => QueryKey;
  list: (query?: unknown) => QueryKey;
  detail: (id: unknown) => QueryKey;
  mutation: (op: "create" | "update" | "delete") => QueryKey;
};

export type CreateResourceControllerConfig = {
  queryKey: QueryKey;
  scope?: QueryKey;
  /** Default list query params (also become part of the list key). */
  query?: unknown;
};

export type InvalidateFn = (filters?: InvalidateQueryFilters) => Promise<void>;
