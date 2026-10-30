import type {
  ApiRootConfig,
  OperationDefinition,
  ReservedApiConfigKey,
  ResourceRuntimeInput,
} from "./definition.js";
import type { OperationExtensions } from "./extensions.js";
import type { PathParams, QueryParams } from "./http.js";
import type { ApiResponse, RequestOptions } from "./transport.js";

export type BuiltinOpName = "getAll" | "getById" | "create" | "update" | "delete";

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

/** Derived create body: `Omit<Entity, "id">` when `entity` is set. */
type CreateOf<R> = R extends { entity: infer E } ? Omit<E, "id"> : unknown;

/** Derived update body: `Partial<Entity>` when `entity` is set. */
type UpdateOf<R> = R extends { entity: infer E } ? Partial<E> : unknown;

type EntityBuiltinOps<R> = {
  getAll: { path: ""; response: ListOf<R>; query: QueryOf<R> };
  getById: { path: "/:id"; response: EntityOf<R> };
  create: { path: ""; body: CreateOf<R>; response: EntityOf<R> };
  update: { path: "/:id"; body: UpdateOf<R>; response: EntityOf<R> };
  delete: { path: "/:id"; response: void };
};

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
    : Omit<Base, keyof Override> & Override;

/** Declared `operations` on the resource state (may include type-only fields). */
export type ResourceOpsOf<R> = R extends { operations?: infer Ops }
  ? [Ops] extends [undefined]
    ? {}
    : Ops extends Record<string, unknown>
      ? {
          [K in keyof Ops as [Ops[K]] extends [undefined] ? never : K]-?: Exclude<
            Ops[K],
            undefined
          >;
        }
      : {}
  : {};

type EffectiveOpDef<Name extends BuiltinOpName, R> = Name extends keyof ResourceOpsOf<R>
  ? MergeOp<EntityBuiltinOps<R>[Name], ResourceOpsOf<R>[Name]>
  : EntityBuiltinOps<R>[Name];

/** Builtins from entity ∪ declared operations; overrides refine individual ops. */
export type EffectiveOps<R> = {
  [K in BuiltinOpName]: EffectiveOpDef<K, R>;
} & {
  [K in Exclude<keyof ResourceOpsOf<R>, BuiltinOpName>]: ResourceOpsOf<R>[K];
};

/**
 * Resource client with **required** builtin method keys so IDEs complete
 * `api.users.getAll` / `getById` / … without ReturnType hacks.
 */
export type ResourceClient<R extends { path: string } = { path: string }> = {
  getAll: OperationFn<R, "getAll", EffectiveOpDef<"getAll", R>>;
  getById: OperationFn<R, "getById", EffectiveOpDef<"getById", R>>;
  create: OperationFn<R, "create", EffectiveOpDef<"create", R>>;
  update: OperationFn<R, "update", EffectiveOpDef<"update", R>>;
  delete: OperationFn<R, "delete", EffectiveOpDef<"delete", R>>;
} & {
  [K in Exclude<keyof ResourceOpsOf<R>, BuiltinOpName>]: OperationFn<
    R,
    Extract<K, string>,
    ResourceOpsOf<R>[K] & OperationDefinition & OperationExtensions
  >;
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

/**
 * Known `mockConfig.type` ids (empty in Core). Integrations merge ids via
 * `declare module "@apixa/core"`.
 */
export interface MockDatasetIds {}

/**
 * Runtime config: Core root builtins + one runtime resource bag per key of `T`.
 * Type-only `entity` / `list` / `query` (and op `body` / `response` / `query`) are not required.
 */
export type ApiInput<T> = ApiRootConfig & {
  [K in keyof T]: T[K] extends { path: string } ? ResourceRuntimeInput : never;
};

/** @deprecated Prefer ApiInput — kept name for call-site clarity in older docs. */
export type ValidateApiConfig<T> = ApiInput<T>;
