import type { AllBuiltinOpName, OperationFnContext } from "./builtins.js";
import type {
  ApiRootConfig,
  FileFieldOptions,
  OperationDefinition,
  OperationRunDefinition,
  ResourceDefinition,
} from "./definition.js";
import type { PathParams, QueryParams } from "./http.js";
import type { MockDatasetCatalog, MockDatasetId } from "./mock-datasets.js";
import type { KeyCase, TransformKeys } from "./transform.js";
import type {
  ApiResponse,
  BinaryResponseType,
  RequestOptions,
  ResponseType,
  ResponseTypeData,
} from "./transport.js";
import type { OPERATION_METADATA, OperationMetadata } from "../api/metadata.js";

export type { BuiltinOpName, ExtendedBuiltinOpName, AllBuiltinOpName } from "./builtins.js";
export type { MockDatasetIds } from "./mock-datasets.js";
import type { OperationMockHandler } from "./mock-handler.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Conventions = typeof import("../operation/conventions.js").BUILTIN_CONVENTIONS;

// ---------------------------------------------------------------------------------------------
// Mock data → entity type (Part D6). Dataset id → catalog type; array → element; provider →
// resolved element. Anything undeterminable (empty array, any, unknown) becomes `unknown`.
// ---------------------------------------------------------------------------------------------

type Opaque =
  | Date
  | RegExp
  | Blob
  | ArrayBuffer
  | Map<unknown, unknown>
  | Set<unknown>
  | ((...args: never[]) => unknown);

/** Widen literal record values so inline data yields a useful entity (`"Ali"` → `string`). */
export type Widen<T> =
  IsAny<T> extends true
    ? unknown
    : T extends string
      ? string
      : T extends number
        ? number
        : T extends boolean
          ? boolean
          : T extends bigint
            ? bigint
            : T extends Opaque
              ? T
              : T extends readonly (infer E)[]
                ? Widen<E>[]
                : T extends object
                  ? { -readonly [K in keyof T]: Widen<T[K]> }
                  : T;

type AllKeys<U> = U extends unknown ? keyof U : never;
type ValueAt<U, K extends PropertyKey> = U extends unknown
  ? K extends keyof U
    ? U[K]
    : never
  : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Merge a union of record shapes into one entity (keys missing from some records become
 * optional), so `[{ id: 1, a: "x" }, { id: 2, a: "y" }]` infers `{ id: number; a: string }`.
 */
export type MergeRecords<T> = [T] extends [Opaque]
  ? T
  : [T] extends [readonly (infer A)[]]
    ? MergeRecords<A>[]
    : [T] extends [object]
      ? Simplify<
          { [K in Extract<keyof T, PropertyKey>]: MergeRecords<ValueAt<T, K>> } & {
            [K in Exclude<AllKeys<T>, keyof T>]?: MergeRecords<ValueAt<T, K>>;
          }
        >
      : T;

type ElementOf<A> =
  IsAny<A> extends true
    ? unknown
    : A extends readonly (infer E)[]
      ? [E] extends [never]
        ? unknown
        : IsAny<E> extends true
          ? unknown
          : unknown extends E
            ? unknown
            : MergeRecords<Widen<E>>
      : unknown;

type MockDataOf<M> = M extends { data: infer D } ? D : M;

export type MockEntityOf<M> =
  MockDataOf<M> extends infer D
    ? D extends MockDatasetId
      ? MockDatasetCatalog[D]["entity"]
      : D extends readonly unknown[]
        ? ElementOf<D>
        : D extends (...args: never[]) => infer Ret
          ? ElementOf<Awaited<Ret>>
          : unknown
    : unknown;

export type MockIdKeyOf<M> = M extends { idKey: infer K extends string }
  ? K
  : MockDataOf<M> extends infer D
    ? D extends MockDatasetId
      ? MockDatasetCatalog[D]["idKey"]
      : "id"
    : "id";

// ---------------------------------------------------------------------------------------------
// Resource typing context: runtime config R + metadata Meta + inherited root transforms.
// ---------------------------------------------------------------------------------------------

/** Inherited root settings that affect resource types. */
export interface RootTypes {
  requestKeys: KeyCase | undefined;
  responseKeys: KeyCase | undefined;
}

type KeysOf<C, Dir extends "request" | "response"> = C extends {
  transforms: { [P in Dir]: { keys: infer K extends KeyCase } };
}
  ? K
  : undefined;

export type RootTypesOf<Config> = {
  requestKeys: KeysOf<Config, "request">;
  responseKeys: KeysOf<Config, "response">;
};

type ResponseKeys<R, Root extends RootTypes> =
  KeysOf<R, "response"> extends KeyCase ? KeysOf<R, "response"> : Root["responseKeys"];

type HasMock<R> = R extends { mock: infer M } ? ([M] extends [undefined] ? false : true) : false;

/** Entity as stored / returned by the backend (or mock data), before response transforms. */
type SourceEntity<R, Meta> = Meta extends { entity: infer E }
  ? [undefined] extends [E]
    ? R extends { mock: infer M }
      ? MockEntityOf<M>
      : unknown
    : E
  : R extends { mock: infer M }
    ? MockEntityOf<M>
    : unknown;

