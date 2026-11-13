import {
  MockError,
  ValidationError,
  resolvePagination,
  type MockSource,
  type ResourcePagination,
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
  if (error instanceof ValidationError && error.violations.length === 0)
    throw new MockApiError("INVALID_INPUT", error.message);
  if (error instanceof MockError) {
    const code =
      error.code === "MOCK_INVALID_INPUT" && PAGING_MESSAGE.test(error.message)
        ? "INVALID_PAGINATION"
        : (CODES[error.code] ?? "INVALID_INPUT");
    const translated = new MockApiError(
      code,
      error.message.replace(/^resources\.(.+)\.mock:/, 'Mock resource "$1":'),
    );
    (translated as { cause?: unknown }).cause = error;
    throw translated;
  }
  throw error;
}

/** `operations` is the already-resolved set (Core's `expandOperations`): enabled names only. */
export type ResourceOptions = {
  slice?: MockSlice;
  seed?: MockSource["seed"];
  pagination?: ResourcePagination;
  operations: Record<string, unknown>;
  storage?: import("@apixa/core").MockStorageOptions;
  fixtures?: import("@apixa/core").MockFileFixtures;
  fileFields?: import("@apixa/core").FileFieldsConfig;
  fileLimits?: import("@apixa/core").FileLimits;
};

/** Paging keys are config of the call, not filters; everything else in the query filters rows. */
const PAGING_MESSAGE = /: (page|pageSize|cursor) must be/;

/** Adapt calling conventions to Core's existing mocked-client engine. */
export function createResource(name: string, type: DatasetId, options: ResourceOptions) {
  const entry = catalog[type];
  const resolvedPagination = resolvePagination(name, options.pagination);
  const operations: Record<string, unknown> = {};
  const names = new Map<string, string>();
  for (const [op, choice] of Object.entries(options.operations)) {
    if (typeof choice !== "function") {
      operations[op] = true;
      names.set(op, op);
      continue;
    }
    const internal = `adapter_${op}`;
    names.set(op, internal);
    operations[internal] = {
      kind: "write",
      method: "POST",
      path: `/__adapter/${op}`,
      mock: async ({
        store,
        files,
        body,
      }: import("@apixa/core").OperationMockContext<
        Record<string, unknown>,
        unknown,
        unknown,
        unknown
      >) => {
        type Row = Record<string, unknown>;
        let rows: Row[] | undefined;
        const flush = () => {
          if (!rows) return;
          for (const row of store.list()) store.delete(row[entry.idKey] as Id);
          for (const row of rows) store.create(row);
        };
        const invoke = async <T>(fn: () => T): Promise<T> => {
          try {
            flush();
            const result = fn();
            if (rows) rows.splice(0, rows.length, ...store.list());
            return result;
          } catch (error) {
            return translate(error);
          }
        };
        const ctx: MockOperationContext<Row> = {
          idKey: entry.idKey,
          files,
          rows: async () => (rows ??= store.list()),
          fail: (code, message) => new MockApiError(code, `Mock resource "${name}": ${message}`),
          defaults: {
            getAll: () => invoke(() => store.list()),
            getById: (id) => invoke(() => store.get(id)),
            create: (input) => invoke(() => store.create(input as Row)),
            update: (id, input) => invoke(() => store.update(id, input as Row)),
            patch: (id, input) => invoke(() => store.patch(id, input as Row)),
            delete: (id) => invoke(() => store.delete(id)),
          },
        };
        const args = (body as { args: unknown[] }).args;
        const result = await (choice as MockOperationFn<Row>)(ctx, ...args);
        flush();
        return result;
      },
    };
  }
  return {
    definition: {
      path: `/${encodeURIComponent(name)}`,
      mock: {
        data: async () => (await entry.load()).default,
        idKey: entry.idKey,
        seed: options.seed,
        storage: options.storage,
        fixtures: options.fixtures,
      },
      fileFields: options.fileFields,
      fileLimits: options.fileLimits,
      pagination: options.pagination,
      slice: options.slice,
      operations: { preset: [], ...operations },
    },
    wrap(core: Record<string, (...args: unknown[]) => Promise<unknown>>) {
      const resource: Record<string | symbol, unknown> = {};
      Object.defineProperty(resource, Symbol.for("@apixa/mock-target"), { value: core });
      for (const [op, internal] of names)
        resource[op] = async (...args: unknown[]) => {
          try {
            if (
              internal === op &&
              ["getById", "delete", "update", "patch", "exists"].includes(op)
            ) {
              const id = args[0];
              if ((typeof id !== "string" && typeof id !== "number") || id === "")
                throw new MockApiError(
                  "INVALID_INPUT",
                  `Mock resource "${name}": invalid ${entry.idKey} ${JSON.stringify(id) ?? String(id)} (expected a non-empty string or number)`,
                );
            }
            if (
              internal === op &&
              op === "getAll" &&
              resolvedPagination &&
              args[0] !== null &&
              typeof args[0] === "object" &&
              !Array.isArray(args[0])
            ) {
              const q = args[0] as Record<string, unknown>;
              const checkPaging = (key: string, min: number) => {
                const raw = q[key];
                if (raw === undefined || raw === null || raw === "") return;
                const n = typeof raw === "number" ? raw : Number(raw);
                if (!Number.isInteger(n) || n < min) {
                  throw new MockApiError(
                    "INVALID_PAGINATION",
                    `Mock resource "${name}": ${key} must be an integer >= ${min} (got ${String(raw)})`,
                  );
                }
              };
              checkPaging("pageSize", 1);
              if (resolvedPagination.mode === "cursor") checkPaging("cursor", 0);
              else checkPaging("page", 1);
            }
            const forwarded =
              internal !== op
                ? [{ args }]
                : ["getAll", "count"].includes(op)
                  ? [{ query: args[0] }]
                  : args;
            const result = await core[internal]!(...forwarded);
            return (op === "delete" || op === "deleteMany") && internal === op ? undefined : result;
          } catch (error) {
            return translate(error);
          }
        };
      return resource;
    },
  };
}
