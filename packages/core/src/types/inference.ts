import type { ResolveMockFixtures } from "../mock/fixtures.js";
import type { AllBuiltinOpName, OperationFnContext } from "./builtins.js";
import type {
  ApiRootConfig,
  FileFieldOptions,
  OperationDefinition,
  OperationRunDefinition,
  OperationPreset,
  PaginationPreset,
  QueryOptions,
  ResourceDefinition,
  ResourcePagination,
} from "./definition.js";
import type { PathParams, QueryParams } from "./http.js";
import type { MockDatasetCatalog, MockDatasetId } from "./mock-datasets.js";
import type { KeyCase, KeyTransformConfig, TransformKeys } from "./transform.js";
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
        ? ResolveMockFixtures<ElementOf<D>>
        : D extends (...args: never[]) => infer Ret
          ? ResolveMockFixtures<ElementOf<Awaited<Ret>>>
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
  responseTransform?: KeyTransformConfig | undefined;
}

type KeysOf<C, Dir extends "request" | "response"> = C extends {
  transforms: { [P in Dir]: { keys: infer K extends KeyCase } };
}
  ? K
  : undefined;

type TransformRuleOf<C, Dir extends "request" | "response"> = C extends {
  transforms: { [P in Dir]: infer Rule extends KeyTransformConfig };
}
  ? Rule
  : undefined;

export type RootTypesOf<Config> = {
  requestKeys: KeysOf<Config, "request">;
  responseKeys: KeysOf<Config, "response">;
  responseTransform: TransformRuleOf<Config, "response">;
};

type ResponseKeys<R, Root extends RootTypes> =
  KeysOf<R, "response"> extends KeyCase ? KeysOf<R, "response"> : Root["responseKeys"];

type ResponseTransform<R, Root extends RootTypes> =
  TransformRuleOf<R, "response"> extends KeyTransformConfig
    ? TransformRuleOf<R, "response">
    : Root["responseTransform"] extends KeyTransformConfig
      ? Root["responseTransform"]
      : ResponseKeys<R, Root>;

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
  ResponseTransform<R, Root>
>;

type IdKey<R> = R extends { idKey: infer K extends string }
  ? K
  : R extends { mock: infer M }
    ? MockIdKeyOf<M>
    : "id";
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

/** `getAll` items: array metadata `list`, else entity array; pagination owns the envelope. */
export type ListOf<R, Meta = {}, Root extends RootTypes = RootTypes> = Meta extends {
  list: infer L;
}
  ? [undefined] extends [L]
    ? EntityOf<R, Meta, Root>[]
    : [L] extends [readonly unknown[]]
      ? TransformKeys<L, ResponseTransform<R, Root>>
      : EntityOf<R, Meta, Root>[]
  : EntityOf<R, Meta, Root>[];

export type QueryOf<Meta> = Meta extends { query: infer Q }
  ? [undefined] extends [Q]
    ? QueryParams
    : Q
  : QueryParams;

type PaginationModeOf<P> = [P] extends [false | undefined]
  ? undefined
  : P extends true | "page" | PaginationPreset
    ? "page"
    : P extends "cursor"
      ? "cursor"
      : P extends { type: infer T extends "page" | "cursor" }
        ? T
        : P extends { preset: PaginationPreset }
          ? "page"
          : undefined;

type Pagination<R> = R extends { pagination: infer P } ? PaginationModeOf<P> : undefined;

type EffectiveOpPagination<R, Op, DefaultResource = undefined> = [Op] extends [never]
  ? DefaultResource
  : Op extends { pagination: infer OP }
    ? [OP] extends [false]
      ? undefined
      : [OP] extends [true]
        ? DefaultResource extends "page" | "cursor"
          ? DefaultResource
          : "page"
        : [OP] extends [undefined]
          ? DefaultResource
          : PaginationModeOf<OP>
    : DefaultResource;

