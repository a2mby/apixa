import type {
  ApixaClient,
  MockedResource,
  MockFileFixtures,
  MockStorageOptions,
  FileFieldsConfig,
  FileLimits,
  MockFilesHandle,
  FileFieldOptions,
} from "@apixa/core";
import type {
  AllBuiltinOpName,
  KnownOpName,
  MaybeOpName,
  OperationPreset,
  PaginationPreset,
  ResourcePagination,
} from "@apixa/core";
import type { DatasetId, EntityOf, IdKeyOf } from "./catalog.js";
import type { MockApiErrorCode, MockApiError } from "./errors.js";
import type { MockSlice } from "./slice.js";

// ---------------------------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------------------------

type Id = string | number;
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Paging keys of `getAll`. Every other key in the query filters rows (Core's contract). */
export type PageParams = { page?: number; pageSize?: number; cursor?: number | string };

/** Envelope when a mock resource has `pagination: true` / `"page"` — identical to a Core mock. */
export type Page<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Envelope for `pagination: "cursor"`. `nextCursor` is `null` on the last page. */
export type CursorPage<T> = {
  data: T[];
  nextCursor: string | null;
};

export type PaginationConfig = ResourcePagination;

/** `create` / `update` input: the entity, with its id optional. */
export type ResourceInput<T, IdKey extends keyof T> = Omit<T, IdKey> & Partial<Pick<T, IdKey>>;

/** Ids are matched loosely: `getById(2)` finds the record whose id is `"2"`. */
export type MockId = Id;

// ---------------------------------------------------------------------------------------------
// Custom operation context and function shapes
// ---------------------------------------------------------------------------------------------

/** Plain CRUD helpers custom operation functions may reuse through `ctx.defaults`. */
export type MockResourceDefaults<T extends object = Record<string, unknown>> = {
  getAll(): Promise<T[]>;
  getById(id: Id): Promise<T>;
  create(input: unknown): Promise<T>;
  update(id: Id, input: unknown): Promise<T>;
  patch(id: Id, partial: unknown): Promise<T>;
  delete(id: Id): Promise<void>;
};

/** What a mock operation function receives as its first argument. */
export interface MockOperationContext<T extends object = Record<string, unknown>> {
  idKey: string;
  readonly files: MockFilesHandle;
  /** Live, mutable rows — read or write directly for a custom operation. */
  rows(): Promise<T[]>;
  fail(code: MockApiErrorCode, message: string): MockApiError;
  defaults: MockResourceDefaults<T>;
}

/**
 * A fully custom mock operation; `ctx` is bound, callers never pass it. Method syntax keeps the
 * parameters bivariant: unannotated args are `unknown`, annotated ones (`(ctx, id: string) => …`)
 * stay assignable.
 */
export type MockOperationFn<T extends object = Record<string, unknown>> = {
  bivariant(ctx: MockOperationContext<T>, ...args: unknown[]): unknown;
}["bivariant"];

/** `false` removes a builtin, a function replaces it (or adds a custom operation), `true` keeps it. */
export type MockOperationValue = boolean | MockOperationFn;

/** The 13 builtins — the same names, defaults and groups as Core resources. */
export const MOCK_BUILTINS = [
  "getAll",
  "getById",
  "getMany",
  "getBy",
  "findFirst",
  "exists",
  "count",
  "create",
  "update",
  "patch",
  "delete",
  "createMany",
  "deleteMany",
] as const satisfies readonly AllBuiltinOpName[];

// ---------------------------------------------------------------------------------------------
// Config shapes (what the author writes)
// ---------------------------------------------------------------------------------------------

/** Selection shared by root and resource configuration. */
export type MockOperationSelection = OperationPreset | readonly AllBuiltinOpName[];

/**
 * Loose operations bag used as the config constraint. Values are `unknown` on purpose: the typed
 * per-resource view (`TypedOperations`) supplies the handler signatures, and a function type here
 * would compete with it for the handler's contextual type. Runtime validation enforces the shape.
 */
export type MockOperations = Partial<Record<AllBuiltinOpName, unknown>> & Record<string, unknown>;
type MockPreset = OperationPreset | readonly AllBuiltinOpName[];

export interface MockResourceConfig {
  storage?: MockStorageOptions;
  fixtures?: MockFileFixtures;
  fileFields?: FileFieldsConfig;
  fileLimits?: FileLimits;
  /** Dataset id from the catalog (`datasets/manifest.json`). */
  type: DatasetId;
  /**
   * Caps the `getAll` list result: first N records, or half-open `{ start, end }` (Array.slice).
   * Like a Core mock, the store keeps every record: `getById`, `count` and writes ignore it.
   */
  slice?: MockSlice;
  /**
   * Starts the store with a window of the dataset (`{ limit, offset }`, like Core's `mock.seed`).
   * Unlike `slice`, records outside the window do not exist for any operation.
   */
  seed?: { limit?: number; offset?: number };
  /**
   * `true` / `"page"`: `getAll()` returns `{ data, total, page, pageSize }` and accepts
   * `{ page, pageSize }`. `"cursor"`: `{ data, nextCursor }` and `{ cursor, pageSize }`. Other
   * query keys filter rows. An out-of-range page is an empty page, as in a Core mock.
   */
  pagination?: PaginationConfig;
  /**
   * Enable, disable, override or add operations: `true` keeps/enables a builtin, `false` removes
   * it, a function replaces it (or defines a custom operation).
   */
  operations?: MockOperations | MockPreset;
}

/** Resource object of the flat compatibility form: handlers get the generic row context. */
export interface MockFlatResourceConfig extends Omit<MockResourceConfig, "operations"> {
  operations?:
    | MockPreset
    | (Partial<Record<AllBuiltinOpName, MockOperationValue>> &
        Record<string, MockOperationValue | MockPreset>);
}

/** Per-resource input: dataset id string, or full config object. */
export type MockApiResourceInput = DatasetId | MockFlatResourceConfig;

/**
 * Root `defineMockApi` configuration. Mirrors `defineApi`: resources live under `resources`.
 * The root carries the operation-selection settings every resource inherits.
 */
export interface MockRootConfig {
  operations?: MockPreset;
  resources: Record<string, MockResourceConfig>;
}

/** Compatibility form: resources directly at the top level. */
export type MockApiConfigInput = Record<string, MockApiResourceInput>;

export type MockApiConfig = Record<string, MockFlatResourceConfig>;

// ---------------------------------------------------------------------------------------------
// Typed views derived from the config (autocomplete + contextual typing)
// ---------------------------------------------------------------------------------------------

/** Arguments of each builtin when a function overrides it (after the bound `ctx`). */
type BuiltinArgs<N extends AllBuiltinOpName, T extends object, IdKey extends keyof T> = {
  getAll: [query?: GetAllQuery<T>];
  getById: [id: Id];
  getMany: [ids: Id[]];
  getBy: [field: Extract<keyof T, string>, value: Id];
  findFirst: [options?: { query?: Partial<T> }];
  exists: [id: Id];
  count: [query?: Partial<T>];
  create: [input: ResourceInput<T, IdKey>];
  update: [id: Id, options: { body: ResourceInput<T, IdKey> }];
  patch: [id: Id, options: { body: Partial<T> }];
  delete: [id: Id];
  createMany: [inputs: ResourceInput<T, IdKey>[]];
  deleteMany: [ids: Id[]];
}[N];

type BuiltinOverride<N extends AllBuiltinOpName, T extends object, IdKey extends keyof T> = (
  ctx: MockOperationContext<T>,
  ...args: BuiltinArgs<N, T, IdKey>
) => unknown;

type CustomOperation<T extends object> = (
  ctx: MockOperationContext<T>,
  ...args: never[]
) => unknown;

/**
 * Operations for one resource: builtin names with typed override signatures, any other name a
 * custom function. Overlaid on the author's literal so handlers get a typed `ctx` and arguments.
 */
export type TypedOperations<T extends object, IdKey extends keyof T> = {
  [N in AllBuiltinOpName]?: boolean | BuiltinOverride<N, T, IdKey>;
} & {
  [custom: string]: boolean | MockOperationFn<T> | MockPreset;
};

/** Reports unknown keys at the exact property. */
type Exact<T, Shape> = {
  [K in Exclude<keyof T, keyof Shape>]: never;
};

type FileKeys<E> = {
  [K in keyof E & string]-?: NonNullable<E[K]> extends string | readonly string[] ? K : never;
}[keyof E & string];
type AdapterFileFields<E> = readonly FileKeys<E>[] | Partial<Record<FileKeys<E>, FileFieldOptions>>;

/** Per-resource typed view, keyed by the dataset id inferred from `type` (see `TypedResources`). */
type TypedResource<Ty extends DatasetId> = {
  type: Ty;
  fileFields?: AdapterFileFields<EntityOf<Ty>>;
  operations?: MockPreset | TypedOperations<EntityOf<Ty>, IdKeyOf<Ty>>;
};

/**
 * The second type parameter of `defineMockApi` (`T`) is the map `resource name → dataset id`,
 * inferred from each `type` literal on its own. Overlaying `TypedResources<T>` is what gives every
 * handler in `operations` its resource's typed `ctx` and arguments before the handler is checked.
 */
export type TypedResources<T extends Record<string, DatasetId>> = {
  resources?: { [K in keyof T]: TypedResource<T[K]> };
};

/** Typed view of either config form (`resources` root, or the flat compatibility form). */
export type TypedConfig<C, T extends Record<string, DatasetId>> = C extends {
  resources: Record<string, unknown>;
}
  ? TypedResources<T>
  : TypedFlatResources<T>;

/** Flat compatibility form: a dataset id string, or the same typed resource object. */
export type TypedFlatResources<T extends Record<string, DatasetId>> = {
  [K in keyof T]: T[K] | TypedResource<T[K]>;
};

/** Reports unknown keys on the root and on each resource. */
export type ValidateMockRoot<C> = C extends { resources: infer Res }
  ? Exact<C, MockRootConfig> & {
      resources: { [K in keyof Res]: ValidateResource<Res[K]> };
    }
  : { [K in keyof C]: ValidateResource<C[K]> };

type ValidateResource<R> = R extends string
  ? unknown
  : Exact<R, MockResourceConfig> &
      (R extends { type: infer Ty extends DatasetId; fileFields: infer F }
        ? F extends readonly string[]
          ? F[number] extends FileKeys<EntityOf<Ty>>
            ? unknown
            : { fileFields: never }
          : Exact<F, Record<FileKeys<EntityOf<Ty>>, unknown>>
        : unknown) &
      (R extends { operations: infer Ops }
        ? Ops extends MockPreset
          ? unknown
          : {
              operations: {
                [O in keyof Ops]: O extends AllBuiltinOpName | "preset"
                  ? unknown
                  : Ops[O] extends true
                    ? never
                    : unknown;
              };
            }
        : unknown);

// ---------------------------------------------------------------------------------------------
// Returned client type
// ---------------------------------------------------------------------------------------------

type GetAllQuery<T> = PageParams & Partial<T>;

type GetAllFn<T, Paginated> = [Paginated] extends ["page"]
  ? (query?: GetAllQuery<T>) => Promise<Page<T>>
  : [Paginated] extends ["cursor"]
    ? (query?: GetAllQuery<T>) => Promise<CursorPage<T>>
    : (query?: Partial<T>) => Promise<T[]>;

type BuiltinFn<
  N extends AllBuiltinOpName,
  T extends object,
  IdKey extends keyof T,
  Paginated,
  Input extends object = T,
> = N extends "getAll"
  ? GetAllFn<T, Paginated>
  : {
      getById: (id: Id) => Promise<T>;
      getMany: (ids: Id[]) => Promise<T[]>;
      getBy: (field: Extract<keyof T, string>, value: Id) => Promise<T | null>;
      findFirst: (options?: { query?: Partial<T> }) => Promise<T | null>;
      exists: (id: Id) => Promise<boolean>;
      count: (query?: Partial<T>) => Promise<number>;
      create: (input: ResourceInput<Input, IdKey & keyof Input>) => Promise<T>;
      update: (id: Id, options: { body: ResourceInput<Input, IdKey & keyof Input> }) => Promise<T>;
      patch: (id: Id, options: { body: Partial<Input> }) => Promise<T>;
      delete: (id: Id) => Promise<void>;
      createMany: (inputs: ResourceInput<Input, IdKey & keyof Input>[]) => Promise<T[]>;
      deleteMany: (ids: Id[]) => Promise<void>;
    }[Exclude<N, "getAll">];

/** Runtime operation entries that are not disabled. */
type OpsOf<R> = R extends { operations: infer Ops }
  ? Ops extends MockPreset
    ? {}
    : Ops extends Record<string, unknown>
      ? {
          [
            K in keyof Ops as K extends "preset" ? never : Ops[K] extends false ? never : K
          ]-?: Exclude<Ops[K], false | undefined>;
        }
      : {}
  : {};

type FnOnly<Op> = Op extends (...args: never[]) => unknown ? Op : never;

/** Drop the bound `ctx` and make the result a promise, like the runtime does. */
type Callable<F> = F extends (ctx: never, ...args: infer A) => infer Ret
  ? (...args: A) => Promise<Awaited<Ret>>
  : never;

type CustomNames<R> = Exclude<keyof OpsOf<R>, AllBuiltinOpName>;

type FileNames<C> = C extends { fileFields: infer F }
  ? F extends readonly string[]
    ? F[number]
    : keyof F
  : never;
type FileBody<T, C> = {
  [K in keyof T]: K extends FileNames<C>
    ? T[K] extends readonly string[]
      ? T[K] | readonly (File | Blob)[]
      : T[K] | File | Blob
    : T[K];
};

type ClientFn<
  N extends AllBuiltinOpName,
  Config,
  T extends object,
  IdKey extends keyof T,
  Paginated,
> = N extends keyof OpsOf<Config>
  ? [FnOnly<OpsOf<Config>[N]>] extends [never]
    ? BuiltinFn<N, T, IdKey, Paginated, FileBody<T, Config>>
    : Callable<FnOnly<OpsOf<Config>[N]>>
  : BuiltinFn<N, T, IdKey, Paginated, FileBody<T, Config>>;

/** `true` / `"page"` / preset → page envelope, `"cursor"` → cursor envelope, else a plain list. */
type PaginationOf<R> = R extends { readonly pagination: infer P }
  ? [P] extends [false | undefined]
    ? undefined
    : P extends true | "page" | PaginationPreset
      ? "page"
      : P extends "cursor"
        ? "cursor"
        : P extends { type: infer T extends "page" | "cursor" }
          ? T
          : P extends { preset: PaginationPreset }
            ? "page"
            : undefined
  : undefined;

/**
 * In-memory CRUD for one resource. Methods exist exactly when the resolved operation selection
 * (root + resource, same precedence as Core) enables them. No network, no persistence; every
 * method returns a fresh copy; failures reject with `MockApiError` (check `code`).
 */
export type MockResource<
  T extends object,
  IdKey extends keyof T,
  Paginated extends "page" | "cursor" | undefined = undefined,
  Config = {},
> = Simplify<
  MockedResource & {
    [N in KnownOpName<Config>]: ClientFn<N, Config, T, IdKey, Paginated>;
  } & {
    [N in MaybeOpName<Config>]?: ClientFn<N, Config, T, IdKey, Paginated>;
  } & {
    [N in CustomNames<Config>]: Callable<FnOnly<OpsOf<Config>[N]>>;
  }
>;

/** Resource selections replace the root preset; named entries extend it. */
type EffectiveOperations<Root, R> = R extends { operations: infer Ops }
  ? Ops extends MockPreset | { preset: unknown }
    ? { operations: Ops }
    : Root extends { operations: infer Preset }
      ? { operations: Ops & { preset: Preset } }
      : { operations: Ops }
  : Root extends { operations: infer Preset }
    ? { operations: Preset }
    : {};

export type EffectiveConfig<Root, R> = Omit<R, "operations"> & EffectiveOperations<Root, R>;

type ResourcesIn<C> = C extends { resources: infer Res } ? Res : C;
type ResolvedResource<R> = R extends string ? { readonly type: R } : R;

export type MockApi<C> = ApixaClient & {
  [K in keyof ResourcesIn<C>]: ResolvedResource<ResourcesIn<C>[K]> extends infer R
    ? R extends { type: infer Ty extends DatasetId }
      ? MockResource<
          EntityOf<Ty>,
          IdKeyOf<Ty>,
          PaginationOf<R>,
          EffectiveConfig<C extends { resources: unknown } ? C : {}, R>
        >
      : never
    : never;
};
