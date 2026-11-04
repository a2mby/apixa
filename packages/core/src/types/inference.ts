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
import type { HttpMethod, PathParams, QueryParams } from "./http.js";
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
 * Default shapes for the 11 builtins added in v0.10.0 — always-on for a resource with `path`,
 * same as the original 5. `getBySlug` / `patch` / `upsert` / `count` / `search` / `createMany` /
 * `deleteMany` are config-object conventions (same inference pipeline as the original 5).
 * `exists` / `findFirst` / `getMany` / `getBy` keep their public function signatures while each
 * executes its own resolved request.
 */
type ExtendedBuiltinOps<R> = {
  getBySlug: { path: "/slug/:slug"; response: EntityOf<R> };
  patch: { path: "/:id"; body: Partial<EntityOf<R>>; response: EntityOf<R> };
  upsert: { path: "/:id"; body: Partial<EntityOf<R>>; response: EntityOf<R> };
  count: { path: "/count"; response: number; query: QueryOf<R> };
  search: { path: "/search"; response: ListOf<R>; query: QueryOf<R> };
  createMany: { path: "/bulk"; body: CreateOf<R>[]; response: EntityOf<R>[] };
  deleteMany: { path: "/bulk"; body: (string | number)[]; response: void };
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

type Conventions = typeof import("../operation/conventions.js").BUILTIN_CONVENTIONS;
type DefaultPath<Name extends string> = Name extends keyof Conventions
  ? Conventions[Name]["path"]
  : "";

export type EffectivePath<Name extends string, Op> = Op extends { path: infer P }
  ? P extends string
    ? P
    : DefaultPath<Name>
  : DefaultPath<Name>;

type ResourcePathOf<R> = R extends { path: infer P } ? (P extends string ? P : "") : "";
type TrimTrailingSlash<S extends string> = S extends `${infer R}/` ? TrimTrailingSlash<R> : S;

export type ConcatPaths<Base extends string, Rel extends string> = Rel extends ""
  ? TrimTrailingSlash<Base>
  : Rel extends `http://${string}` | `https://${string}`
    ? Rel
    : Rel extends `/${string}`
      ? `${TrimTrailingSlash<Base>}${Rel}`
      : `${TrimTrailingSlash<Base>}/${Rel}`;

export type FullPath<R, Name extends string, Op> =
  ResourcePathOf<R> extends infer Base
    ? Base extends string
      ? string extends Base
        ? EffectivePath<Name, Op>
        : ConcatPaths<Base, EffectivePath<Name, Op>>
      : EffectivePath<Name, Op>
    : EffectivePath<Name, Op>;

type PathParamName<T extends string> = T extends `http://${infer Rest}` | `https://${infer Rest}`
  ? Rest extends `${string}/${infer Path}`
    ? PathParamName<`/${Path}`>
    : never
  : T extends `${string}:${infer Param}/${infer Rest}`
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
type InferQuery<Name extends string, Op, Meta> = Op extends { query: infer Q }
  ? Q
  : Name extends "getAll"
    ? QueryOf<Meta>
    : QueryParams;
type DefaultMethod<Name extends string> = Name extends keyof Conventions
  ? Conventions[Name]["method"]
  : never;
type BodyMethod = "POST" | "PUT" | "PATCH";
type HasBody<Name extends string, Op> = Op extends { hasBody: infer H }
  ? H
  : Name extends "deleteMany"
    ? true
    : (Op extends { method: infer M } ? M : DefaultMethod<Name>) extends BodyMethod
      ? true
      : false;
type InferBody<Op> = Op extends { body: infer B } ? B : unknown;

export type CallResult<Data, O> = [O] extends [undefined]
  ? Data
  : O extends { full: true }
    ? ApiResponse<Data>
    : Data;

type OperationFn<R, Name extends string, Op, Meta> = BuildOperationFn<
  PathArity<FullPath<R, Name, Op>>,
  PathParamsOf<FullPath<R, Name, Op>>,
  HasBody<Name, Op> extends true ? InferBody<Op> : undefined,
  InferResponse<Op>,
  InferQuery<Name, Op, Meta>
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
    : Override extends true
      ? Base
      : Override extends (...args: never[]) => unknown
        ? StripCtx<Override>
        : Base extends (...args: never[]) => unknown
          ? Base
          : Omit<Base, keyof Override> & Override;

/** Non-disabled runtime operation entries. */
export type ResourceOpsOf<R> = R extends { operations: infer Ops }
  ? Ops extends Record<string, unknown>
    ? { [K in keyof Ops as Ops[K] extends false ? never : K]-?: Exclude<Ops[K], false | undefined> }
    : {}
  : {};
type RawOperations<R> = R extends { operations: infer Ops } ? Ops : {};
type MetaOperation<Meta, Name extends string> = Meta extends { operations?: infer Ops }
  ? Name extends keyof NonNullable<Ops>
    ? NonNullable<Ops>[Name]
    : never
  : never;
type PayloadFields<Op> = Op extends object
  ? Pick<Op, Extract<keyof Op, "body" | "response" | "query">>
  : {};
type ApplyPayload<Base, Meta, Name extends string> = Base extends (...args: never[]) => unknown
  ? Base
  : MergeOp<Base, PayloadFields<MetaOperation<Meta, Name>>>;

type GroupChoice<R, Group extends string> = "operationGroups" extends keyof R
  ? Group extends keyof NonNullable<R[keyof R & "operationGroups"]>
    ? NonNullable<R[keyof R & "operationGroups"]>[Group]
    : never
  : never;
type GroupOr<Choice, Fallback> = [Choice] extends [never]
  ? Fallback
  : undefined extends Choice
    ? Exclude<Choice, undefined> | Fallback
    : Choice;
type Convention<Name extends AllBuiltinOpName> = Conventions[Name];
type InitialDefault<R> = "defaultOperations" extends keyof R
  ? R extends { defaultOperations: false }
    ? false
    : R extends { defaultOperations: true }
      ? true
      : boolean
  : true;
type ReadOnlyDefault<R, Name extends AllBuiltinOpName> = "readOnly" extends keyof R
  ? Convention<Name>["access"] extends "write"
    ? R extends { readOnly: true }
      ? false
      : R extends { readOnly: false }
        ? InitialDefault<R>
        : InitialDefault<R> | false
    : InitialDefault<R>
  : InitialDefault<R>;
type FlagDefault<R, Name extends AllBuiltinOpName> = "writeOnly" extends keyof R
  ? Convention<Name>["access"] extends "read"
    ? R extends { writeOnly: true }
      ? false
      : R extends { writeOnly: false }
        ? ReadOnlyDefault<R, Name>
        : ReadOnlyDefault<R, Name> | false
    : ReadOnlyDefault<R, Name>
  : ReadOnlyDefault<R, Name>;
type GroupSelected<R, Name extends AllBuiltinOpName> = GroupOr<
  Convention<Name>["many"] extends true ? GroupChoice<R, "many"> : never,
  GroupOr<
    GroupChoice<R, Convention<Name>["access"]>,
    GroupOr<
      Convention<Name>["extended"] extends true ? GroupChoice<R, "extended"> : never,
      FlagDefault<R, Name>
    >
  >
>;
type Selected<R, Name extends AllBuiltinOpName> = "operations" extends keyof R
  ? R extends { operations: infer Ops }
    ? string extends keyof Ops
      ? boolean
      : Name extends keyof Ops
        ? [Extract<Ops[Name], false>] extends [never]
          ? true
          : [Exclude<Ops[Name], false>] extends [never]
            ? false
            : boolean
        : GroupSelected<R, Name>
    : boolean
  : GroupSelected<R, Name>;
type KnownOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true] ? Name : never;
}[AllBuiltinOpName];
type MaybeOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true | false]
    ? [Selected<R, Name>] extends [true] | [false]
      ? never
      : Name
    : never;
}[AllBuiltinOpName];

