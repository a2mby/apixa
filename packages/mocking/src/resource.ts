import { MockError, MockStore, type MockSource } from "@apixa/core";
import { catalog, type DatasetId } from "./catalog.js";
import { MockApiError, type MockApiErrorCode } from "./errors.js";
import type { MockSlice } from "./slice.js";

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

type Id = string | number;

/** `create` / `update` input: the entity, with its id optional. */
export type ResourceInput<T, IdKey extends keyof T> = Omit<T, IdKey> & Partial<Pick<T, IdKey>>;

/** `pagination: true` → page envelope; anything else → plain `T[]` (never a `Page | T[]` union). */
type GetAll<T, Paginated> = [Paginated] extends [true]
  ? (params?: PageParams) => Promise<Page<T>>
  : () => Promise<T[]>;

/** Plain CRUD helpers custom operation functions may reuse through `ctx.defaults`. */
export type MockResourceDefaults<T extends object> = {
  getAll(): Promise<T[]>;
  getById(id: Id): Promise<T>;
  create(input: unknown): Promise<T>;
  update(id: Id, input: unknown): Promise<T>;
  patch(id: Id, partial: unknown): Promise<T>;
  delete(id: Id): Promise<void>;
};

/** What a custom mock operation function receives as its first argument. */
export interface MockOperationContext<T extends object = Record<string, unknown>> {
  idKey: string;
  /** Live, mutable rows — read or write directly for a custom operation. */
  rows(): Promise<T[]>;
  fail(code: MockApiErrorCode, message: string): MockApiError;
  defaults: MockResourceDefaults<T>;
}

/** A fully custom mock operation; `ctx` is bound, callers never pass it. */
export type MockOperationFn<T extends object = Record<string, unknown>> = {
  bivariant(ctx: MockOperationContext<T>, ...args: unknown[]): Promise<unknown>;
}["bivariant"];

/** Per-operation customization: `false` removes a builtin, a function replaces it, `true` keeps it. */
export type MockOperationValue = boolean | MockOperationFn;

/** The 16 builtins — the same names and in-memory semantics as Core mocked resources. */
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
] as const;

/**
 * In-memory CRUD for one resource. No network, no persistence. Every method returns a fresh
 * copy. Failures reject with `MockApiError` (check `code`).
 */
export interface MockResource<
  T extends object,
  IdKey extends keyof T,
  Paginated extends boolean | undefined = undefined,
> {
  getAll: GetAll<T, Paginated>;
  getById(id: Id): Promise<T>;
  /** Missing id → generated (numeric-id data only). Duplicate id → `DUPLICATE_ID`. */
  create(input: ResourceInput<T, IdKey>): Promise<T>;
  /** Replaces the record. The id is kept; passing a different id is `INVALID_INPUT`. */
  update(id: Id, input: ResourceInput<T, IdKey>): Promise<T>;
  /** Merges the supplied fields (keys set to `undefined` are skipped). */
  patch(id: Id, partial: Partial<T>): Promise<T>;
  delete(id: Id): Promise<void>;
  /** The other 10 builtins and custom operations. */
  [operation: string]: (...args: never[]) => Promise<unknown>;
}

const CODES: Record<string, MockApiErrorCode> = {
  MOCK_NOT_FOUND: "NOT_FOUND",
  MOCK_DUPLICATE_ID: "DUPLICATE_ID",
  MOCK_INVALID_INPUT: "INVALID_INPUT",
  MOCK_UNSUPPORTED: "INVALID_CONFIG",
  MOCK_LOAD: "UNKNOWN_DATASET",
};

/** Keep `defineMockApi`'s documented `MockApiError` surface over Core's shared engine. */
function translate(error: unknown): never {
  if (error instanceof MockError) {
    const translated = new MockApiError(CODES[error.code] ?? "INVALID_INPUT", error.message);
    (translated as { cause?: unknown }).cause = error;
    throw translated;
  }
  throw error;
}

export type ResourceOptions = {
  slice?: MockSlice;
  pagination?: boolean;
  operations?: Record<string, MockOperationValue>;
};

function seedFromSlice(slice: MockSlice | undefined): MockSource["seed"] {
  if (slice === undefined) return undefined;
  if (typeof slice === "number") return { limit: slice };
  return { offset: slice.start, limit: slice.end - slice.start };
}

