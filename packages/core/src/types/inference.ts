import type {
  AllBuiltinOpName,
  BuiltinOpName,
  ExtendedBuiltinOpName,
  OperationFnContext,
} from "./builtins.js";
import type {
  ApiRootConfig,
  OperationDefinition,
  ReservedApiConfigKey,
  ResourceRuntimeInput,
} from "./definition.js";
import type { OperationExtensions } from "./extensions.js";
import type { PathParams, QueryParams } from "./http.js";
import type { ApiResponse, RequestOptions } from "./transport.js";

export type { BuiltinOpName, ExtendedBuiltinOpName, AllBuiltinOpName } from "./builtins.js";

type EntityOf<R> = R extends { entity: infer E } ? E : unknown;

/**
 * getAll list type: required `list` when set, else `Entity[]`.
 * Optional `list?` (including from ResourceState) does not count.
 */
export type ListOf<R> = R extends { list: infer L }
  ? [undefined] extends [L]
    ? EntityOf<R>[]
    : L
  : EntityOf<R>[];

/**
 * Resource-level query for getAll when op does not declare `query`.
 * Optional `query?` does not count.
 */
export type QueryOf<R> = R extends { query: infer Q }
  ? [undefined] extends [Q]
    ? QueryParams
    : Q
  : QueryParams;

/**
 * Opt-in `getAll` envelope (v0.11.0). A resource with no `pagination` field behaves exactly as
 * before — `ListOf<R>` — zero type (or runtime) change unless declared. This only shapes types;
 * Apixa does not parse or invent a pagination envelope the backend didn't actually return.
 */
export type PaginatedListOf<R> = R extends { pagination: "page" }
  ? { data: ListOf<R>; total: number; page: number; pageSize: number }
  : R extends { pagination: "cursor" }
    ? { data: ListOf<R>; nextCursor: string | null }
    : ListOf<R>;

/** `getAll`'s query shape gains `page`/`pageSize` or `cursor`/`pageSize` when `pagination` is set. */
export type PaginationQueryOf<R> = R extends { pagination: "page" }
  ? QueryOf<R> & { page?: number; pageSize?: number }
  : R extends { pagination: "cursor" }
    ? QueryOf<R> & { cursor?: string; pageSize?: number }
    : QueryOf<R>;

/** Derived create body: `Omit<Entity, "id">` when `entity` is set. */
type CreateOf<R> = R extends { entity: infer E } ? Omit<E, "id"> : unknown;

/** Derived update body: `Partial<Entity>` when `entity` is set. */
type UpdateOf<R> = R extends { entity: infer E } ? Partial<E> : unknown;

type EntityBuiltinOps<R> = {
  getAll: { path: ""; response: PaginatedListOf<R>; query: PaginationQueryOf<R> };
  getById: { path: "/:id"; response: EntityOf<R> };
  create: { path: ""; body: CreateOf<R>; response: EntityOf<R> };
  update: { path: "/:id"; body: UpdateOf<R>; response: EntityOf<R> };
  delete: { path: "/:id"; response: void };
};

/**
 * Default shapes for the 10 builtins added in v0.10.0 — always-on for a resource with `path`,
 * same as the original 5. `getBySlug` / `patch` / `upsert` / `count` / `search` / `bulkCreate` /
 * `bulkDelete` are config-object conventions (same inference pipeline as the original 5).
 * `exists` / `findFirst` / `getMany` / `getBy` are composed from `getById` / `getAll` and declared
 * as plain function signatures — no new backend route is assumed for them.
 */
type ExtendedBuiltinOps<R> = {
  getBySlug: { path: "/slug/:slug"; response: EntityOf<R> };
  patch: { path: "/:id"; body: Partial<EntityOf<R>>; response: EntityOf<R> };
  upsert: { path: "/:id"; body: Partial<EntityOf<R>>; response: EntityOf<R> };
  count: { path: "/count"; response: number; query: QueryOf<R> };
  search: { path: "/search"; response: ListOf<R>; query: QueryOf<R> };
  bulkCreate: { path: "/bulk"; body: CreateOf<R>[]; response: EntityOf<R>[] };
  bulkDelete: { path: "/bulk"; body: (string | number)[]; response: void };
  getMany: (ids: (string | number)[]) => Promise<EntityOf<R>[]>;
  exists: (id: string | number) => Promise<boolean>;
  findFirst: (query?: QueryOf<R>) => Promise<EntityOf<R> | null>;
  /** General escape hatch: GET by any field/path and a value — `":name"` interpolates, else appends. */
  getBy: (fieldOrPath: string, value: string | number) => Promise<EntityOf<R>>;
};

type AllBuiltinOps<R> = EntityBuiltinOps<R> & ExtendedBuiltinOps<R>;