type EffectiveOpDef<Name extends AllBuiltinOpName, R, Meta> = ApplyPayload<
  MergeOp<
    AllBuiltinOps<Meta>[Name],
    Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never
  >,
  Meta,
  Name
>;
type RuntimeOperation<R, Name extends string> = Name extends keyof ResourceOpsOf<R>
  ? ResourceOpsOf<R>[Name]
  : never;
type ResourceParamName<R> = PathParamName<ResourcePathOf<R>>;
type ResourceParams<R> = { [K in ResourceParamName<R>]: string | number };
type HasResourceParams<R> = [ResourceParamName<R>] extends [never] ? false : true;
type SpecialClientFn<Name extends string, R, Meta> = Name extends "exists"
  ? HasResourceParams<R> extends true
    ? (id: string | number, params: ResourceParams<R>) => Promise<boolean>
    : (id: string | number) => Promise<boolean>
  : Name extends "getMany"
    ? HasResourceParams<R> extends true
      ? (ids: (string | number)[], params: ResourceParams<R>) => Promise<EntityOf<Meta>[]>
      : (ids: (string | number)[]) => Promise<EntityOf<Meta>[]>
    : Name extends "findFirst"
      ? HasResourceParams<R> extends true
        ? (
            query: QueryOf<Meta> | undefined,
            params: ResourceParams<R>,
          ) => Promise<EntityOf<Meta> | null>
        : (query?: QueryOf<Meta>) => Promise<EntityOf<Meta> | null>
      : Name extends "getBy"
        ? HasResourceParams<R> extends true
          ? (
              fieldOrPath: string,
              value: string | number,
              params: ResourceParams<R>,
            ) => Promise<EntityOf<Meta>>
          : (fieldOrPath: string, value: string | number) => Promise<EntityOf<Meta>>
        : never;