type OptInPagination<R, Op> = [Op] extends [never]
  ? undefined
  : EffectiveOpPagination<R, Op, Pagination<R>> extends infer Res
    ? Op extends { pagination: infer OP }
      ? [OP] extends [false | undefined]
        ? undefined
        : Res
      : undefined
    : undefined;

type GetAllPagination<R> = EffectiveOpPagination<R, RuntimeOperation<R, "getAll">, Pagination<R>>;

type PaginationModeQuery<Query, Mode> = Mode extends "page"
  ? Query & { page?: number; pageSize?: number }
  : Mode extends "cursor"
    ? Query & { cursor?: string; pageSize?: number }
    : Query;

type WrapPaginated<Res, Mode> = Mode extends "page" | "cursor"
  ? unknown extends Res
    ? Mode extends "page"
      ? { data: unknown[]; total: number; page: number; pageSize: number }
      : { data: unknown[]; nextCursor: string | null }
    : Res extends readonly (infer Item)[]
      ? Mode extends "page"
        ? { data: Item[]; total: number; page: number; pageSize: number }
        : { data: Item[]; nextCursor: string | null }
      : Res
  : Res;

type ApplyOpPagination<Op, Mode> = Mode extends "page" | "cursor"
  ? Omit<Op, "response" | "query"> & {
      response: WrapPaginated<InferResponse<Op>, Mode>;
      query: PaginationModeQuery<InferQuery<Op>, Mode>;
    }
  : Op;

/** Shared live/mock pagination contract (Part E26). */
export type PaginatedListOf<R, Meta = {}, Root extends RootTypes = RootTypes> =
  GetAllPagination<R> extends "page"
    ? { data: ListOf<R, Meta, Root>; total: number; page: number; pageSize: number }
    : GetAllPagination<R> extends "cursor"
      ? { data: ListOf<R, Meta, Root>; nextCursor: string | null }
      : ListOf<R, Meta, Root>;

export type PaginationQueryOf<R, Meta> = PaginationModeQuery<QueryOf<Meta>, GetAllPagination<R>>;

/** Filter object for `findFirst`: known entity fields, else generic query params. */
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

/** Lookup field for `getBy`: public entity key when known, else string. */
type LookupFieldOf<R, Meta, Root extends RootTypes> =
  EntityOf<R, Meta, Root> extends infer E
    ? Known<E> extends true
      ? Extract<keyof E, string>
      : string
    : string;

// ---------------------------------------------------------------------------------------------
// Operation shapes and signatures.
// ---------------------------------------------------------------------------------------------