/** Public entity: source entity with the configured response key convention applied. */
export type EntityOf<R, Meta, Root extends RootTypes = RootTypes> = TransformKeys<
  SourceEntity<R, Meta>,
  ResponseKeys<R, Root>
>;

type IdKey<R> = R extends { mock: infer M } ? MockIdKeyOf<M> : "id";
type PublicIdKey<R, Root extends RootTypes> =
  ResponseKeys<R, Root> extends KeyCase
    ? import("./transform.js").ConvertKey<IdKey<R>, ResponseKeys<R, Root> & KeyCase>
    : IdKey<R>;

/** Identity type from the entity's id field; `string | number` when unknown. */
export type IdOf<R, Meta, Root extends RootTypes = RootTypes> =
  SourceEntity<R, Meta> extends infer E
    ? unknown extends E
      ? string | number
      : IdKey<R> extends keyof E
        ? E[IdKey<R>] extends string | number
          ? E[IdKey<R>]
          : string | number
        : string | number
    : string | number;

type Known<T> = unknown extends T ? false : true;

/** `create` body: the public entity with its id optional. */
type CreateOf<R, Meta, Root extends RootTypes> =
  EntityOf<R, Meta, Root> extends infer E
    ? Known<E> extends true
      ? PublicIdKey<R, Root> extends keyof E
        ? Simplify<Omit<E, PublicIdKey<R, Root>> & Partial<Pick<E, PublicIdKey<R, Root>>>>
        : E
      : unknown
    : unknown;

type UpdateOf<R, Meta, Root extends RootTypes> =
  EntityOf<R, Meta, Root> extends infer E
    ? Known<E> extends true
      ? Partial<E>
      : unknown
    : unknown;

// ---------------------------------------------------------------------------------------------
// File fields: reads keep the entity's `string` / `string[]`; eligible write inputs swap those
// fields for native `File | Blob` values. Names refer to the public entity (post response keys).
// ---------------------------------------------------------------------------------------------

type FileInput = File | Blob;

/** Declared file-field names of a resource config; `never` when absent or not a literal. */
type FileNamesOf<R> = R extends { fileFields: infer F }
  ? F extends readonly (infer N)[]
    ? Extract<N, string>
    : F extends object
      ? Extract<keyof F, string>
      : never
  : never;

/** File fields that apply to builtin `Name`: none when that operation forces `dataFormat: "json"`. */
type FileNamesFor<R, Name extends string> = [FileNamesOf<R>] extends [never]
  ? never
  : string extends FileNamesOf<R>
    ? never
    : Name extends keyof ResourceOpsOf<R>
      ? ResourceOpsOf<R>[Name] extends { dataFormat: "json" }
        ? never
        : FileNamesOf<R>
      : FileNamesOf<R>;

/** `string` → file, `string[]` → file array; `null` / `undefined` stay. */
type FileInputOf<V> = V extends string
  ? FileInput
  : V extends readonly string[]
    ? readonly FileInput[]
    : V;

type WithFileInputs<Body, Names extends string> = [Names] extends [never]
  ? Body
  : Known<Body> extends true
    ? Simplify<{ [K in keyof Body]: K extends Names ? FileInputOf<Body[K]> : Body[K] }>
    : Body;

/** Entity keys whose type can hold a file reference (`string`, `string[]`, optionally nullable). */
type FileFieldCandidates<E> = {
  [K in keyof E & string]-?: [NonNullable<E[K]>] extends [never]
    ? never
    : [NonNullable<E[K]>] extends [string | readonly string[]]
      ? K
      : never;
}[keyof E & string];

/** `getAll` element list: metadata `list`, else entity array. */
export type ListOf<R, Meta = {}, Root extends RootTypes = RootTypes> = Meta extends {
  list: infer L;
}
  ? [undefined] extends [L]
    ? EntityOf<R, Meta, Root>[]
    : TransformKeys<L, ResponseKeys<R, Root>>
  : EntityOf<R, Meta, Root>[];

export type QueryOf<Meta> = Meta extends { query: infer Q }
  ? [undefined] extends [Q]
    ? QueryParams
    : Q
  : QueryParams;

type Pagination<R> = R extends { pagination: infer P extends "page" | "cursor" } ? P : undefined;

/** Shared live/mock pagination contract (Part E26). */
export type PaginatedListOf<R, Meta = {}, Root extends RootTypes = RootTypes> =
  Pagination<R> extends "page"
    ? { data: ListOf<R, Meta, Root>; total: number; page: number; pageSize: number }
    : Pagination<R> extends "cursor"
      ? { data: ListOf<R, Meta, Root>; nextCursor: string | null }
      : ListOf<R, Meta, Root>;

export type PaginationQueryOf<R, Meta> =
  Pagination<R> extends "page"
    ? QueryOf<Meta> & { page?: number; pageSize?: number }
    : Pagination<R> extends "cursor"
      ? QueryOf<Meta> & { cursor?: string; pageSize?: number }
      : QueryOf<Meta>;

/** Filter object for `findFirst` / `search`: known entity fields, else generic query params. */
type FilterOf<R, Meta, Root extends RootTypes> = Meta extends { query: infer Q }
  ? [undefined] extends [Q]
    ? DefaultFilter<R, Meta, Root>
    : Q
  : DefaultFilter<R, Meta, Root>;
