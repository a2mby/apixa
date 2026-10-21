import { catalog, type DatasetId } from "./catalog.js";
import { MockApiError } from "./errors.js";

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

type GetAll<T, Paginated> = [Paginated] extends [true]
  ? (params?: PageParams) => Promise<Page<T>>
  : [Paginated] extends [false | undefined]
    ? () => Promise<T[]>
    : (params?: PageParams) => Promise<Page<T> | T[]>;

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
}

type Row = Record<string, unknown>;
type State = { rows: Row[]; generateId?: () => Id };

export type ResourceOptions = { size?: number; pagination?: boolean };

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
    const rows = (options.size === undefined ? all : all.slice(0, options.size)).map((r) =>
      structuredClone(r),
    );

    // Generate ids only where the dataset's own convention is numeric (e.g. "1", "2", …).
    if (!all.every((r) => /^\d+$/.test(String(r[idKey])))) return { rows };
    const numberIds = typeof all[0]?.[idKey] === "number";
    let counter = Math.max(0, ...rows.map((r) => Number(r[idKey])));
    return {
      rows,
      generateId: () => {
        do counter++;
        while (indexOf(rows, counter) >= 0);
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

  function locate(rows: Row[], id: unknown): number {
    if ((typeof id !== "string" && typeof id !== "number") || id === "") {
      throw fail("INVALID_INPUT", `id must be a non-empty string or number (got ${String(id)})`);
    }
    const index = indexOf(rows, id);
    if (index < 0) throw fail("NOT_FOUND", `no record with ${idKey} "${String(id)}"`);
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

  return {
    async getAll(params?: PageParams) {
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
    },

    async getById(id: Id) {
      const { rows } = await state();
      return structuredClone(rows[locate(rows, id)]!);
    },

    async create(input: unknown) {
      const row = copyInput(input, "create() input");
      const { rows, generateId } = await state();
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
      } else if (indexOf(rows, row[idKey] as Id) >= 0) {
        throw fail("DUPLICATE_ID", `a record with ${idKey} "${String(row[idKey])}" already exists`);
      }
      rows.push(row);
      return structuredClone(row);
    },

    async update(id: Id, input: unknown) {
      const row = copyInput(input, "update() input");
      const { rows } = await state();
      const index = locate(rows, id);
      const current = rows[index]!;
      assertSameId(row, current);
      const { [idKey]: _id, ...fields } = row;
      rows[index] = { [idKey]: current[idKey], ...fields };
      return structuredClone(rows[index]!);
    },

    async patch(id: Id, partial: unknown) {
      const changes = copyInput(partial, "patch() input");
      const { rows } = await state();
      const current = rows[locate(rows, id)]!;
      assertSameId(changes, current);
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined && key !== idKey) current[key] = value;
      }
      return structuredClone(current);
    },

    async delete(id: Id) {
      const { rows } = await state();
      rows.splice(locate(rows, id), 1);
    },
  };
}