/** One resource: Core's `MockStore` (shared engine) plus `defineMockApi`'s calling conventions. */
export function createResource(name: string, type: DatasetId, options: ResourceOptions) {
  const label = `Mock resource "${name}"`;
  const entry = catalog[type] as {
    idKey: string;
    load: () => Promise<{ default: readonly unknown[] }>;
  };
  const store = new MockStore({
    label,
    idKey: entry.idKey,
    load: async () => (await entry.load()).default,
    seed: seedFromSlice(options.slice),
  });
  const fail = (code: MockApiErrorCode, message: string) =>
    new MockApiError(code, `${label}: ${message}`);

  /** Run against the loaded store; engine errors surface as `MockApiError`. */
  const use =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    async (...args: A): Promise<Awaited<R>> => {
      try {
        await store.ready();
        return await fn(...args);
      } catch (error) {
        return translate(error);
      }
    };

  function resolvePage(params: unknown): { page: number; pageSize: number } {
    if (params === undefined) return { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE };
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw fail("INVALID_PAGINATION", "getAll() options must be { page?, pageSize? }");
    }
    for (const key of Object.keys(params)) {
      if (key !== "page" && key !== "pageSize")
        throw fail("INVALID_PAGINATION", `unknown option "${key}" (use page, pageSize)`);
    }
    const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE } = params as PageParams;
    for (const [field, value] of [
      ["page", page],
      ["pageSize", pageSize],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw fail("INVALID_PAGINATION", `${field} must be an integer >= 1 (got ${String(value)})`);
      }
    }
    return { page, pageSize };
  }

  const builtins: Record<(typeof MOCK_BUILTINS)[number], (...args: never[]) => Promise<unknown>> = {
    getAll: use((params?: PageParams) => {
      const rows = store.list();
      if (!options.pagination) {
        if (params !== undefined)
          throw fail("INVALID_PAGINATION", "pagination is not enabled; set pagination: true");
        return rows;
      }
      const { page, pageSize } = resolvePage(params);
      const lastPage = Math.max(1, Math.ceil(rows.length / pageSize));
      if (page > lastPage)
        throw fail("INVALID_PAGINATION", `page ${page} is out of range (last page is ${lastPage})`);
      const start = (page - 1) * pageSize;
      return {
        data: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
        previous: page > 1 ? page - 1 : null,
        next: page < lastPage ? page + 1 : null,
      };
    }),
    getById: use((id: Id) => store.get(id)),
    getBySlug: use((slug: Id) => store.getBy("slug", slug)),
    getMany: use((ids: Id[]) => store.getMany(ids)),
    getBy: use((field: string, value: Id) => store.getBy(field, value)),
    findFirst: use((query?: Record<string, unknown>) => store.findFirst(query)),
    search: use((query?: Record<string, unknown>) => store.search(query)),
    exists: use((id: Id) => store.exists(id)),
    count: use((query?: Record<string, unknown>) => store.count(query)),
    create: use((input: unknown) => store.create(input)),
    update: use((id: Id, input: unknown) => store.update(id, input)),
    patch: use((id: Id, input: unknown) => store.patch(id, input)),
    upsert: use((id: Id, input: unknown) => store.upsert(id, input)),
    delete: use((id: Id) => store.delete(id)),
    createMany: use((inputs: unknown[]) => store.createMany(inputs)),
    deleteMany: use((ids: Id[]) => store.deleteMany(ids)),
  };

  type Row = Record<string, unknown>;
  const ctx: MockOperationContext<Row> = {
    idKey: entry.idKey,
    rows: async () => {
      await store.ready().catch(translate);
      return store.liveRows();
    },
    fail,
    defaults: {
      getAll: use(() => store.list()),
      getById: use((id: Id) => store.get(id)),
      create: use((input: unknown) => store.create(input)),
      update: use((id: Id, input: unknown) => store.update(id, input)),
      patch: use((id: Id, input: unknown) => store.patch(id, input)),
      delete: use((id: Id) => store.delete(id)),
    },
  };

  const custom =
    (fn: MockOperationFn<Row>) =>
    async (...args: unknown[]) => {
      try {
        return await fn(ctx, ...args);
      } finally {
        store.reindex();
      }
    };

  const resource: Record<string, (...args: never[]) => Promise<unknown>> = {};
  for (const opName of MOCK_BUILTINS) {
    const override = options.operations?.[opName];
    if (override === false) continue;
    resource[opName] = typeof override === "function" ? custom(override) : builtins[opName];
  }
  for (const [opName, override] of Object.entries(options.operations ?? {})) {
    if (
      (MOCK_BUILTINS as readonly string[]).includes(opName) ||
      override === false ||
      override === undefined
    )
      continue;
    if (typeof override === "function") {
      resource[opName] = custom(override);
      continue;
    }
    throw fail("INVALID_CONFIG", `unknown builtin operation "${opName}"`);
  }
  return resource as unknown as MockResource<Row, string, boolean | undefined>;
}
