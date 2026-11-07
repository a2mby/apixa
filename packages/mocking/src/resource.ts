import {
  applyResourceSliceToListResult,
  MockError,
  MockStore,
  runBuiltin,
  type BuiltinIntent,
  type MockSource,
  type PaginationMode,
} from "@apixa/core";
import { catalog, type DatasetId } from "./catalog.js";
import { MockApiError, type MockApiErrorCode } from "./errors.js";
import type { MockSlice } from "./slice.js";
import { MOCK_BUILTINS, type MockOperationContext, type MockOperationFn } from "./mock-types.js";

export {
  MOCK_BUILTINS,
  type MockResource,
  type MockOperationContext,
  type MockOperationFn,
  type MockOperationValue,
  type MockResourceDefaults,
  type Page,
  type CursorPage,
  type PaginationConfig,
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
    const code =
      error.code === "MOCK_INVALID_INPUT" && PAGING_MESSAGE.test(error.message)
        ? "INVALID_PAGINATION"
        : (CODES[error.code] ?? "INVALID_INPUT");
    const translated = new MockApiError(code, error.message);
    (translated as { cause?: unknown }).cause = error;
    throw translated;
  }
  throw error;
}

/** `operations` is the already-resolved set (Core's `expandOperations`): enabled names only. */
export type ResourceOptions = {
  slice?: MockSlice;
  seed?: MockSource["seed"];
  pagination?: boolean | PaginationMode;
  operations: Record<string, unknown>;
};

/** Paging keys are config of the call, not filters; everything else in the query filters rows. */
const PAGING_MESSAGE = /: (page|pageSize|cursor) must be/;

/** One resource: Core's `MockStore` and `runBuiltin` (the shared engine) plus calling conventions. */
export function createResource(name: string, type: DatasetId, options: ResourceOptions) {
  const label = `Mock resource "${name}"`;
  const entry = catalog[type] as {
    idKey: string;
    load: () => Promise<{ default: readonly unknown[] }>;
  };
  const source: MockSource = {
    label,
    idKey: entry.idKey,
    load: async () => (await entry.load()).default,
    // Catalog datasets are module-cached and never mutated: no private snapshot needed.
    seed: options.seed,
    immutable: true,
  };
  const store = new MockStore(source);
  const pagination: PaginationMode | undefined =
    options.pagination === true ? "page" : options.pagination || undefined;
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

  /** A builtin runs through Core's `runBuiltin`: the same code as a Core mocked resource. */
  const run =
    <A extends unknown[]>(intent: (...args: A) => BuiltinIntent) =>
    async (...args: A): Promise<unknown> => {
      try {
        const built = intent(...args);
        const { data } = await runBuiltin(store, source, built, pagination);
        // A mock `delete` resolves to nothing (Core's wire shape is a 204 with a null body).
        return built.op === "delete" || built.op === "deleteMany" ? undefined : data;
      } catch (error) {
        return translate(error);
      }
    };

  const getAllFn = run((query?: Record<string, unknown>) => ({ op: "getAll", query }));
  const builtins: Record<(typeof MOCK_BUILTINS)[number], (...args: never[]) => Promise<unknown>> = {
    // `slice` caps the list result (like Core); the store keeps every record.
    getAll: async (query?: Record<string, unknown>) =>
      applyResourceSliceToListResult(await getAllFn(query), options.slice),
    getById: run((id: Id) => ({ op: "getById", id })),
    getBySlug: run((slug: Id) => ({ op: "getBySlug", slug })),
    getMany: run((ids: Id[]) => ({ op: "getMany", ids })),
    getBy: run((field: string, value: Id) => ({ op: "getBy", field, value })),
    findFirst: run((query?: Record<string, unknown>) => ({ op: "findFirst", query })),
    search: run((query?: Record<string, unknown>) => ({ op: "search", query })),
    exists: run((id: Id) => ({ op: "exists", id })),
    count: run((query?: Record<string, unknown>) => ({ op: "count", query })),
    create: run((body: unknown) => ({ op: "create", body })),
    update: run((id: Id, body: unknown) => ({ op: "update", id, body })),
    patch: run((id: Id, body: unknown) => ({ op: "patch", id, body })),
    upsert: run((id: Id, body: unknown) => ({ op: "upsert", id, body })),
    delete: run((id: Id) => ({ op: "delete", id })),
    createMany: run((body: unknown[]) => ({ op: "createMany", body })),
    deleteMany: run((body: Id[]) => ({ op: "deleteMany", body })),
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
