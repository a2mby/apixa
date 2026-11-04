import { catalog, type DatasetId } from "./catalog.js";
import { MockApiError } from "./errors.js";
import { applySlice, type MockSlice } from "./slice.js";

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

/** Always-on default CRUD, reusable by custom operation functions via `ctx.defaults`. */
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
  fail(code: ConstructorParameters<typeof MockApiError>[0], message: string): MockApiError;
  defaults: MockResourceDefaults<T>;
}

/**
 * A fully custom mock operation: called exactly like a builtin — `mockApi.resource.<name>(...)`.
 * The first parameter (`ctx`) is bound; callers never pass it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockOperationFn<T extends object = Record<string, unknown>> = (
  ctx: MockOperationContext<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Promise<unknown>;

/**
 * Per-operation customization: `false` removes a builtin, a function replaces it. `true` is
 * accepted as a no-op ("use the default impl") since every builtin below is already on by
 * default — kept for explicitness and backward compatibility.
 */
export type MockOperationValue = boolean | MockOperationFn;

/** The original 6, always present unless set to `false`. */
export const ALWAYS_ON_MOCK_OPS = [
  "getAll",
  "getById",
  "create",
  "update",
  "patch",
  "delete",
] as const;

/** Added in v0.10.0 — present by default, same as the original 6, unless set to `false`. */
export const EXTENDED_MOCK_OPS = [
  "getBySlug",
  "upsert",
  "count",
  "search",
  "createMany",
  "deleteMany",
  "getMany",
  "exists",
  "findFirst",
  "getBy",
] as const;

/**
 * In-memory CRUD for one resource. No network, no persistence.
 * Every method returns a fresh copy, so callers can never mutate stored records.
 * Missing records reject with `MockApiError` code `NOT_FOUND` — including `delete()`.
 */
export interface MockResource<
  T extends object,
  IdKey extends keyof T,
  Paginated extends boolean | undefined = undefined,
> {
  /** Plain list, or `{ data, total, page, pageSize }` when the resource has `pagination: true`. */
  getAll: GetAll<T, Paginated>;
  getById(id: Id): Promise<T>;
  /** Missing id → generated (numeric-id datasets only). Duplicate id → `DUPLICATE_ID`. */
  create(input: ResourceInput<T, IdKey>): Promise<T>;
  /** Replaces the record. The id is kept; passing a different id is `INVALID_INPUT`. */
  update(id: Id, input: ResourceInput<T, IdKey>): Promise<T>;
  /** Merges the supplied fields (keys set to `undefined` are skipped). */
  patch(id: Id, partial: Partial<T>): Promise<T>;
  delete(id: Id): Promise<void>;
  /** Builtins added in v0.10.0 (present by default) and fully custom operations. */
  [operation: string]: (...args: never[]) => Promise<unknown>;
}

type Row = Record<string, unknown>;
/** `byId` mirrors `rows` by reference — O(1) `getById` / `exists` / `patch` instead of a linear scan. */
type State = { rows: Row[]; byId: Map<string, Row>; generateId?: () => Id };

export type ResourceOptions = {
  slice?: MockSlice;
  pagination?: boolean;
  operations?: Record<string, MockOperationValue>;
};