/** Strip the leading `OperationFnContext` parameter a runtime custom-operation function takes. */
type StripCtx<F> = F extends (ctx: OperationFnContext, ...args: infer A) => infer Ret
  ? (...args: A) => Ret
  : F;

type DefaultPath<Name extends string> = Name extends "getById" | "update" | "delete" ? "/:id" : "";

export type EffectivePath<Name extends string, Op> = Op extends { path: infer P }
  ? P extends string
    ? P
    : DefaultPath<Name>
  : DefaultPath<Name>;

type ResourcePathOf<R> = R extends { path: infer P } ? (P extends string ? P : "") : "";

type TrimTrailingSlash<S extends string> = S extends `${infer R}/` ? TrimTrailingSlash<R> : S;

/** Join resource path + relative op path for param inference. */
export type ConcatPaths<Base extends string, Rel extends string> = Rel extends ""
  ? TrimTrailingSlash<Base>
  : Rel extends `/${string}`
    ? `${TrimTrailingSlash<Base>}${Rel}`
    : `${TrimTrailingSlash<Base>}/${Rel}`;

export type FullPath<R, Name extends string, Op> =
  ResourcePathOf<R> extends infer Base
    ? Base extends string
      ? string extends Base
        ? EffectivePath<Name, Op> // wide `path: string` — count op params only
        : ConcatPaths<Base, EffectivePath<Name, Op>>
      : EffectivePath<Name, Op>
    : EffectivePath<Name, Op>;

type PathParamName<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParamName<`/${Rest}`>
  : T extends `${string}:${infer Param}`
    ? Param
    : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

type PathArity<Path extends string> = [PathParamName<Path>] extends [never]
  ? 0
  : IsUnion<PathParamName<Path>> extends true
    ? 2
    : 1;

type PathParamsOf<Path extends string> = [PathParamName<Path>] extends [never]
  ? PathParams
  : { [K in PathParamName<Path>]: string | number };

type InferResponse<Op> = Op extends { response: infer R } ? R : unknown;
type InferQuery<Name extends string, Op, R> = Op extends { query: infer Q }
  ? Q
  : Name extends "getAll"
    ? QueryOf<R>
    : QueryParams;

/**
 * Body presence: explicit `body` on the op, else create/update builtins.
 * (Avoid `[unknown] extends [undefined]` pitfalls with inferred CreateOf.)
 */
type HasBody<Name extends string, Op> = Op extends { body: infer B }
  ? [B] extends [never]
    ? false
    : true
  : Name extends "create" | "update"
    ? true
    : false;

type InferBody<Name extends string, Op, R> = Op extends { body: infer B }
  ? B
  : Name extends "create"
    ? CreateOf<R>
    : Name extends "update"
      ? UpdateOf<R>
      : undefined;

/** Resolve unwrapped data vs full `ApiResponse` from call options. */
export type CallResult<Data, O> = [O] extends [undefined]
  ? Data
  : O extends { full: true }
    ? ApiResponse<Data>
    : Data;

type OperationFn<R, Name extends string, Op> = BuildOperationFn<
  PathArity<FullPath<R, Name, Op>>,
  PathParamsOf<FullPath<R, Name, Op>>,
  HasBody<Name, Op> extends true ? InferBody<Name, Op, R> : undefined,
  InferResponse<Op>,
  InferQuery<Name, Op, R>
>;

type BuildOperationFn<Arity extends 0 | 1 | 2, Params, Body, Result, Query> = [Body] extends [
  undefined,
]
  ? Arity extends 0
    ? <O extends RequestOptions<Query> | undefined = undefined>(
        options?: O,
      ) => Promise<CallResult<Result, O>>
    : Arity extends 1
      ? <O extends RequestOptions<Query> | undefined = undefined>(
          id: string | number,
          options?: O,
        ) => Promise<CallResult<Result, O>>
      : <O extends RequestOptions<Query> | undefined = undefined>(
          params: Params,
          options?: O,
        ) => Promise<CallResult<Result, O>>
  : Arity extends 0
    ? <O extends RequestOptions<Query> | undefined = undefined>(
        body: Body,
        options?: O,
      ) => Promise<CallResult<Result, O>>
    : Arity extends 1
      ? <O extends RequestOptions<Query> | undefined = undefined>(
          id: string | number,
          body: Body,
          options?: O,
        ) => Promise<CallResult<Result, O>>
      : <O extends RequestOptions<Query> | undefined = undefined>(
          params: Params,
          body: Body,
          options?: O,
        ) => Promise<CallResult<Result, O>>;

type MergeOp<Base, Override> = [Override] extends [never]
  ? Base
  : [Override] extends [undefined]
    ? Base
    : Override extends (...args: never[]) => unknown
      ? StripCtx<Override> // developer supplied a function override/implementation
      : Base extends (...args: never[]) => unknown
        ? Base // composed builtin (exists/findFirst/getMany) — object override doesn't change the signature
        : Omit<Base, keyof Override> & Override;