type DefaultFilter<R, Meta, Root extends RootTypes> =
  EntityOf<R, Meta, Root> extends infer E
    ? Known<E> extends true
      ? Partial<E> & QueryParams
      : QueryParams
    : QueryParams;

// ---------------------------------------------------------------------------------------------
// Operation shapes and signatures.
// ---------------------------------------------------------------------------------------------

type EntityBuiltinOps<R, Meta, Root extends RootTypes> = {
  getAll: { path: ""; response: PaginatedListOf<R, Meta, Root>; query: PaginationQueryOf<R, Meta> };
  getById: { path: "/:id"; response: EntityOf<R, Meta, Root> };
  create: {
    path: "";
    body: WithFileInputs<CreateOf<R, Meta, Root>, FileNamesFor<R, "create">>;
    response: EntityOf<R, Meta, Root>;
  };
  update: {
    path: "/:id";
    body: WithFileInputs<UpdateOf<R, Meta, Root>, FileNamesFor<R, "update">>;
    response: EntityOf<R, Meta, Root>;
  };
  delete: { path: "/:id"; response: void };
  getBySlug: { path: "/slug/:slug"; response: EntityOf<R, Meta, Root> };
  patch: {
    path: "/:id";
    body: WithFileInputs<UpdateOf<R, Meta, Root>, FileNamesFor<R, "patch">>;
    response: EntityOf<R, Meta, Root>;
  };
  upsert: {
    path: "/:id";
    body: WithFileInputs<UpdateOf<R, Meta, Root>, FileNamesFor<R, "upsert">>;
    response: EntityOf<R, Meta, Root>;
  };
  count: { path: "/count"; response: number; query: QueryOf<Meta> };
  search: { path: "/search"; response: ListOf<R, Meta, Root>; query: FilterOf<R, Meta, Root> };
  createMany: {
    path: "/bulk";
    body: WithFileInputs<CreateOf<R, Meta, Root>, FileNamesFor<R, "createMany">>[];
    response: EntityOf<R, Meta, Root>[];
  };
  deleteMany: { path: "/bulk"; body: IdOf<R, Meta, Root>[]; response: void };
};

/** The function behind a function operation (`fn` or `{ run: fn }`); `never` otherwise. */
type FnOf<Op> = Op extends (...args: never[]) => unknown
  ? Op
  : Op extends { run: infer F extends (...args: never[]) => unknown }
    ? F
    : never;

/** Strip the leading `OperationFnContext` parameter a runtime custom-operation function takes. */
type StripCtx<F> = F extends (ctx: OperationFnContext, ...args: infer A) => infer Ret
  ? (...args: A) => Ret
  : F;

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
  ResourcePathOf<R> extends infer Base extends string
    ? string extends Base
      ? EffectivePath<Name, Op>
      : ConcatPaths<Base, EffectivePath<Name, Op>>
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

/**
 * A literal non-JSON `responseType` on the runtime operation sets its `response` type. Applied
 * after the runtime override and before `defineApi<T>()` metadata, so explicit metadata wins. A
 * widened `ResponseType` (not a literal) leaves the type alone.
 */
type ApplyResponseType<Op> = Op extends { responseType: infer RT extends BinaryResponseType }
  ? [ResponseType] extends [RT]
    ? Op
    : Omit<Op, "response"> & { response: ResponseTypeData<RT> }
  : Op;

/** Data type for one call: a literal non-JSON per-call `responseType` replaces `Data`. */
type CallData<Data, O> = O extends { responseType: infer RT extends ResponseType }
  ? [ResponseType] extends [RT]
    ? Data
    : DataFor<Data, RT>
  : Data;
type DataFor<Data, RT> = RT extends BinaryResponseType ? ResponseTypeData<RT> : Data;
type InferQuery<Op> = Op extends { query: infer Q } ? Q : QueryParams;
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
    ? ApiResponse<CallData<Data, O>>
    : CallData<Data, O>;

type BuildOperationFn<
  Arity extends 0 | 1 | 2,
  Id,
  Params,
  Body,
  Result,
  Query,
> = unknown extends Body
  ? OptionalBodyFn<Arity, Id, Params, Result, Query>
  : RequiredBodyFn<Arity, Id, Params, Body, Result, Query>;

/** No declared body type (e.g. a custom POST): the body may be omitted. */
type OptionalBodyFn<Arity extends 0 | 1 | 2, Id, Params, Result, Query> = Arity extends 0
  ? <O extends RequestOptions<Query> | undefined = undefined>(
      body?: unknown,
      options?: O | RequestOptions<Query>,
    ) => Promise<CallResult<Result, O>>
  : Arity extends 1
    ? <O extends RequestOptions<Query> | undefined = undefined>(
        id: Id,
        body?: unknown,
        options?: O | RequestOptions<Query>,
      ) => Promise<CallResult<Result, O>>
    : <O extends RequestOptions<Query> | undefined = undefined>(
        params: Params,
        body?: unknown,
        options?: O | RequestOptions<Query>,
      ) => Promise<CallResult<Result, O>>;