type EntityBuiltinOps<R, Meta, Root extends RootTypes> = {
  getAll: { path: ""; response: PaginatedListOf<R, Meta, Root>; query: PaginationQueryOf<R, Meta> };
  getById: { path: "/:id"; response: EntityOf<R, Meta, Root> };
  getBy: { path: ""; response: EntityOf<R, Meta, Root> | null };
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
  patch: {
    path: "/:id";
    body: WithFileInputs<UpdateOf<R, Meta, Root>, FileNamesFor<R, "patch">>;
    response: EntityOf<R, Meta, Root>;
  };
  count: { path: "/count"; response: number; query: QueryOf<Meta> };
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
type PathParamsOf<Path extends string> = [PathParamName<Path>] extends [never]
  ? PathParams
  : { [K in PathParamName<Path>]: string | number };

type InferResponse<Op> = Op extends { response: infer R } ? R : unknown;

/**
 * A literal non-JSON `responseType` on the runtime operation sets its `response` type. Applied
 * after the runtime override and before `response.parse` and `defineApi<T>()` metadata, so
 * explicit metadata wins. A widened `ResponseType` (not a literal) leaves the type alone.
 */
type ApplyResponseType<Op> = Op extends { responseType: infer RT extends ResponseType }
  ? [ResponseType] extends [RT]
    ? Op
    : RT extends BinaryResponseType
      ? Omit<Op, "response"> & { response: ResponseTypeData<RT> }
      : RT extends "auto"
        ? Omit<Op, "response"> & { response: unknown }
        : Op
  : Op;

/** Strip runtime `response` hook config before merging over inferred operation shapes. */
type SanitizeRuntimeOp<Op> = [Op] extends [never]
  ? never
  : Op extends (...args: never[]) => unknown
    ? Op
    : Op extends object
      ? Omit<Op, "response">
      : Op;

/** A literal `response.parse` function overrides the inferred `response` type unless metadata sets it. */
type ApplyResponseParser<Op, RawOp = Op> = [RawOp] extends [never]
  ? Op
  : RawOp extends {
        response: { parse: (...args: never[]) => infer R };
      }
    ? [R] extends [void | undefined]
      ? Op
      : unknown extends R
        ? Op
        : Omit<Op, "response"> & { response: Awaited<R> }
    : Op;

/** Data type for one call: a literal non-JSON per-call `responseType` replaces `Data`. */
type CallData<Data, O> = O extends { responseType: infer RT extends ResponseType }
  ? [ResponseType] extends [RT]
    ? Data
    : DataFor<Data, RT>
  : Data;
type DataFor<Data, RT> = RT extends BinaryResponseType
  ? ResponseTypeData<RT>
  : RT extends "auto"
    ? unknown
    : Data;
type InferQuery<Op> = Op extends { query: infer Q } ? Q : QueryParams;
type DefaultMethod<Name extends string> = Name extends keyof Conventions
  ? Conventions[Name]["method"]
  : never;
type BodyMethod = "POST" | "PUT" | "PATCH" | "DELETE";
type HasBody<Name extends string, Op> = Op extends { hasBody: infer H }
  ? H
  : Name extends "deleteMany"
    ? true
    : Name extends "delete"
      ? false
      : (Op extends { method: infer M } ? M : DefaultMethod<Name>) extends BodyMethod
        ? true
        : false;
type InferBody<Op> = Op extends { body: infer B } ? B : unknown;

export type CallResult<Data, O> = [O] extends [undefined]
  ? Data
  : O extends { full: true }
    ? ApiResponse<CallData<Data, O>>
    : CallData<Data, O>;

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
type OperationOverrides<Ops> = Ops extends { preset: unknown }
  ? Omit<Ops, "preset">
  : Ops extends readonly unknown[] | string
    ? {}
    : Ops;
export type ResourceOpsOf<R> = R extends { operations: infer Ops }
  ? OperationOverrides<Ops> extends infer Overrides
    ? Overrides extends Record<string, unknown>
      ? {
          [K in keyof Overrides as Overrides[K] extends false ? never : K]-?: Exclude<
            Overrides[K],
            false | undefined
          >;
        }
      : {}
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
        ? TransformKeys<Op[K], ResponseTransform<R, Root>>
        : Op[K];
    }
  : {};
type ApplyPayload<Base, Meta, Name extends string, R, Root extends RootTypes> = Base extends (
  ...args: never[]
) => unknown
  ? Base
  : MergeOp<Base, PayloadFields<MetaOperation<Meta, Name>, R, Root>>;

// ---- operation selection (mirrors operation/expand.ts exactly) ----

type Convention<Name extends AllBuiltinOpName> = Conventions[Name];
type PresetSelected<Preset, Name extends AllBuiltinOpName> = Preset extends "all"
  ? true
  : Preset extends "crud"
    ? Convention<Name>["extended"] extends false
      ? true
      : false
    : Preset extends "read"
      ? Convention<Name>["access"] extends "read"
        ? true
        : false
      : Preset extends readonly unknown[]
        ? number extends Preset["length"]
          ? boolean
          : Name extends Preset[number]
            ? true
            : false
        : boolean;
type SelectionWithOverrides<
  Overrides,
  Name extends AllBuiltinOpName,
  Base,
> = Name extends keyof Overrides
  ? [Extract<Overrides[Name], false>] extends [never]
    ? [Extract<Overrides[Name], undefined>] extends [never]
      ? true
      : Base | true
    : [Exclude<Overrides[Name], false>] extends [never]
      ? false
      : boolean
  : Base;
