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
  type OffsetPage,
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
const PAGING_MESSAGE = /(: (page|pageSize|cursor|offset) must be|pagination `\w+` must be)/;

const REQUEST_OPTION_KEYS = new Set([
  "transfer",
  "presigned",
  "params",
  "query",
  "pagination",
  "headers",
  "signal",
  "timeout",
  "retry",
  "maxResponseSize",
  "onTransfer",
  "meta",
  "full",
  "idempotencyKey",
]);

function normalizeListOrCountArg(arg: unknown): Record<string, unknown> | undefined {
  if (arg === undefined) return undefined;
  if (arg === null || typeof arg !== "object" || Array.isArray(arg)) {
    return { query: arg };
  }
  const obj = arg as Record<string, unknown>;
  const hasOptionKey = Object.keys(obj).some((k) => REQUEST_OPTION_KEYS.has(k));
  if (!hasOptionKey) {
    return { query: obj };
  }
  const callOptions: Record<string, unknown> = {};
  const extraQuery: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REQUEST_OPTION_KEYS.has(key)) {
      callOptions[key] = value;
    } else {
      extraQuery[key] = value;
    }
  }
  if (Object.keys(extraQuery).length > 0) {
    const existingQuery = callOptions.query;
    if (
      existingQuery !== undefined &&
      existingQuery !== null &&
      typeof existingQuery === "object" &&
      !Array.isArray(existingQuery)
    ) {
      callOptions.query = { ...extraQuery, ...(existingQuery as Record<string, unknown>) };
    } else if (existingQuery === undefined) {
      callOptions.query = extraQuery;
    }
  }
  return callOptions;
}

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
      paginationConfig: options.pagination,
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
            const normalizedCall =
              internal === op && ["getAll", "count"].includes(op)
                ? normalizeListOrCountArg(args[0])
                : undefined;
            if (internal === op && op === "getAll" && resolvedPagination && normalizedCall) {
              const q =
                normalizedCall.query !== null &&
                typeof normalizedCall.query === "object" &&
                !Array.isArray(normalizedCall.query)
                  ? (normalizedCall.query as Record<string, unknown>)
                  : {};
              const pag =
                normalizedCall.pagination !== null &&
                typeof normalizedCall.pagination === "object" &&
                !Array.isArray(normalizedCall.pagination)
                  ? (normalizedCall.pagination as Record<string, unknown>)
                  : {};
              const checkPaging = (source: Record<string, unknown>, key: string, min: number) => {
                const raw = source[key];
                if (raw === undefined || raw === null || raw === "") return;
                const n = typeof raw === "number" ? raw : Number(raw);
                if (!Number.isInteger(n) || n < min) {
                  throw new MockApiError(
                    "INVALID_PAGINATION",
                    `Mock resource "${name}": ${key} must be an integer >= ${min} (got ${String(raw)})`,
                  );
                }
              };
              for (const source of [q, pag]) {
                checkPaging(source, "pageSize", 1);
                if (resolvedPagination.mode === "cursor") checkPaging(source, "cursor", 0);
                else if (resolvedPagination.mode === "offset") checkPaging(source, "offset", 0);
                else checkPaging(source, "page", 1);
              }
            }
            const forwarded =
              internal !== op
                ? [{ args }]
                : ["getAll", "count"].includes(op)
                  ? normalizedCall
                    ? [normalizedCall]
                    : []
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