type RequiredBodyFn<Arity extends 0 | 1 | 2, Id, Params, Body, Result, Query> = [Body] extends [
  undefined,
]
  ? Arity extends 0
    ? <O extends RequestOptions<Query> | undefined = undefined>(
        options?: O | RequestOptions<Query>,
      ) => Promise<CallResult<Result, O>>
    : Arity extends 1
      ? <O extends RequestOptions<Query> | undefined = undefined>(
          id: Id,
          options?: O | RequestOptions<Query>,
        ) => Promise<CallResult<Result, O>>
      : <O extends RequestOptions<Query> | undefined = undefined>(
          params: Params,
          options?: O | RequestOptions<Query>,
        ) => Promise<CallResult<Result, O>>
  : Arity extends 0
    ? <O extends RequestOptions<Query> | undefined = undefined>(
        body: Body,
        options?: O | RequestOptions<Query>,
      ) => Promise<CallResult<Result, O>>
    : Arity extends 1
      ? <O extends RequestOptions<Query> | undefined = undefined>(
          id: Id,
          body: Body,
          options?: O | RequestOptions<Query>,
        ) => Promise<CallResult<Result, O>>
      : <O extends RequestOptions<Query> | undefined = undefined>(
          params: Params,
          body: Body,
          options?: O | RequestOptions<Query>,
        ) => Promise<CallResult<Result, O>>;

type SignatureOf<R, Name extends string, Op, Id> = BuildOperationFn<
  PathArity<FullPath<R, Name, Op>>,
  PathParamName<FullPath<R, Name, Op>> extends "id" ? Id : string | number,
  PathParamsOf<FullPath<R, Name, Op>>,
  HasBody<Name, Op> extends true ? InferBody<Op> : undefined,
  InferResponse<Op>,
  InferQuery<Op>
>;

type MergeOp<Base, Override> = [Override] extends [never]
  ? Base
  : [Override] extends [undefined]
    ? Base
    : Override extends true
      ? Base
      : [FnOf<Override>] extends [never]
        ? Omit<Base, keyof Override> & Override
        : StripCtx<FnOf<Override>>;

/** Non-disabled runtime operation entries. */
export type ResourceOpsOf<R> = R extends { operations: infer Ops }
  ? Ops extends Record<string, unknown>
    ? { [K in keyof Ops as Ops[K] extends false ? never : K]-?: Exclude<Ops[K], false | undefined> }
    : {}
  : {};

type MetaOperation<Meta, Name extends string> = Meta extends { operations?: infer Ops }
  ? Name extends keyof NonNullable<Ops>
    ? NonNullable<Ops>[Name]
    : never
  : never;
type PayloadFields<Op, R, Root extends RootTypes> = Op extends object
  ? {
      [K in Extract<keyof Op, "body" | "response" | "query">]: K extends "response"
        ? TransformKeys<Op[K], ResponseKeys<R, Root>>
        : Op[K];
    }
  : {};
type ApplyPayload<Base, Meta, Name extends string, R, Root extends RootTypes> = Base extends (
  ...args: never[]
) => unknown
  ? Base
  : MergeOp<Base, PayloadFields<MetaOperation<Meta, Name>, R, Root>>;

// ---- operation selection (mirrors operation/expand.ts exactly) ----

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
          ? [Extract<Ops[Name], undefined>] extends [never]
            ? true
            : GroupSelected<R, Name> | true
          : [Exclude<Ops[Name], false>] extends [never]
            ? false
            : boolean
        : GroupSelected<R, Name>
    : boolean
  : GroupSelected<R, Name>;
/** Builtin names that are certainly present for a resource config (groups, flags, `operations`). */
export type KnownOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true] ? Name : never;
}[AllBuiltinOpName];
/** Builtin names that may be present (config is not narrow enough to decide). */
export type MaybeOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true] | [false] ? never : Name;
}[AllBuiltinOpName];

type EffectiveOpDef<Name extends AllBuiltinOpName, R, Meta, Root extends RootTypes> = ApplyPayload<
  ApplyResponseType<
    MergeOp<
      EntityBuiltinOps<R, Meta, Root>[Name & keyof EntityBuiltinOps<R, Meta, Root>],
      Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never
    >
  >,
  Meta,
  Name,
  R,
  Root
>;
type RuntimeOperation<R, Name extends string> = Name extends keyof ResourceOpsOf<R>
  ? ResourceOpsOf<R>[Name]
  : never;

type ResourceParamName<R> = PathParamName<ResourcePathOf<R>>;
type ResourceParams<R> = { [K in ResourceParamName<R>]: string | number };
type HasResourceParams<R> = [ResourceParamName<R>] extends [never] ? false : true;
type WithParams<R, Args extends unknown[], Ret> =
  HasResourceParams<R> extends true
    ? (...args: [...Args, params: ResourceParams<R>, options?: RequestOptions]) => Promise<Ret>
    : (...args: [...Args, options?: RequestOptions]) => Promise<Ret>;

