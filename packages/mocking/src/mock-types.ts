import type { AllBuiltinOpName, KnownOpName, MaybeOpName, OperationGroupName } from "@apixa/core";
import type { DatasetId, EntityOf, IdKeyOf } from "./catalog.js";
import type { MockApiErrorCode, MockApiError } from "./errors.js";
import type { MockSlice } from "./slice.js";

// ---------------------------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------------------------

type Id = string | number;
type Simplify<T> = { [K in keyof T]: T[K] } & {};

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

export type PageParams = { page?: number; pageSize?: number };

/** Envelope when a mock resource has `pagination: true`. `previous` / `next` are page numbers. */
export type Page<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Previous page number, or `null` on the first page. */
  previous: number | null;
  /** Next page number, or `null` on the last page. */
  next: number | null;
};

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

/** The 16 builtins — the same names, defaults and groups as Core resources. */
export const MOCK_BUILTINS = [
  "getAll",
  "getById",
  "getBySlug",
  "getMany",
  "getBy",
  "findFirst",
  "search",
  "exists",
  "count",
  "create",
  "update",
  "patch",
  "upsert",
  "delete",
  "createMany",
  "deleteMany",
] as const satisfies readonly AllBuiltinOpName[];

// ---------------------------------------------------------------------------------------------
// Config shapes (what the author writes)
// ---------------------------------------------------------------------------------------------

/** Operation selection shared by the root and every resource (resource wins, then `operations`). */
export interface MockOperationSelection {
  /** `false` starts with no builtins (enable some through `operationGroups` / `operations`). */
  defaultOperations?: boolean;
  /** Removes the 7 write builtins (explicit groups / operations still win). */
  readOnly?: boolean;
  /** Removes the 9 read builtins (explicit groups / operations still win). */
  writeOnly?: boolean;
  /** Turn a whole group on or off: `read`, `write`, `many`, `extended`. */
  operationGroups?: Partial<Record<OperationGroupName, boolean>>;
}

/**
 * Loose operations bag used as the config constraint. Values are `unknown` on purpose: the typed
 * per-resource view (`TypedOperations`) supplies the handler signatures, and a function type here
 * would compete with it for the handler's contextual type. Runtime validation enforces the shape.
 */
export type MockOperations = Partial<Record<AllBuiltinOpName, unknown>> & Record<string, unknown>;

export interface MockResourceConfig extends MockOperationSelection {
  /** Dataset id from the catalog (`datasets/manifest.json`). */
  type: DatasetId;
  /**
   * Seed window: first N records, or half-open `{ start, end }` (Array.slice).
   * Overshooting the dataset returns all records. A seed limit, not a growth cap.
   */
  slice?: MockSlice;
  /** `getAll()` returns `{ data, total, page, pageSize }` and accepts `{ page, pageSize }`. */
  pagination?: boolean;
  /**
   * Enable, disable, override or add operations: `true` keeps/enables a builtin, `false` removes
   * it, a function replaces it (or defines a custom operation).
   */
  operations?: MockOperations;
}

/** Resource object of the flat compatibility form: handlers get the generic row context. */
export interface MockFlatResourceConfig extends Omit<MockResourceConfig, "operations"> {
  operations?: Partial<Record<AllBuiltinOpName, MockOperationValue>> &
    Record<string, MockOperationValue>;
}

/** Per-resource input: dataset id string, or full config object. */
export type MockApiResourceInput = DatasetId | MockFlatResourceConfig;

/**
 * Root `defineMockApi` configuration. Mirrors `defineApi`: resources live under `resources`.
 * The root carries the operation-selection settings every resource inherits.
 */
export interface MockRootConfig extends MockOperationSelection {
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
  getAll: [params?: PageParams];
  getById: [id: Id];
  getBySlug: [slug: string];
  getMany: [ids: Id[]];
  getBy: [field: Extract<keyof T, string>, value: Id];
  findFirst: [query?: Partial<T>];
  search: [query?: Partial<T>];
  exists: [id: Id];
  count: [query?: Partial<T>];
  create: [input: ResourceInput<T, IdKey>];
  update: [id: Id, input: ResourceInput<T, IdKey>];
  patch: [id: Id, partial: Partial<T>];
  upsert: [id: Id, input: ResourceInput<T, IdKey>];
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
  [custom: string]: boolean | MockOperationFn<T>;
};

type SelectionKeys = keyof MockOperationSelection;

/** Reports unknown keys at the exact property. */
type Exact<T, Shape> = {
  [K in Exclude<keyof T, keyof Shape>]: never;
};