/** Declared `operations` on the resource state (may include type-only fields). `false` (removal) is excluded. */
export type ResourceOpsOf<R> = R extends { operations?: infer Ops }
  ? [Ops] extends [undefined]
    ? {}
    : Ops extends Record<string, unknown>
      ? {
          [
            K in keyof Ops as [Ops[K]] extends [undefined]
              ? never
              : [Ops[K]] extends [false]
                ? never
                : K
          ]-?: Exclude<Ops[K], undefined | false>;
        }
      : {}
  : {};

/** Raw `operations` entries, including `false` — used only to detect removed builtins. */
type RawOperations<R> = R extends { operations?: infer Ops }
  ? [Ops] extends [undefined]
    ? {}
    : Ops
  : {};

type RemovedOpName<R> = {
  [K in keyof RawOperations<R>]: RawOperations<R>[K] extends false ? K : never;
}[keyof RawOperations<R>];

/** The 7 write-op names `readOnly: true` removes, same set `operation/expand.ts` uses at runtime. */
type WriteOpName =
  "create" | "update" | "patch" | "upsert" | "delete" | "bulkCreate" | "bulkDelete";

/** `readOnly: true` removes the 7 write ops, unless `operations` has its own explicit entry for one. */
type ReadOnlyRemovedOpName<R> = R extends { readOnly: true }
  ? Exclude<WriteOpName, keyof RawOperations<R>>
  : never;

/** All 16 builtins (original 5 + the 10 added in v0.10.0) are always-on, minus any set to `false`
 *  or implicitly removed by `readOnly: true`. */
type KnownOpName<R> = Exclude<AllBuiltinOpName, RemovedOpName<R> | ReadOnlyRemovedOpName<R>>;

type EffectiveOpDef<Name extends AllBuiltinOpName, R> = Name extends keyof ResourceOpsOf<R>
  ? MergeOp<AllBuiltinOps<R>[Name], ResourceOpsOf<R>[Name]>
  : AllBuiltinOps<R>[Name];

/** The client method type for a known (always-on or referenced opt-in) builtin. */
type ClientFnFor<Name extends AllBuiltinOpName, R> =
  EffectiveOpDef<Name, R> extends (...args: never[]) => unknown
    ? EffectiveOpDef<Name, R>
    : OperationFn<R, Name, EffectiveOpDef<Name, R>>;

/** Fully custom operation names — not one of the 16 known builtins. */
type CustomOpName<R> = Exclude<keyof ResourceOpsOf<R>, BuiltinOpName | ExtendedBuiltinOpName>;

type CustomClientFn<R, K> = K extends keyof ResourceOpsOf<R>
  ? ResourceOpsOf<R>[K] extends (...args: never[]) => unknown
    ? StripCtx<ResourceOpsOf<R>[K]>
    : OperationFn<
        R,
        Extract<K, string>,
        ResourceOpsOf<R>[K] & OperationDefinition & OperationExtensions
      >
  : never;

/** All 16 always-on builtins (minus any set to `false`) ∪ fully custom declared operations. */
export type EffectiveOps<R> = {
  [K in KnownOpName<R>]: EffectiveOpDef<K, R>;
} & {
  [K in CustomOpName<R>]: ResourceOpsOf<R>[K];
};

/**
 * Resource client with **required** builtin method keys for all 16 always-on operations (original
 * 5 + the 10 added in v0.10.0, minus any set to `false`) so IDEs complete `api.users.getAll` /
 * `getById` / `count` / `exists` / … without ReturnType hacks, plus any fully custom operation the
 * resource declares.
 */
export type ResourceClient<R extends { path: string } = { path: string }> = {
  [K in KnownOpName<R>]: ClientFnFor<K, R>;
} & {
  [K in CustomOpName<R>]: CustomClientFn<R, K>;
};

/** Drop reserved / non-resource keys via key remapping (not `never` values). */
export type ApiClient<T> = {
  [
    K in keyof T as K extends ReservedApiConfigKey
      ? never
      : T[K] extends { path: string }
        ? K
        : never
  ]: T[K] extends { path: string } ? ResourceClient<T[K]> : never;
};

export type { MockDatasetIds } from "./mock-dataset-ids.js";

/**
 * Runtime config: Core root builtins + one runtime resource bag per key of `T`.
 * Type-only `entity` / `list` / `query` (and op `body` / `response` / `query`) are not required.
 */
export type ApiInput<T> = ApiRootConfig & {
  [K in keyof T]: T[K] extends { path: string } ? ResourceRuntimeInput : never;
};

/** @deprecated Prefer ApiInput — kept name for call-site clarity in older docs. */
export type ValidateApiConfig<T> = ApiInput<T>;
