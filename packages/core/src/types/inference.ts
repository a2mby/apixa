import type {
  BuiltinHeaders,
  HeadersInitLike,
  HttpMethod,
  PathParams,
  QueryParams,
} from "./http.js";
import type { ApiRootConfig, ReservedApiConfigKey } from "./definition.js";
import type { RetryConfig } from "./retry.js";
import type { RequestOptions } from "./transport.js";

export type BuiltinOpName = "getAll" | "getByID" | "create" | "update" | "delete";

type EntityOf<R> = R extends { entity: infer E } ? E : unknown;

/** Derived create body: `Omit<Entity, "id">` when `entity` is set. */
type CreateOf<R> = R extends { entity: infer E } ? Omit<E, "id"> : unknown;

/** Derived update body: `Partial<Entity>` when `entity` is set. */
type UpdateOf<R> = R extends { entity: infer E } ? Partial<E> : unknown;

type EntityBuiltinOps<R> = {
  getAll: { path: ""; response: EntityOf<R>[] };
  getByID: { path: "/:id"; response: EntityOf<R> };
  create: { path: ""; body: CreateOf<R>; response: EntityOf<R> };
  update: { path: "/:id"; body: UpdateOf<R>; response: EntityOf<R> };
  delete: { path: "/:id"; response: void };
};

type DefaultPath<Name extends string> = Name extends "getByID" | "update" | "delete" ? "/:id" : "";

export type EffectivePath<Name extends string, Op> = Op extends { path: infer P }
  ? P extends string
    ? P
    : DefaultPath<Name>
  : DefaultPath<Name>;

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
type InferBody<Op> = Op extends { body: infer B } ? B : undefined;
type InferQuery<Op> = Op extends { query: infer Q } ? Q : QueryParams;
type HasBody<Op> = Op extends { body: infer B } ? ([B] extends [undefined] ? false : true) : false;

type OperationFn<Name extends string, Op> = BuildOperationFn<
  PathArity<EffectivePath<Name, Op>>,
  PathParamsOf<EffectivePath<Name, Op>>,
  HasBody<Op> extends true ? InferBody<Op> : undefined,
  InferResponse<Op>,
  InferQuery<Op>
>;

type BuildOperationFn<Arity extends 0 | 1 | 2, Params, Body, Result, Query> = [Body] extends [
  undefined,
]
  ? Arity extends 0
    ? (options?: RequestOptions<Query>) => Promise<Result>
    : Arity extends 1
      ? (id: string | number, options?: RequestOptions<Query>) => Promise<Result>
      : (params: Params, options?: RequestOptions<Query>) => Promise<Result>
  : Arity extends 0
    ? (body: Body, options?: RequestOptions<Query>) => Promise<Result>
    : Arity extends 1
      ? (id: string | number, body: Body, options?: RequestOptions<Query>) => Promise<Result>
      : (params: Params, body: Body, options?: RequestOptions<Query>) => Promise<Result>;

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
 * `api.users.getAll` / `getByID` / … without ReturnType hacks.
 */
export type ResourceClient<R = {}> = {
  getAll: OperationFn<"getAll", EffectiveOpDef<"getAll", R>>;
  getByID: OperationFn<"getByID", EffectiveOpDef<"getByID", R>>;
  create: OperationFn<"create", EffectiveOpDef<"create", R>>;
  update: OperationFn<"update", EffectiveOpDef<"update", R>>;
  delete: OperationFn<"delete", EffectiveOpDef<"delete", R>>;
} & {
  [K in Exclude<keyof ResourceOpsOf<R>, BuiltinOpName>]: OperationFn<
    Extract<K, string>,
    ResourceOpsOf<R>[K]
  >;
};

export type ApiClient<T> = {
  [K in keyof T as K extends ReservedApiConfigKey ? never : K]: T[K] extends {
    path: string;
  }
    ? ResourceClient<T[K]>
    : never;
};

type RuntimeOperationValue = {
  method?: HttpMethod;
  path?: string;
  headers?: HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  hasBody?: boolean;
};

/**
 * Known `mockConfig.type` ids. Core ships this empty — it has no built-in knowledge of any
 * dataset. Mock-data integrations (e.g. `@apixa/mocking`) merge their ids in via
 * `declare module "@apixa/core"`, right next to the runtime call that registers the matching
 * preset, so importing a dataset module teaches `mockConfig.type` that id for free.
 */
export interface MockDatasetIds {}

/**
 * Opaque resource mock config for integrations (e.g. `@apixa/mocking`).
 * Core does not execute these — a registered defineApi processor must handle them.
 *
 * `type` autocompletes with any id merged into `MockDatasetIds`, but still accepts an
 * arbitrary string so custom `registerDatasetPreset()` ids type-check too.
 */
export type ResourceMockConfigInput = {
  type: keyof MockDatasetIds | (string & {});
  size?: number;
  pagination?: boolean;
  [key: string]: unknown;
};

type ResourceRuntimeInput<_R> = {
  path: string;
  headers?: BuiltinHeaders | HeadersInitLike;
  timeout?: number;
  retry?: RetryConfig | false;
  /** Runtime overrides / custom ops (value-only). Client typing comes from state `T`. */
  operations?: Record<string, RuntimeOperationValue>;
  /**
   * When true, `@apixa/mocking` must be imported so its processor can intercept this resource.
   * Core never sends mocked resources to the network itself.
   */
  mock?: boolean;
  mockConfig?: ResourceMockConfigInput;
};

/**
 * Runtime config: Core root builtins + one runtime resource bag per key of `T`.
 * Type-only `entity` (and op `body` / `response` / `query`) are not required on the object.
 */
export type ApiInput<T> = ApiRootConfig & {
  [K in keyof T]: T[K] extends { path: string } ? ResourceRuntimeInput<T[K]> : never;
};

/** @deprecated Prefer ApiInput — kept name for call-site clarity in older docs. */
export type ValidateApiConfig<T> = ApiInput<T>;