/** Per-resource typed view, keyed by the dataset id inferred from `type` (see `TypedResources`). */
type TypedResource<Ty extends DatasetId> = {
  type: Ty;
  operations?: TypedOperations<EntityOf<Ty>, IdKeyOf<Ty>>;
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

/** Reports unknown keys on the root and on each resource, and `readOnly` + `writeOnly` together. */
export type ValidateMockRoot<C> = C extends { resources: infer Res }
  ? Exact<C, MockRootConfig> &
      (C extends { readOnly: true; writeOnly: true } ? { writeOnly: never } : unknown) & {
        resources: { [K in keyof Res]: ValidateResource<Res[K]> };
      }
  : { [K in keyof C]: ValidateResource<C[K]> };

type ValidateResource<R> = R extends string
  ? unknown
  : Exact<R, MockResourceConfig> &
      (R extends { readOnly: true; writeOnly: true } ? { writeOnly: never } : unknown) &
      (R extends { operations: infer Ops }
        ? {
            operations: {
              [O in keyof Ops]: O extends AllBuiltinOpName
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

type GetAllFn<T, Paginated> = [Paginated] extends [true]
  ? (params?: PageParams) => Promise<Page<T>>
  : () => Promise<T[]>;

type BuiltinFn<
  N extends AllBuiltinOpName,
  T extends object,
  IdKey extends keyof T,
  Paginated,
> = N extends "getAll"
  ? GetAllFn<T, Paginated>
  : {
      getBySlug: (slug: string) => Promise<T>;
      getById: (id: Id) => Promise<T>;
      getMany: (ids: Id[]) => Promise<T[]>;
      getBy: (field: Extract<keyof T, string>, value: Id) => Promise<T>;
      findFirst: (query?: Partial<T>) => Promise<T | null>;
      search: (query?: Partial<T>) => Promise<T[]>;
      exists: (id: Id) => Promise<boolean>;
      count: (query?: Partial<T>) => Promise<number>;
      create: (input: ResourceInput<T, IdKey>) => Promise<T>;
      update: (id: Id, input: ResourceInput<T, IdKey>) => Promise<T>;
      patch: (id: Id, partial: Partial<T>) => Promise<T>;
      upsert: (id: Id, input: ResourceInput<T, IdKey>) => Promise<T>;
      delete: (id: Id) => Promise<void>;
      createMany: (inputs: ResourceInput<T, IdKey>[]) => Promise<T[]>;
      deleteMany: (ids: Id[]) => Promise<void>;
    }[Exclude<N, "getAll">];

/** Runtime operation entries that are not disabled. */
type OpsOf<R> = R extends { operations: infer Ops }
  ? Ops extends Record<string, unknown>
    ? { [K in keyof Ops as Ops[K] extends false ? never : K]-?: Exclude<Ops[K], false | undefined> }
    : {}
  : {};

type FnOnly<Op> = Op extends (...args: never[]) => unknown ? Op : never;

/** Drop the bound `ctx` and make the result a promise, like the runtime does. */
type Callable<F> = F extends (ctx: never, ...args: infer A) => infer Ret
  ? (...args: A) => Promise<Awaited<Ret>>
  : never;

type CustomNames<R> = Exclude<keyof OpsOf<R>, AllBuiltinOpName>;

type ClientFn<
  N extends AllBuiltinOpName,
  Config,
  T extends object,
  IdKey extends keyof T,
  Paginated,
> = N extends keyof OpsOf<Config>
  ? [FnOnly<OpsOf<Config>[N]>] extends [never]
    ? BuiltinFn<N, T, IdKey, Paginated>
    : Callable<FnOnly<OpsOf<Config>[N]>>
  : BuiltinFn<N, T, IdKey, Paginated>;

/** Only the literal `true` enables the page envelope; `false` / absent → plain list. */
type PaginationOf<R> = R extends { readonly pagination: true }
  ? true
  : R extends { readonly pagination: false }
    ? false
    : undefined;

/**
 * In-memory CRUD for one resource. Methods exist exactly when the resolved operation selection
 * (root + resource, same precedence as Core) enables them. No network, no persistence; every
 * method returns a fresh copy; failures reject with `MockApiError` (check `code`).
 */
export type MockResource<
  T extends object,
  IdKey extends keyof T,
  Paginated extends boolean | undefined = undefined,
  Config = {},
> = Simplify<
  {
    [N in KnownOpName<Config>]: ClientFn<N, Config, T, IdKey, Paginated>;
  } & {
    [N in MaybeOpName<Config>]?: ClientFn<N, Config, T, IdKey, Paginated>;
  } & {
    [N in CustomNames<Config>]: Callable<FnOnly<OpsOf<Config>[N]>>;
  }
>;

type RootSelection<C> = Pick<C, Extract<keyof C, SelectionKeys>>;

type GroupsOf<Root, R> = "operationGroups" extends keyof Root | keyof R
  ? {
      operationGroups: Omit<
        Root extends { operationGroups: infer G } ? G : {},
        keyof (R extends { operationGroups: infer H } ? H : {})
      > &
        (R extends { operationGroups: infer H } ? H : {});
    }
  : {};

/** Root settings overlaid by the resource's own (resource wins; groups merge per group). */
export type EffectiveConfig<Root, R> = Omit<RootSelection<Root>, keyof R | "operationGroups"> &
  Omit<R, "operationGroups"> &
  GroupsOf<Root, R>;

type ResourcesIn<C> = C extends { resources: infer Res } ? Res : C;
type ResolvedResource<R> = R extends string ? { readonly type: R } : R;

export type MockApi<C> = {
  [K in keyof ResourcesIn<C>]: ResolvedResource<ResourcesIn<C>[K]> extends infer R
    ? R extends { type: infer Ty extends DatasetId }
      ? MockResource<
          EntityOf<Ty>,
          IdKeyOf<Ty>,
          PaginationOf<R> extends true ? true : undefined,
          EffectiveConfig<C extends { resources: unknown } ? C : {}, R>
        >
      : never
    : never;
};