type Selected<R, Name extends AllBuiltinOpName> = "operations" extends keyof R
  ? R extends { operations: infer Ops }
    ? Ops extends string | readonly unknown[]
      ? PresetSelected<Ops, Name>
      : Ops extends { preset: unknown }
        ? SelectionWithOverrides<
            OperationOverrides<Ops>,
            Name,
            PresetSelected<Ops extends { preset: infer P } ? P : "all", Name>
          >
        : string extends keyof Ops
          ? boolean
          : SelectionWithOverrides<Ops, Name, true>
    : boolean
  : true;
/** Builtin names that are certainly present for a resource config. */
export type KnownOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true] ? Name : never;
}[AllBuiltinOpName];
/** Builtin names that may be present (config is not narrow enough to decide). */
export type MaybeOpName<R> = {
  [Name in AllBuiltinOpName]: [Selected<R, Name>] extends [true] | [false] ? never : Name;
}[AllBuiltinOpName];

type EffectiveOpDef<
  Name extends AllBuiltinOpName,
  R,
  Meta,
  Root extends RootTypes,
> = Name extends "getAll"
  ? ApplyOpPagination<
      ApplyPayload<
        ApplyResponseParser<
          ApplyResponseType<
            MergeOp<
              EntityBuiltinOps<R, Meta, Root>[Name & keyof EntityBuiltinOps<R, Meta, Root>],
              SanitizeRuntimeOp<
                Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never
              >
            >
          >,
          Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never
        >,
        Meta,
        Name,
        R,
        Root
      >,
      GetAllPagination<R>
    >
  : ApplyPayload<
      ApplyResponseParser<
        ApplyResponseType<
          MergeOp<
            EntityBuiltinOps<R, Meta, Root>[Name & keyof EntityBuiltinOps<R, Meta, Root>],
            SanitizeRuntimeOp<Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never>
          >
        >,
        Name extends keyof ResourceOpsOf<R> ? ResourceOpsOf<R>[Name] : never
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

type GetByCall<
  R,
  Meta,
  Root extends RootTypes,
  Op = EffectiveOpDef<"getBy", R, Meta, Root>,
> = CallWithOptions<
  [field: LookupFieldOf<R, Meta, Root>, value: string | number],
  Exclude<PathParamName<FullPath<R, "getBy", Op>>, "field" | "value">,
  InferQuery<Op>,
  InferResponse<Op>
>;

type SpecialResponse<Name extends string, R, Meta, Root extends RootTypes, Default> =
  ApplyPayload<
    ApplyResponseParser<
      ApplyResponseType<
        SanitizeRuntimeOp<
          [RuntimeOperation<R, Name>] extends [never] ? {} : RuntimeOperation<R, Name>
        >
      >,
      [RuntimeOperation<R, Name>] extends [never] ? {} : RuntimeOperation<R, Name>
    >,
    Meta,
    Name,
    R,
    Root
  > extends { response: infer Res }
    ? unknown extends Res
      ? Default
      : Res
    : Default;

