import { MockError, MockStore, type MockSource } from "@apixa/core";
import { catalog, type DatasetId } from "./catalog.js";
import { MockApiError, type MockApiErrorCode } from "./errors.js";
import type { MockSlice } from "./slice.js";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MOCK_BUILTINS,
  type MockOperationContext,
  type MockOperationFn,
  type PageParams,
} from "./mock-types.js";

export {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MOCK_BUILTINS,
  type MockResource,
  type MockOperationContext,
  type MockOperationFn,
  type MockOperationValue,
  type MockResourceDefaults,
  type Page,
  type PageParams,
  type ResourceInput,
} from "./mock-types.js";

type Id = string | number;

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

/** `operations` is the already-resolved set (Core's `expandOperations`): enabled names only. */
export type ResourceOptions = {
  slice?: MockSlice;
  pagination?: boolean;
  operations: Record<string, unknown>;
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
    // Catalog datasets are module-cached and never mutated: no private snapshot needed.
    immutable: true,
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
  for (const [opName, definition] of Object.entries(options.operations)) {
    if (typeof definition === "function") {
      resource[opName] = custom(definition as MockOperationFn<Row>);
    } else if ((MOCK_BUILTINS as readonly string[]).includes(opName)) {
      resource[opName] = builtins[opName as (typeof MOCK_BUILTINS)[number]];
    }
  }
  return resource;
}