type SpecialClientFn<Name extends string, R, Meta, Root extends RootTypes> = Name extends "exists"
  ? WithParams<R, [id: IdOf<R, Meta, Root>], boolean>
  : Name extends "getMany"
    ? WithParams<R, [ids: IdOf<R, Meta, Root>[]], EntityOf<R, Meta, Root>[]>
    : Name extends "findFirst"
      ? HasResourceParams<R> extends true
        ? (
            query: FilterOf<R, Meta, Root> | undefined,
            params: ResourceParams<R>,
            options?: RequestOptions,
          ) => Promise<EntityOf<R, Meta, Root> | null>
        : (
            query?: FilterOf<R, Meta, Root>,
            options?: RequestOptions,
          ) => Promise<EntityOf<R, Meta, Root> | null>
      : Name extends "getBy"
        ? WithParams<R, [fieldOrPath: string, value: string | number], EntityOf<R, Meta, Root>>
        : never;

type SpecialName = "exists" | "getMany" | "findFirst" | "getBy";

type ClientFnFor<Name extends AllBuiltinOpName, R, Meta, Root extends RootTypes> = [
  FnOf<RuntimeOperation<R, Name>>,
] extends [never]
  ? BuiltinFn<Name, R, Meta, Root>
  : StripCtx<FnOf<RuntimeOperation<R, Name>>>;
type BuiltinFn<
  Name extends AllBuiltinOpName,
  R0,
  Meta,
  Root extends RootTypes,
  R = WithOpTransforms<R0, RuntimeOperation<R0, Name>>,
> = Name extends SpecialName
  ? SpecialClientFn<Name, R, Meta, Root>
  : SignatureOf<R, Name, EffectiveOpDef<Name, R, Meta, Root>, IdOf<R, Meta, Root>>;

/** An operation-level `transforms.response` overrides resource and root for that operation's types. */
type WithOpTransforms<R, Op> = [Op] extends [never]
  ? R
  : Op extends { transforms: { response: { keys: infer K extends KeyCase } } }
    ? Omit<R, "transforms"> & { transforms: { response: { keys: K } } }
    : R;
type CustomOpName<R> = Exclude<keyof ResourceOpsOf<R>, AllBuiltinOpName>;
type CustomClientFn<R, Meta, Root extends RootTypes, Name extends CustomOpName<R>> = [
  FnOf<ResourceOpsOf<R>[Name]>,
] extends [never]
  ? SignatureOf<
      WithOpTransforms<R, ResourceOpsOf<R>[Name]>,
      Extract<Name, string>,
      ApplyPayload<
        ApplyResponseType<ResourceOpsOf<R>[Name]>,
        Meta,
        Extract<Name, string>,
        WithOpTransforms<R, ResourceOpsOf<R>[Name]>,
        Root
      >,
      IdOf<R, Meta, Root>
    >
  : StripCtx<FnOf<ResourceOpsOf<R>[Name]>>;

/** Read/write classification of one operation: builtin convention, else required custom `kind`. */
export type OperationKindOf<R, Name> = Name extends AllBuiltinOpName
  ? Conventions[Name]["access"]
  : Name extends keyof ResourceOpsOf<R>
    ? ResourceOpsOf<R>[Name] extends { kind: infer Kind extends "read" | "write" }
      ? Kind
      : never
    : never;

/** Typed view of the non-enumerable metadata every resource client carries. */
export type OperationMetadataBrand<R> = {
  readonly [OPERATION_METADATA]: {
    readonly [Name in KnownOpName<R> | CustomOpName<R>]: OperationMetadata<
      OperationKindOf<R, Name>
    >;
  } & {
    readonly [Name in MaybeOpName<R>]?: OperationMetadata<OperationKindOf<R, Name>>;
  };
};

/** Operation-name → `"read" | "write"` map of a resource client type (`never` for non-Apixa objects). */
export type OperationKindsOf<Client> = Client extends {
  readonly [OPERATION_METADATA]: infer M;
}
  ? { [K in keyof M]-?: NonNullable<M[K]> extends OperationMetadata<infer Kind> ? Kind : never }
  : never;

declare const mockedResource: unique symbol;
declare const apixaClient: unique symbol;

/** Type-only marker carried by mocked resources (enables `resetMock(api.users)`). */
export type MockedResource = { readonly [mockedResource]: true };

/** Type-only marker carried by every client from `defineApi()` (enables `resetMock(api)`). */
export type ApixaClient = { readonly [apixaClient]: true };

/** Runtime config controls method names and paths; metadata and mock data control payload types. */
export type ResourceClient<
  R extends { path: string } = { path: string },
  Meta = {},
  Root extends RootTypes = RootTypes,
> = {
  [Name in KnownOpName<R>]: ClientFnFor<Name, R, Meta, Root>;
} & { [Name in MaybeOpName<R>]?: ClientFnFor<Name, R, Meta, Root> } & {
  [Name in CustomOpName<R>]: CustomClientFn<R, Meta, Root, Name>;
} & OperationMetadataBrand<R> &
  (HasMock<R> extends true ? MockedResource : {});

type ResourcesOf<Config> = Config extends { resources: infer Res } ? Res : {};

/** Client type: one property per `resources` key in the runtime config. */
export type ApiClient<Meta, Config> = {
  readonly [K in keyof ResourcesOf<Config>]: ResourcesOf<Config>[K] extends { path: string }
    ? ResourceClient<
        ResourcesOf<Config>[K],
        K extends keyof Meta ? Meta[K] : {},
        RootTypesOf<Config>
      >
    : never;
} & ApixaClient;