type SpecialClientFn<Name extends string, R, Meta, Root extends RootTypes> = Name extends "exists"
  ? CallWithOptions<
      [id: IdOf<R, Meta, Root>],
      ResourceParamName<R>,
      QueryParams,
      SpecialResponse<"exists", R, Meta, Root, boolean>
    >
  : Name extends "getMany"
    ? CallWithOptions<
        [ids: IdOf<R, Meta, Root>[]],
        ResourceParamName<R>,
        PaginationModeQuery<
          [MetaOperation<Meta, "getMany">] extends [{ query: infer Q }] ? Q : QueryParams,
          OptInPagination<R, RuntimeOperation<R, "getMany">>
        >,
        WrapPaginated<
          SpecialResponse<"getMany", R, Meta, Root, EntityOf<R, Meta, Root>[]>,
          OptInPagination<R, RuntimeOperation<R, "getMany">>
        >
      >
    : Name extends "findFirst"
      ? CallWithOptions<
          [],
          PathParamName<
            FullPath<
              R,
              Name,
              [RuntimeOperation<R, Name>] extends [never] ? {} : RuntimeOperation<R, Name>
            >
          >,
          FilterOf<R, Meta, Root>,
          SpecialResponse<"findFirst", R, Meta, Root, EntityOf<R, Meta, Root> | null>
        >
      : Name extends "getBy"
        ? GetByCall<R, Meta, Root>
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
> = Name extends "getAll"
  ? ListCall<R, Meta, Root>
  : Name extends "getById" | "delete"
    ? IdentityCall<Name, R, Meta, Root>
    : Name extends "update" | "patch"
      ? IdentityMutationCall<Name, R, Meta, Root>
      : Name extends SpecialName
        ? SpecialClientFn<Name, R, Meta, Root>
        : CustomCall<R, Name, EffectiveOpDef<Name, R, Meta, Root>>;

type FirstPathParam<Path extends string> = Path extends
  `http://${infer Rest}` | `https://${infer Rest}`
  ? Rest extends `${string}/${infer Tail}`
    ? FirstPathParam<`/${Tail}`>
    : never
  : Path extends `${string}:${infer Param}/${string}`
    ? Param
    : Path extends `${string}:${infer Param}`
      ? Param
      : never;

type CallWithOptions<Args extends unknown[], Params extends string, Query, Result> = [
  Params,
] extends [never]
  ? <O extends RequestOptions<Query> | undefined = undefined>(
      ...args: [...Args, options?: O | RequestOptions<Query>]
    ) => Promise<CallResult<Result, O>>
  : <O extends RequestOptions<Query> & { params: { [K in Params]: string | number } }>(
      ...args: [...Args, options: O]
    ) => Promise<CallResult<Result, O>>;

type IdentityCall<
  Name extends "getById" | "delete",
  R,
  Meta,
  Root extends RootTypes,
  Op = EffectiveOpDef<Name, R, Meta, Root>,
> = CallWithOptions<
  [id: IdOf<R, Meta, Root>],
  Exclude<PathParamName<FullPath<R, Name, Op>>, FirstPathParam<EffectivePath<Name, Op>>>,
  InferQuery<Op>,
  InferResponse<Op>
>;

type IdentityMutationCall<
  Name extends "update" | "patch",
  R,
  Meta,
  Root extends RootTypes,
  Op = EffectiveOpDef<Name, R, Meta, Root>,
  Params extends string = Exclude<
    PathParamName<FullPath<R, Name, Op>>,
    FirstPathParam<EffectivePath<Name, Op>>
  >,
> = <
  O extends RequestOptions<InferQuery<Op>> & { body: InferBody<Op> } & ([Params] extends [never]
      ? {}
      : { params: { [K in Params]: string | number } }),
>(
  id: IdOf<R, Meta, Root>,
  options: O,
) => Promise<CallResult<InferResponse<Op>, O>>;

type ListCall<R, Meta, Root extends RootTypes, Op = EffectiveOpDef<"getAll", R, Meta, Root>> =
  HasBody<"getAll", Op> extends true
    ? PathParamName<FullPath<R, "getAll", Op>> extends never
      ? <O extends RequestOptions<InferQuery<Op>> | undefined = undefined>(
          body: InferBody<Op>,
          options?: O | RequestOptions<InferQuery<Op>>,
        ) => Promise<CallResult<InferResponse<Op>, O>>
      : <
          O extends RequestOptions<InferQuery<Op>> & {
            params: PathParamsOf<FullPath<R, "getAll", Op>>;
          },
        >(
          body: InferBody<Op>,
          options: O,
        ) => Promise<CallResult<InferResponse<Op>, O>>
    : PathParamName<FullPath<R, "getAll", Op>> extends never
      ? <O extends RequestOptions<InferQuery<Op>> | undefined = undefined>(
          options?: O | RequestOptions<InferQuery<Op>>,
        ) => Promise<CallResult<InferResponse<Op>, O>>
      : <
          O extends RequestOptions<InferQuery<Op>> & {
            params: PathParamsOf<FullPath<R, "getAll", Op>>;
          },
        >(
          options: O,
        ) => Promise<CallResult<InferResponse<Op>, O>>;