/** One resource's engine. Seeded lazily from the dataset on first use; state is private to this call. */
export function createResource(name: string, type: DatasetId, options: ResourceOptions) {
  const { idKey, load } = catalog[type] as {
    idKey: string;
    load: () => Promise<{ default: Row[] }>;
  };
  const fail = (code: ConstructorParameters<typeof MockApiError>[0], message: string) =>
    new MockApiError(code, `Mock resource "${name}": ${message}`);

  async function seed(): Promise<State> {
    const all = (await load()).default;
    // The imported module is shared and read-only: always copy before storing.
    const rows = applySlice(all, options.slice, `Mock resource "${name}"`).map((r) =>
      structuredClone(r),
    );
    const byId = new Map(rows.map((r) => [String(r[idKey]), r] as const));

    // Generate ids only where the dataset's own convention is numeric (e.g. "1", "2", …).
    if (!all.every((r) => /^\d+$/.test(String(r[idKey])))) return { rows, byId };
    const numberIds = typeof all[0]?.[idKey] === "number";
    let counter = Math.max(0, ...rows.map((r) => Number(r[idKey])));
    return {
      rows,
      byId,
      generateId: () => {
        do counter++;
        while (byId.has(String(counter)));
        return numberIds ? counter : String(counter);
      },
    };
  }

  let ready: Promise<State> | undefined;
  const state = () =>
    (ready ??= seed().catch((error: unknown) => {
      ready = undefined; // let the next call retry a failed load
      throw error;
    }));

  const indexOf = (rows: Row[], id: Id) => rows.findIndex((r) => String(r[idKey]) === String(id));

  function assertValidId(id: unknown): string {
    if ((typeof id !== "string" && typeof id !== "number") || id === "") {
      throw fail("INVALID_INPUT", `id must be a non-empty string or number (got ${String(id)})`);
    }
    return String(id);
  }

  /** O(1) row lookup by id (via the `byId` map) — used by `getById` / `patch` / `exists`. */
  function locateRow(byId: Map<string, Row>, id: unknown): Row {
    const key = assertValidId(id);
    const row = byId.get(key);
    if (!row) throw fail("NOT_FOUND", `no record with ${idKey} "${key}"`);
    return row;
  }

  /** O(n) index lookup — only `update` / `delete` need the array index itself (for splice/replace). */
  function locate(rows: Row[], id: unknown): number {
    const key = assertValidId(id);
    const index = indexOf(rows, key);
    if (index < 0) throw fail("NOT_FOUND", `no record with ${idKey} "${key}"`);
    return index;
  }

  function copyInput(value: unknown, what: string): Row {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw fail("INVALID_INPUT", `${what} must be a plain object`);
    }
    try {
      return structuredClone(value) as Row;
    } catch {
      throw fail("INVALID_INPUT", `${what} must only contain structured-cloneable values`);
    }
  }

  function assertSameId(input: Row, current: Row) {
    if (input[idKey] !== undefined && String(input[idKey]) !== String(current[idKey])) {
      throw fail("INVALID_INPUT", `cannot change ${idKey} from "${String(current[idKey])}"`);
    }
  }

  function resolvePage(params: unknown) {
    if (params === undefined) return { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE };
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw fail("INVALID_PAGINATION", "getAll() options must be { page?, pageSize? }");
    }
    for (const key of Object.keys(params)) {
      if (key !== "page" && key !== "pageSize") {
        throw fail("INVALID_PAGINATION", `unknown option "${key}" (use page, pageSize)`);
      }
    }
    const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE } = params as PageParams;
    for (const [label, value] of [
      ["page", page],
      ["pageSize", pageSize],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw fail("INVALID_PAGINATION", `${label} must be an integer >= 1 (got ${String(value)})`);
      }
    }
    return { page, pageSize };
  }

  // ---- always-on default CRUD (unchanged behavior; reusable via ctx.defaults) ----
  const defaults: MockResourceDefaults<Row> = {
    async getAll() {
      const { rows } = await state();
      return rows.map((r) => structuredClone(r));
    },

    async getById(id: Id) {
      const { byId } = await state();
      return structuredClone(locateRow(byId, id));
    },

    async create(input: unknown) {
      const row = copyInput(input, "create() input");
      const { rows, byId, generateId } = await state();
      if (row[idKey] === undefined) {
        if (!generateId) {
          throw fail(
            "INVALID_INPUT",
            `create() needs "${idKey}": this dataset has non-numeric ids`,
          );
        }
        row[idKey] = generateId();
      } else if (
        (typeof row[idKey] !== "string" && typeof row[idKey] !== "number") ||
        row[idKey] === ""
      ) {
        throw fail("INVALID_INPUT", `${idKey} must be a non-empty string or number`);
      } else if (byId.has(String(row[idKey]))) {
        throw fail("DUPLICATE_ID", `a record with ${idKey} "${String(row[idKey])}" already exists`);
      }
      rows.push(row);
      byId.set(String(row[idKey]), row);
      return structuredClone(row);
    },

    async update(id: Id, input: unknown) {
      const row = copyInput(input, "update() input");
      const { rows, byId } = await state();
      const index = locate(rows, id);
      const current = rows[index]!;
      assertSameId(row, current);
      const { [idKey]: _id, ...fields } = row;
      const updated = { [idKey]: current[idKey], ...fields };
      rows[index] = updated;
      byId.set(String(current[idKey]), updated);
      return structuredClone(updated);
    },

    async patch(id: Id, partial: unknown) {
      const changes = copyInput(partial, "patch() input");
      const { byId } = await state();
      const current = locateRow(byId, id);
      assertSameId(changes, current);
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined && key !== idKey) current[key] = value;
      }
      return structuredClone(current);
    },

    async delete(id: Id) {
      const { rows, byId } = await state();
      const index = locate(rows, id);
      byId.delete(String(rows[index]![idKey]));
      rows.splice(index, 1);
    },
  };

  async function getAllPublic(params?: PageParams) {
    const { rows } = await state();
    if (!options.pagination) {
      if (params !== undefined) {
        throw fail("INVALID_PAGINATION", "pagination is not enabled; set pagination: true");
      }
      return rows.map((r) => structuredClone(r));
    }
    const { page, pageSize } = resolvePage(params);
    const lastPage = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > lastPage) {
      throw fail("INVALID_PAGINATION", `page ${page} is out of range (last page is ${lastPage})`);
    }
    const start = (page - 1) * pageSize;
    return {
      data: rows.slice(start, start + pageSize).map((r) => structuredClone(r)),
      total: rows.length,
      page,
      pageSize,
      previous: page > 1 ? page - 1 : null,
      next: page < lastPage ? page + 1 : null,
    };
  }

  const ctx: MockOperationContext<Row> = {
    idKey,
    rows: async () => (await state()).rows,
    fail,
    defaults,
  };

  // ---- builtins added in v0.10.0 — pure data operations, present by default ----
  const extendedDefaults: Record<string, MockOperationFn<Row>> = {
    async getBySlug(opCtx, slug: Id) {
      const rows = await opCtx.rows();
      const row = rows.find((r) => String(r.slug) === String(slug));
      if (!row) throw opCtx.fail("NOT_FOUND", `no record with slug "${String(slug)}"`);
      return structuredClone(row);
    },

    async getBy(opCtx, field: string, value: Id) {
      const rows = await opCtx.rows();
      const row = rows.find((r) => String(r[field]) === String(value));
      if (!row) throw opCtx.fail("NOT_FOUND", `no record with ${field} "${String(value)}"`);
      return structuredClone(row);
    },

    async upsert(opCtx, id: Id, input: unknown) {
      const rows = await opCtx.rows();
      return indexOf(rows, id) >= 0
        ? opCtx.defaults.update(id, input)
        : opCtx.defaults.create({ ...copyInput(input, "upsert() input"), [idKey]: id });
    },

    async count(opCtx) {
      const rows = await opCtx.rows();
      return rows.length;
    },

    async search(opCtx, query?: Record<string, unknown>) {
      const rows = await opCtx.rows();
      if (query === undefined || query === null) {
        return rows.map((r) => structuredClone(r));
      }
      const entries = Object.entries(query);
      return rows
        .filter((row) =>
          entries.every(([key, value]) =>
            String(row[key] ?? "")
              .toLowerCase()
              .includes(String(value).toLowerCase()),
          ),
        )
        .map((r) => structuredClone(r));
    },

    async createMany(opCtx, inputs: unknown[]) {
      const created: Row[] = [];
      for (const input of inputs) {
        created.push((await opCtx.defaults.create(input)) as Row);
      }
      return created;
    },

    async deleteMany(opCtx, ids: Id[]) {
      for (const id of ids) {
        await opCtx.defaults.delete(id);
      }
    },

    async getMany(opCtx, ids: Id[]) {
      const rows = await opCtx.rows();
      return ids.map((id) => {
        const row = rows.find((r) => String(r[idKey]) === String(id));
        if (!row) throw opCtx.fail("NOT_FOUND", `no record with ${idKey} "${String(id)}"`);
        return structuredClone(row);
      });
    },

    async exists(opCtx, id: Id) {
      try {
        await opCtx.defaults.getById(id);
        return true;
      } catch (error) {
        if (error instanceof MockApiError && error.code === "NOT_FOUND") return false;
        throw error;
      }
    },

    async findFirst(opCtx, query?: Record<string, unknown>) {
      const matches = (await extendedDefaults.search!(opCtx, query)) as Row[];
      return matches[0] ?? null;
    },
  };

  const resource: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const BUILTIN_NAMES = [...ALWAYS_ON_MOCK_OPS, ...EXTENDED_MOCK_OPS] as readonly string[];

  // All 16 builtins (original 6 + the 10 added in v0.10.0) are on by default, same philosophy
  // as Core: `false` removes one, a function replaces it.
  for (const opName of BUILTIN_NAMES) {
    const override = options.operations?.[opName];
    if (override === false) continue;

    if (typeof override === "function") {
      resource[opName] = (...args: unknown[]) => override(ctx, ...args);
    } else if (opName === "getAll") {
      resource[opName] = (...args: unknown[]) => getAllPublic(args[0] as PageParams | undefined);
    } else if ((ALWAYS_ON_MOCK_OPS as readonly string[]).includes(opName)) {
      resource[opName] = defaults[opName as keyof MockResourceDefaults<Row>] as (
        ...args: unknown[]
      ) => Promise<unknown>;
    } else {
      const impl = extendedDefaults[opName]!;
      resource[opName] = (...args: unknown[]) => impl(ctx, ...args);
    }
  }

  for (const [opName, override] of Object.entries(options.operations ?? {})) {
    if (BUILTIN_NAMES.includes(opName)) continue; // handled above
    if (override === false || override === undefined) continue; // not enabled / no-op removal

    if (typeof override === "function") {
      resource[opName] = (...args: unknown[]) => override(ctx, ...args);
      continue;
    }

    // `true` on a name with no default implementation — nothing to enable.
    throw fail("INVALID_CONFIG", `unknown builtin operation "${opName}"`);
  }

  return resource as unknown as MockResource<Row, string, boolean | undefined>;
}