export type ApisClient<Defs, Configs> = {
  readonly [K in keyof Configs]: ApiClient<K extends keyof Defs ? Defs[K] : {}, Configs[K]>;
};

// ---------------------------------------------------------------------------------------------
// Input constraints and compile-time validation (exact keys, metadata/runtime agreement).
// ---------------------------------------------------------------------------------------------

/** `defineApi()` input with no metadata. */
export type InferredApiInput = ApiRootConfig;

/** `defineApi<T>()` input: every resource declared in `T` must exist under `resources`. */
export type ApiInput<T> = Omit<ApiRootConfig, "resources"> & {
  resources: { [K in keyof T]: ResourceDefinition } & Record<string, ResourceDefinition>;
};

export type InferredApisInput = Record<string, InferredApiInput>;
export type ApisInput<Defs> = { [K in keyof Defs]: ApiInput<Defs[K]> } & Record<
  string,
  InferredApiInput
>;

/** Error marker. An object type (not a literal) so intersections never collapse to `never`. */
export type ConfigTypeError<Message extends string> = { readonly "apixa config error": Message };

type Exact<T, Shape> = {
  [K in Exclude<keyof T, keyof Shape>]: ConfigTypeError<`Unknown option "${K & string}"`>;
};

type RequiredKind<M> = M extends "GET" | "HEAD" | "OPTIONS" ? "read" : "write";
type ValidateMethodKind<Name, Op> = Op extends { method: infer Method extends string }
  ? Name extends AllBuiltinOpName
    ? RequiredKind<Method> extends Conventions[Name]["access"]
      ? unknown
      : {
          method: ConfigTypeError<`HTTP method "${Method}" conflicts with builtin "${Name & string}" kind`>;
        }
    : Op extends { kind: infer Kind }
      ? Kind extends RequiredKind<Method>
        ? unknown
        : {
            method: ConfigTypeError<`HTTP method "${Method}" requires kind "${RequiredKind<Method>}"`>;
          }
      : unknown
  : unknown;

type EffectiveKind<Name, Op> = Name extends AllBuiltinOpName
  ? Conventions[Name]["access"]
  : Op extends { kind: infer Kind }
    ? Kind
    : never;
type ValidateIdempotency<Name, Op> = Op extends { idempotency: infer I }
  ? [I] extends [false | undefined]
    ? unknown
    : [EffectiveKind<Name, Op>] extends ["write"]
      ? unknown
      : { idempotency: ConfigTypeError<`idempotency is only for write operations`> }
  : unknown;

type ValidateDataFormat<Name, Op> = Op extends { dataFormat: unknown }
  ? [EffectiveKind<Name, Op>] extends ["write"]
    ? unknown
    : { dataFormat: ConfigTypeError<`dataFormat is only for write operations`> }
  : unknown;

type ValidateOperation<Name, Op> = Op extends (...args: never[]) => unknown
  ? Name extends AllBuiltinOpName
    ? unknown
    : ConfigTypeError<`custom function operation "${Name & string}" requires { kind, run }`>
  : Name extends AllBuiltinOpName
    ? Op extends { kind: unknown }
      ? {
          kind: ConfigTypeError<`builtin "${Name & string}" has a fixed kind; kind is for custom operations`>;
        }
      : ValidateOperationShape<Name, Op>
    : ValidateOperationShape<Name, Op>;

type ValidateOperationShape<Name, Op> = Op extends { run: unknown }
  ? Exact<Op, { kind: unknown; run: unknown }> &
      (Name extends AllBuiltinOpName
        ? unknown
        : Op extends { kind: "read" | "write" }
          ? unknown
          : {
              kind: ConfigTypeError<`custom operation "${Name & string}" requires kind "read" or "write"`>;
            })
  : Op extends true
    ? Name extends AllBuiltinOpName
      ? unknown
      : ConfigTypeError<`true cannot create custom operation "${Name & string}"; give it { method, path } or a function`>
    : Op extends object
      ? Exact<Op, OperationDefinition> &
          (Name extends AllBuiltinOpName
            ? Op extends { mock: unknown }
              ? {
                  mock: ConfigTypeError<`builtin "${Name & string}" is simulated by Core; mock is for custom operations`>;
                }
              : unknown
            : unknown) &
          ValidateMethodKind<Name, Op> &
          ValidateIdempotency<Name, Op> &
          ValidateDataFormat<Name, Op> &
          (Name extends AllBuiltinOpName
            ? unknown
            : (Op extends { method: string }
                ? unknown
                : {
                    method: ConfigTypeError<`custom operation "${Name & string}" needs a method`>;
                  }) &
                (Op extends { kind: "read" | "write" }
                  ? unknown
                  : {
                      kind: ConfigTypeError<`custom operation "${Name & string}" requires kind "read" or "write"`>;
                    }))
      : unknown;

/**
 * Metadata operations with no runtime definition. While a context-sensitive function (a custom
 * `run` or `mock` handler) is being checked, `R` is still the open `ResourceDefinition` constraint
 * (its `path` is `string`, not a literal), so nothing can be reported as missing yet.
 */
type MissingCustomOps<Meta, R> = Meta extends { operations: infer M }
  ? R extends { path: infer P }
    ? string extends P
      ? never
      : Exclude<keyof M, AllBuiltinOpName | keyof ResourceOpsOf<R>>
    : Exclude<keyof M, AllBuiltinOpName | keyof ResourceOpsOf<R>>
  : never;