/** An operation-level `transforms.response` overrides resource and root for that operation's types. */
type WithOpTransforms<R, Op> = [Op] extends [never]
  ? R
  : Op extends { transforms: { response: infer Rule extends KeyTransformConfig } }
    ? Omit<R, "transforms"> & { transforms: { response: Rule } }
    : R;
type CustomOpName<R> = Exclude<keyof ResourceOpsOf<R>, AllBuiltinOpName>;
type CustomClientFn<R, Meta, Root extends RootTypes, Name extends CustomOpName<R>> = [
  FnOf<ResourceOpsOf<R>[Name]>,
] extends [never]
  ? CustomCall<
      WithOpTransforms<R, ResourceOpsOf<R>[Name]>,
      Extract<Name, string>,
      ApplyOpPagination<
        ApplyPayload<
          ApplyResponseParser<
            ApplyResponseType<SanitizeRuntimeOp<ResourceOpsOf<R>[Name]>>,
            ResourceOpsOf<R>[Name]
          >,
          Meta,
          Extract<Name, string>,
          WithOpTransforms<R, ResourceOpsOf<R>[Name]>,
          Root
        >,
        OptInPagination<R, ResourceOpsOf<R>[Name]>
      >
    >
  : StripCtx<FnOf<ResourceOpsOf<R>[Name]>>;

type CustomCall<
  R,
  Name extends string,
  Op,
  Params extends string = PathParamName<FullPath<R, Name, Op>>,
> = CallWithOptions<
  HasBody<Name, Op> extends true
    ? [Params] extends [never]
      ? [unknown] extends [InferBody<Op>]
        ? [body?: InferBody<Op>]
        : [body: InferBody<Op>]
      : [body: InferBody<Op>]
    : [],
  Params,
  InferQuery<Op>,
  InferResponse<Op>
>;

/** Classify builtins by convention, HTTP operations by method and function operations by kind. */
export type OperationKindOf<R, Name> = Name extends keyof ResourceOpsOf<R>
  ? ResourceOpsOf<R>[Name] extends { method: infer Method extends string }
    ? RequiredKind<Method>
    : Name extends AllBuiltinOpName
      ? Conventions[Name]["access"]
      : ResourceOpsOf<R>[Name] extends { kind: infer Kind extends "read" | "write" }
        ? Kind
        : never
  : Name extends AllBuiltinOpName
    ? Conventions[Name]["access"]
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

/**
 * Minimal structural constraint for `const Config` / `const Configs` inference in `defineApi` and
 * `defineApis`. Leaf option types are checked by `NoInfer<ApiInput<...>>` and `ValidateConfig` so
 * a single invalid option never collapses sibling resources or operations.
 */
export type StructuralApiInput = {
  baseURL: string;
  resources: Record<string, { path: string }>;
};

export type StructuralApisInput = Record<string, StructuralApiInput>;

/** Error marker. An object type (not a literal) so intersections never collapse to `never`. */
export type ConfigTypeError<Message extends string> = { readonly "apixa config error": Message };

type Exact<T, Shape> = {
  [K in Exclude<keyof T, keyof Shape>]: ConfigTypeError<`Unknown option "${K & string}"`>;
};

type RequiredKind<M> = M extends "GET" | "HEAD" | "OPTIONS" ? "read" : "write";
type ValidateMethodKind<Name, Op> = Op extends { method: infer Method extends string }
  ? Op extends { kind: infer Kind }
    ? Kind extends RequiredKind<Method>
      ? unknown
      : {
          method: ConfigTypeError<`HTTP method "${Method}" requires kind "${RequiredKind<Method>}"`>;
        }
    : unknown
  : unknown;

