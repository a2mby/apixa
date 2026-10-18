import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RequestOptions } from "./transport.js";
import type { ReservedApiConfigKey } from "./definition.js";
import type { Infer, Type } from "./marker.js";

export type BuiltinOpName = "getAll" | "getByID" | "create" | "update" | "delete";

type BuiltinOpDefs = {
  getAll: { path: "" };
  getByID: { path: "/:id" };
  create: { path: ""; body: Type<unknown> };
  update: { path: "/:id"; body: Type<unknown> };
  delete: { path: "/:id" };
};

type DefaultPath<Name extends string> = Name extends "getByID" | "update" | "delete"
  ? "/:id"
  : "";

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

type InferResponse<Op> = Op extends { response: infer R } ? Infer<R> : unknown;
type InferBody<Op> = Op extends { body: infer B } ? Infer<B> : undefined;
type InferQuery<Op> = Op extends { query: infer Q } ? Q : QueryParams;
type HasBody<Op> = Op extends { body: infer B }
  ? [B] extends [undefined]
    ? false
    : true
  : false;

type OperationFn<Name extends string, Op> = BuildOperationFn<
  PathArity<EffectivePath<Name, Op>>,
  PathParamsOf<EffectivePath<Name, Op>>,
  HasBody<Op> extends true ? InferBody<Op> : undefined,
  InferResponse<Op>,
  InferQuery<Op>
>;

type BuildOperationFn<
  Arity extends 0 | 1 | 2,
  Params,
  Body,
  Result,
  Query,
> = [Body] extends [undefined]
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

/** Ensure create/update keep a body argument when overrides omit a `body` marker. */
type WithBuiltinBody<Name, Op> = Name extends "create" | "update"
  ? "body" extends keyof Op
    ? Op
    : Op & { body: Type<unknown> }
  : Op;

type EffectiveOpDef<Name extends BuiltinOpName, Ops> = Name extends keyof Ops
  ? WithBuiltinBody<Name, Ops[Name]>
  : BuiltinOpDefs[Name];

/** Normalize missing / empty `operations` to `{}` for merging. */
export type ResourceOpsOf<R> = R extends { operations: infer Ops }
  ? [keyof Ops & string] extends [never]
    ? {}
    : Ops extends Record<string, unknown>
      ? Ops
      : {}
  : {};

/** Builtins ∪ declared operations; overrides refine individual ops. */
export type EffectiveOps<Ops> = {
  [K in BuiltinOpName]: EffectiveOpDef<K, Ops>;
} & {
  [K in Exclude<keyof Ops, BuiltinOpName>]: Ops[K];
};

/**
 * Resource client with **required** builtin method keys so IDEs complete
 * `api.users.getAll` / `getByID` / … without ReturnType hacks.
 */
export type ResourceClient<Ops = {}> = {
  getAll: OperationFn<"getAll", EffectiveOpDef<"getAll", Ops>>;
  getByID: OperationFn<"getByID", EffectiveOpDef<"getByID", Ops>>;
  create: OperationFn<"create", EffectiveOpDef<"create", Ops>>;
  update: OperationFn<"update", EffectiveOpDef<"update", Ops>>;
  delete: OperationFn<"delete", EffectiveOpDef<"delete", Ops>>;
} & {
  [K in Exclude<keyof Ops, BuiltinOpName>]: OperationFn<Extract<K, string>, Ops[K]>;
};

export type ApiClient<T> = {
  [K in keyof T as K extends ReservedApiConfigKey ? never : K]: T[K] extends {
    path: string;
  }
    ? ResourceClient<ResourceOpsOf<T[K]>>
    : never;
};

type ValidOperationValue = {
  method?: HttpMethod;
  path?: string;
  body?: Type<unknown>;
  response?: Type<unknown>;
  query?: unknown;
  headers?: HeadersInitLike;
  timeout?: number;
};

type ValidResourceValue = {
  path: string;
  headers?: HeadersInitLike;
  timeout?: number;
  operations?: Record<string, ValidOperationValue>;
};

/** Structural check that preserves inferred operation types on `defineApi` input. */
export type ValidateApiConfig<T> = {
  [K in keyof T]: K extends ReservedApiConfigKey
    ? T[K]
    : T[K] extends ValidResourceValue
      ? T[K]
      : ValidResourceValue;
};