type ValidateMock<M, Meta> = M extends { data: infer D }
  ? Exact<M, { data: unknown; idKey: unknown; seed: unknown }> &
      (M extends { seed: infer S }
        ? { seed: Exact<S, { limit: unknown; offset: unknown }> }
        : unknown) &
      (M extends { idKey: infer K }
        ? Known<MockEntityOf<D>> extends true
          ? K extends keyof MockEntityOf<D>
            ? unknown
            : { idKey: ConfigTypeError<`idKey must be a field of the mock records`> }
          : unknown
        : unknown) &
      MockMatchesMeta<M, Meta>
  : MockMatchesMeta<M, Meta>;

type MockMatchesMeta<M, Meta> = Meta extends { entity: infer E }
  ? [undefined] extends [E]
    ? unknown
    : Known<MockEntityOf<M>> extends true
      ? MockEntityOf<M> extends E
        ? unknown
        : ConfigTypeError<"mock data does not match the declared entity type">
      : unknown
  : unknown;

/**
 * `fileFields` against the public entity. Array form: each name must be a file-capable entity key
 * (also gives autocomplete). Object form: same keys, options checked exactly. An entity that is not
 * known (no metadata / untyped mock) cannot be checked.
 */
type ValidateFileFields<F, E> =
  Known<E> extends true
    ? F extends readonly unknown[]
      ? readonly FileFieldCandidates<E>[]
      : {
          [K in keyof F]: K extends FileFieldCandidates<E>
            ? Exact<F[K], FileFieldOptions> & FileFieldOptions
            : ConfigTypeError<`"${K & string}" is not a string or string[] field of the entity`>;
        }
    : unknown;

type ValidateResource<R, Meta, Root extends RootTypes> = Exact<R, ResourceDefinition> &
  (R extends { readOnly: true; writeOnly: true }
    ? { writeOnly: ConfigTypeError<"readOnly and writeOnly cannot both be true"> }
    : unknown) &
  (R extends { operations: infer Ops }
    ? {
        operations: { [O in keyof Ops]: ValidateOperation<O, Ops[O]> } & {
          [
            O in MissingCustomOps<Meta, R>
          ]: ConfigTypeError<"declared in metadata but not defined in runtime operations">;
        };
      }
    : [MissingCustomOps<Meta, R>] extends [never]
      ? unknown
      : {
          operations: {
            [
              O in MissingCustomOps<Meta, R>
            ]: ConfigTypeError<"declared in metadata but not defined in runtime operations">;
          };
        }) &
  (R extends { mock: infer M } ? { mock: ValidateMock<M, Meta> } : unknown) &
  (R extends { fileFields: infer F }
    ? { fileFields: ValidateFileFields<F, EntityOf<R, Meta, Root>> }
    : unknown) &
  (R extends { transforms: infer T }
    ? { transforms: Exact<T, { request: unknown; response: unknown }> }
    : unknown);

/** Compile-time checks applied on top of the inferred config (`Config & ValidateConfig<…>`). */
export type ValidateConfig<Meta, Config> = Exact<Config, ApiRootConfig> &
  (Config extends { resources: infer Res }
    ? {
        resources: {
          [K in keyof Res]: ValidateResource<
            Res[K],
            K extends keyof Meta ? Meta[K] : {},
            RootTypesOf<Config>
          >;
        };
      }
    : unknown) &
  (Config extends { transforms: infer T }
    ? { transforms: Exact<T, { request: unknown; response: unknown }> }
    : unknown) &
  (Config extends { middleware: infer M }
    ? { middleware: Exact<M, { onRequest: unknown; onResponse: unknown; onError: unknown }> }
    : unknown);

export type ValidateApisConfig<Defs, Configs> = {
  [K in keyof Configs]: ValidateConfig<K extends keyof Defs ? Defs[K] : {}, Configs[K]>;
};

// ---------------------------------------------------------------------------------------------
// Custom declarative `mock` handlers: typed from the resource's mock records and the operation's
// path. The handler sits inside the context-sensitive config object, so TypeScript cannot infer
// anything *from* that object until the handler is checked. `defineApi` therefore captures the
// leaves it needs (mock source, resource path, operation paths) through separate type
// parameters that only read non-function members, and types the handler from those.
// ---------------------------------------------------------------------------------------------

// Real keys (not an index signature) so object literals keep their literal `kind` / `method` types.
/** `true`, `false` and function operations carry no path or mock handler. */
// `Function` has no call signature, so it never competes with `OperationFn` for contextual typing.
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NonObjectOp = boolean | Function;
// `run` repeats the real `OperationFn` so a function operation keeps its contextual parameter types.
type OpShape = Omit<OperationDefinition, "path" | "mock"> & { run?: OperationRunDefinition["run"] };
type ResShape<Except extends keyof ResourceDefinition> = Omit<ResourceDefinition, Except>;

/** Inference sites only: they read `mock`, `path` and operation `path` leaves of the config. */
export type HandlerCapture<
  M extends Record<string, unknown>,
  RP extends Record<string, unknown>,
  OP extends Record<string, Record<string, unknown>>,