type EffectiveKind<Name, Op> = Op extends { method: infer Method extends string }
  ? RequiredKind<Method>
  : Name extends AllBuiltinOpName
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

type ValidateOpPagination<Name, Op> = Op extends { pagination: infer P }
  ? [P] extends [undefined]
    ? unknown
    : Name extends AllBuiltinOpName
      ? Name extends "getAll" | "getMany"
        ? [P] extends [ResourcePagination | undefined]
          ? unknown
          : { pagination: ConfigTypeError<`invalid pagination setting`> }
        : {
            pagination: ConfigTypeError<`pagination is only supported on list operations (getAll, getMany, or custom declarative operations)`>;
          }
      : [P] extends [ResourcePagination | undefined]
        ? unknown
        : { pagination: ConfigTypeError<`invalid pagination setting`> }
  : unknown;

type ValidateResourcePagination<R> = R extends { pagination: infer P }
  ? [P] extends [ResourcePagination | undefined]
    ? unknown
    : { pagination: ConfigTypeError<`invalid pagination setting`> }
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

type ValidateTransformRule<R> = R extends object ? Exact<R, KeyTransformConfig> : unknown;
type ValidateTransformsConfig<T> = Exact<T, { request: unknown; response: unknown }> &
  (T extends { request: infer Req } ? { request: ValidateTransformRule<Req> } : unknown) &
  (T extends { response: infer Res } ? { response: ValidateTransformRule<Res> } : unknown);
type ValidateResponseOptions<Resp> = Resp extends object
  ? Exact<Resp, { unwrap: unknown; parse: unknown; validate: unknown }>
  : unknown;

type ValidateMiddlewareHooks<M> = [M] extends [undefined]
  ? unknown
  : M extends readonly unknown[]
    ? ConfigTypeError<"middleware must be an object { onRequest?, onResponse?, onError? }">
    : M extends object
      ? Exact<M, { onRequest: unknown; onResponse: unknown; onError: unknown }>
      : ConfigTypeError<"middleware must be an object { onRequest?, onResponse?, onError? }">;

type ValidateOperationShape<Name, Op> = Op extends { run: unknown }
  ? Exact<Op, { kind: unknown; run: unknown; presigned?: unknown }> &
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
          ValidateOpPagination<Name, Op> &
          (Op extends { transforms: infer T }
            ? { transforms: ValidateTransformsConfig<T> }
            : unknown) &
          (Op extends { response: infer Resp }
            ? { response: ValidateResponseOptions<Resp> }
            : unknown) &
          (Op extends { middleware: infer M }
            ? { middleware: ValidateMiddlewareHooks<M> }
            : unknown) &
          (Name extends AllBuiltinOpName
            ? unknown
            : Op extends { method: string }
              ? unknown
              : {
                  method: ConfigTypeError<`custom operation "${Name & string}" needs a method`>;
                })
      : Op extends false | undefined
        ? unknown
        : ConfigTypeError<`operation "${Name & string}" must be a declaration or a boolean`>;

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
  ? Exact<
      M,
      { data: unknown; idKey: unknown; seed: unknown; storage: unknown; fixtures: unknown }
    > &
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

type MockValidationEntity<M> =
  MockDataOf<M> extends infer D
    ? D extends MockDatasetId
      ? MockDatasetCatalog[D]["entity"]
      : D extends readonly (infer E)[]
        ? ResolveMockFixtures<E>
        : D extends (...args: never[]) => infer Ret
          ? Awaited<Ret> extends readonly (infer E)[]
            ? ResolveMockFixtures<E>
            : unknown
          : unknown
    : unknown;

type MockMatchesMeta<M, Meta> = Meta extends { entity: infer E }
  ? [undefined] extends [E]
    ? unknown
    : Known<MockValidationEntity<M>> extends true
      ? MockValidationEntity<M> extends E
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

type DeclaredTransferFields<R> = R extends { fileFields: infer F }
  ? F extends readonly string[]
    ? F[number]
    : keyof F
  : never;