type ClientFnFor<Name extends AllBuiltinOpName, R, Meta> = [RuntimeOperation<R, Name>] extends [
  never,
]
  ? Name extends "exists" | "getMany" | "findFirst" | "getBy"
    ? SpecialClientFn<Name, R, Meta>
    : OperationFn<R, Name, EffectiveOpDef<Name, R, Meta>, Meta>
  : RuntimeOperation<R, Name> extends (...args: never[]) => unknown
    ? StripCtx<RuntimeOperation<R, Name>>
    : Name extends "exists" | "getMany" | "findFirst" | "getBy"
      ? SpecialClientFn<Name, R, Meta>
      : OperationFn<R, Name, EffectiveOpDef<Name, R, Meta>, Meta>;

type CustomOpName<R> = Exclude<keyof ResourceOpsOf<R>, AllBuiltinOpName>;
type CustomClientFn<R, Meta, Name extends CustomOpName<R>> = ResourceOpsOf<R>[Name] extends (
  ...args: never[]
) => unknown
  ? StripCtx<ResourceOpsOf<R>[Name]>
  : OperationFn<
      R,
      Extract<Name, string>,
      ApplyPayload<ResourceOpsOf<R>[Name], Meta, Extract<Name, string>>,
      Meta
    >;

export type EffectiveOps<R, Meta = {}> = {
  [Name in KnownOpName<R>]: EffectiveOpDef<Name, R, Meta>;
} & { [Name in CustomOpName<R>]: ResourceOpsOf<R>[Name] };

/** Runtime config controls method names and paths; metadata controls payload types. */
export type ResourceClient<R extends { path: string } = { path: string }, Meta = R> = {
  [Name in KnownOpName<R>]: ClientFnFor<Name, R, Meta>;
} & { [Name in MaybeOpName<R>]?: ClientFnFor<Name, R, Meta> } & {
  [Name in CustomOpName<R>]: CustomClientFn<R, Meta, Name>;
};

export type ApiClient<Meta, Config = Meta> = {
  [
    K in keyof Config as K extends ReservedApiConfigKey
      ? never
      : Config[K] extends { path: string }
        ? K
        : never
  ]: Config[K] extends { path: string }
    ? ResourceClient<Config[K], K extends keyof Meta ? Meta[K] : {}>
    : never;
};

export type { MockDatasetIds } from "./mock-dataset-ids.js";

/** Require every declared resource at runtime, while allowing extra runtime resources. */
export type ApiInput<T> = ApiRootConfig & { [K in keyof T]: ResourceRuntimeInput };

export type ValidateApiConfig<T> = ApiInput<T>;

/** Metadata for a custom operation cannot expose a method with no runtime implementation. */
type MissingCustomOps<Meta, Config> = {
  [K in keyof Meta]-?: K extends keyof Config
    ? Meta[K] extends { operations: infer M }
      ? M extends object
        ? {
            [Name in Exclude<keyof M, AllBuiltinOpName>]-?: Config[K] extends {
              operations: infer O;
            }
              ? Name extends keyof O
                ? O[Name] extends false
                  ? Name
                  : never
                : Name
              : Name;
          }[Exclude<keyof M, AllBuiltinOpName>]
        : never
      : never
    : never;
}[keyof Meta];
type InvalidFlags<Config> = {
  [K in keyof Config]-?: [Config[K]] extends [never]
    ? never
    : Config[K] extends { readOnly: true; writeOnly: true }
      ? K
      : never;
}[keyof Config];
type InvalidCustomTrue<Config> = {
  [K in keyof Config]-?: Config[K] extends { operations: infer Ops }
    ? Ops extends object
      ? {
          [Name in Exclude<keyof Ops, AllBuiltinOpName>]-?: Ops[Name] extends true ? Name : never;
        }[Exclude<keyof Ops, AllBuiltinOpName>]
      : never
    : never;
}[keyof Config];
type InvalidCustomDefinition<Config> = {
  [K in keyof Config]-?: Config[K] extends { operations: infer Ops }
    ? Ops extends object
      ? {
          [Name in Exclude<keyof Ops, AllBuiltinOpName>]-?: Ops[Name] extends
            false | ((...args: never[]) => unknown) | { method: HttpMethod }
            ? never
            : Name;
        }[Exclude<keyof Ops, AllBuiltinOpName>]
      : never
    : never;
}[keyof Config];

export type ValidateRuntimeConfig<Meta, Config> = [MissingCustomOps<Meta, Config>] extends [never]
  ? [InvalidFlags<Config>] extends [never]
    ? [InvalidCustomTrue<Config>] extends [never]
      ? [InvalidCustomDefinition<Config>] extends [never]
        ? unknown
        : { readonly __invalidCustomDefinition: InvalidCustomDefinition<Config> }
      : { readonly __invalidCustomTrue: InvalidCustomTrue<Config> }
    : { readonly __readOnlyAndWriteOnlyConflict: InvalidFlags<Config> }
  : { readonly __missingCustomOperations: MissingCustomOps<Meta, Config> };

/** A rest tuple keeps literal config inference independent from validation. */
export type ValidationArgs<Meta, Config> =
  unknown extends ValidateRuntimeConfig<Meta, Config>
    ? []
    : [validation: ValidateRuntimeConfig<Meta, Config>];