> = {
  resources?: { [K in keyof M]: { mock?: M[K] } & ResShape<"mock"> };
} & {
  resources?: { [K in keyof RP]: { path?: RP[K] } & ResShape<"path"> };
} & {
  resources?: {
    [K in keyof OP]: {
      operations?: { [O in keyof OP[K]]: ({ path?: OP[K][O] } & OpShape) | NonObjectOp };
    } & ResShape<"operations">;
  };
};

/** Raw mock records of a resource (`Record<string, unknown>` when they cannot be inferred). */
type HandlerEntity<Mock> = [unknown] extends [Mock]
  ? Record<string, unknown>
  : MockEntityOf<Mock> extends infer E
    ? [unknown] extends [E]
      ? Record<string, unknown>
      : E extends object
        ? E
        : Record<string, unknown>
    : never;

type HandlerState<Meta, K, O> = K extends keyof Meta
  ? Meta[K] extends { operations?: infer Ops }
    ? O extends keyof NonNullable<Ops>
      ? NonNullable<Ops>[O]
      : never
    : never
  : never;
type HandlerQuery<P> = [P] extends [never]
  ? Record<string, unknown>
  : P extends { query: infer Q }
    ? Q
    : Record<string, unknown>;
type HandlerBody<P> = [P] extends [never] ? unknown : P extends { body: infer B } ? B : unknown;
type HandlerResult<P> = [P] extends [never]
  ? unknown
  : P extends { response: infer Res }
    ? Res
    : unknown;
type HandlerParams<Base, Rel> = Base extends string
  ? Rel extends string
    ? PathParamsOf<ConcatPaths<Base, Rel>>
    : PathParams
  : PathParams;

/** Types the `mock` handler of every custom declarative operation. Never infers (`NoInfer`). */
export type HandlerOverlay<
  Meta,
  M extends Record<string, unknown>,
  RP extends Record<string, unknown>,
  OP extends Record<string, Record<string, unknown>>,
> = NoInfer<{
  resources?: {
    [K in keyof OP]: ResShape<"operations"> & {
      operations?: {
        [O in keyof OP[K]]: O extends AllBuiltinOpName
          ? unknown
          : | NonObjectOp
            | (OpShape & {
                mock?: OperationMockHandler<
                  K extends keyof M ? HandlerEntity<M[K]> : Record<string, unknown>,
                  HandlerParams<K extends keyof RP ? RP[K] : "", OP[K][O]>,
                  HandlerQuery<HandlerState<Meta, K, O>>,
                  HandlerBody<HandlerState<Meta, K, O>>,
                  HandlerResult<HandlerState<Meta, K, O>>
                >;
              });
      };
    };
  };
}>;

/** `defineApis` version of {@link HandlerCapture}: one more level (client name) on every map. */

/** Client-level options of one `defineApis` entry (everything except `resources`). */
type ClientShape = Omit<ApiRootConfig, "resources">;
export type ApisHandlerCapture<
  M extends Record<string, Record<string, unknown>>,
  RP extends Record<string, Record<string, unknown>>,
  OP extends Record<string, Record<string, Record<string, unknown>>>,
> = {
  [C in keyof M]: ClientShape & {
    resources?: { [K in keyof M[C]]: { mock?: M[C][K] } & ResShape<"mock"> };
  };
} & {
  [C in keyof RP]: ClientShape & {
    resources?: { [K in keyof RP[C]]: { path?: RP[C][K] } & ResShape<"path"> };
  };
} & {
  [C in keyof OP]: ClientShape & {
    resources?: {
      [K in keyof OP[C]]: {
        operations?: {
          [O in keyof OP[C][K]]: ({ path?: OP[C][K][O] } & OpShape) | NonObjectOp;
        };
      } & ResShape<"operations">;
    };
  };
};

/** `defineApis` version of {@link HandlerOverlay}. Never infers (`NoInfer`). */
export type ApisHandlerOverlay<
  Defs,
  M extends Record<string, Record<string, unknown>>,
  RP extends Record<string, Record<string, unknown>>,
  OP extends Record<string, Record<string, Record<string, unknown>>>,
> = NoInfer<{
  [C in keyof OP]: ClientShape & {
    resources?: {
      [K in keyof OP[C]]: ResShape<"operations"> & {
        operations?: {
          [O in keyof OP[C][K]]: O extends AllBuiltinOpName
            ? unknown
            : | NonObjectOp
              | (OpShape & {
                  mock?: OperationMockHandler<
                    C extends keyof M
                      ? K extends keyof M[C]
                        ? HandlerEntity<M[C][K]>
                        : Record<string, unknown>
                      : Record<string, unknown>,
                    HandlerParams<
                      C extends keyof RP ? (K extends keyof RP[C] ? RP[C][K] : "") : "",
                      OP[C][K][O]
                    >,
                    HandlerQuery<HandlerState<C extends keyof Defs ? Defs[C] : {}, K, O>>,
                    HandlerBody<HandlerState<C extends keyof Defs ? Defs[C] : {}, K, O>>,
                    HandlerResult<HandlerState<C extends keyof Defs ? Defs[C] : {}, K, O>>
                  >;
                });
        };
      };
    };
  };
}>;