type ValidateTransfer<Name, Op, R> = Op extends { transfer: { source: infer S } }
  ? (EffectiveKind<Name, Op> extends "write"
      ? unknown
      : { transfer: ConfigTypeError<"transfer is only for write operations"> }) &
      (Op extends { dataFormat: unknown }
        ? { transfer: ConfigTypeError<"transfer cannot combine with outer dataFormat"> }
        : unknown) &
      (S extends string
        ? string extends S
          ? unknown
          : S extends DeclaredTransferFields<R>
            ? unknown
            : {
                transfer: {
                  source: ConfigTypeError<"transfer source must name a declared file field">;
                };
              }
        : unknown)
  : unknown;

type ValidateOperationMap<Ops, R, Meta> = {
  [O in keyof Ops]: ValidateOperation<O, Ops[O]> & ValidateTransfer<O, Ops[O], R>;
} & {
  [
    O in MissingCustomOps<Meta, R>
  ]: ConfigTypeError<"declared in metadata but not defined in runtime operations">;
};

type ValidateOperations<Ops, R, Meta> = Ops extends string | readonly unknown[]
  ? unknown
  : ValidateOperationMap<OperationOverrides<Ops>, R, Meta>;

type ValidateResource<R, Meta, Root extends RootTypes> = Exact<R, ResourceDefinition> &
  (R extends { idKey: infer K }
    ? unknown extends SourceEntity<R, Meta>
      ? unknown
      : K extends keyof SourceEntity<R, Meta>
        ? NonNullable<SourceEntity<R, Meta>[K]> extends string | number
          ? unknown
          : { idKey: ConfigTypeError<"idKey must name a string or number identity field"> }
        : { idKey: ConfigTypeError<"idKey must be a field of the entity"> }
    : unknown) &
  (R extends { operations: infer Ops }
    ? {
        operations: ValidateOperations<Ops, R, Meta>;
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
  (R extends { transforms: infer T } ? { transforms: ValidateTransformsConfig<T> } : unknown) &
  (R extends { response: infer Resp } ? { response: ValidateResponseOptions<Resp> } : unknown) &
  (R extends { middleware: infer M } ? { middleware: ValidateMiddlewareHooks<M> } : unknown) &
  ValidateResourcePagination<R>;

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
  (Config extends { transforms: infer T } ? { transforms: ValidateTransformsConfig<T> } : unknown) &
  (Config extends { response: infer Resp }
    ? { response: ValidateResponseOptions<Resp> }
    : unknown) &
  (Config extends { query: infer Q } ? { query: Exact<Q, QueryOptions> } : unknown) &
  (Config extends { middleware: infer M } ? { middleware: ValidateMiddlewareHooks<M> } : unknown);

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
type NonObjectOp = boolean | Function | OperationPreset | readonly AllBuiltinOpName[];
// `run` repeats the real `OperationFn` so a function operation keeps its contextual parameter types.
type OpShape = Omit<OperationDefinition, "path" | "mock"> & { run?: OperationRunDefinition["run"] };
type ResShape<Except extends keyof ResourceDefinition> = Omit<ResourceDefinition, Except>;
type SelectionShape = OperationPreset | readonly AllBuiltinOpName[];

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
      operations?:
        | SelectionShape
        | {
            [O in keyof OP[K]]: O extends "preset"
              ? SelectionShape
              : ({ path?: OP[K][O] } & OpShape) | NonObjectOp;
          };
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
      operations?:
        | SelectionShape
        | {
            [O in keyof OP[K]]: O extends AllBuiltinOpName | "preset"
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
        operations?:
          | SelectionShape
          | {
              [O in keyof OP[C][K]]: O extends "preset"
                ? SelectionShape
                : ({ path?: OP[C][K][O] } & OpShape) | NonObjectOp;
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
        operations?:
          | SelectionShape
          | {
              [O in keyof OP[C][K]]: O extends AllBuiltinOpName | "preset"
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
