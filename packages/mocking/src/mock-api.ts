import {
  defineApi,
  BUILTIN_CONVENTIONS,
  expandOperations,
  validatePagination,
} from "@apixa/core";
import { isDatasetId, listDatasetIds, type DatasetId } from "./catalog.js";
import { MockApiError } from "./errors.js";
import { createResource } from "./resource.js";
import { assertSliceConfig } from "./slice.js";
import type {
  MockApi,
  MockApiConfigInput,
  MockResourceConfig,
  MockRootConfig,
  TypedResources,
  ValidateMockRoot,
} from "./mock-types.js";

export type {
  MockApi,
  MockApiConfig,
  MockApiConfigInput,
  MockApiResourceInput,
  MockResourceConfig,
  MockRootConfig,
  MockOperationSelection,
  MockOperations,
  TypedOperations,
} from "./mock-types.js";

const ROOT_OPTIONS = ["resources", "operations"];
const RESOURCE_OPTIONS = [
  "type",
  "slice",
  "seed",
  "pagination",
  "operations",
  "storage",
  "fixtures",
  "fileFields",
  "fileLimits",
];
const EXPECTED_SHAPE =
  'defineMockApi() expects { resources: { users: { type: "users-mock" } } } (or the shorthand { users: "users-mock" }).';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `{ resources: {…} }` is the main form; a top-level `resources` that is itself a resource is flat. */
function isRootForm(config: Record<string, unknown>): boolean {
  const { resources } = config;
  if (!isPlainObject(resources)) return false;
  return typeof resources.type !== "string";
}

function assertOperations(operations: unknown, label: string): void {
  if (operations === undefined) return;
  if (typeof operations === "string" || Array.isArray(operations)) {
    if (
      (typeof operations === "string" && ["crud", "read", "all"].includes(operations)) ||
      (Array.isArray(operations) && operations.every((name) => typeof name === "string" && Object.hasOwn(BUILTIN_CONVENTIONS, name)))
    ) return;
    throw new MockApiError("INVALID_CONFIG", `${label}: operations must be a preset or list of builtin names.`);
  }
  if (!isPlainObject(operations)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label}: operations must be an object of { name: true | false | function }.`,
    );
  }
  for (const [name, value] of Object.entries(operations)) {
    if (name === "preset") {
      if (typeof value !== "string" && !Array.isArray(value))
        throw new MockApiError("INVALID_CONFIG", `${label}: preset must be a preset or list of builtin names.`);
      assertOperations(value, label);
      continue;
    }
    if (value === undefined || value === false || typeof value === "function") continue;
    if (value === true) {
      if (Object.hasOwn(BUILTIN_CONVENTIONS, name)) continue;
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: unknown builtin operation "${name}". \`true\` only enables a builtin; give a custom operation a function.`,
      );
    }
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label}: operation "${name}" must be true, false, or a function. HTTP forms ({ method, path, … }) are not supported by a standalone mock.`,
    );
  }
}

function assertSeed(seed: unknown, label: string): void {
  if (!isPlainObject(seed)) {
    throw new MockApiError("INVALID_CONFIG", `${label}: seed must be { limit?, offset? }.`);
  }
  for (const [key, value] of Object.entries(seed)) {
    if (key !== "limit" && key !== "offset") {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: seed has unknown option "${key}". Supported: limit, offset.`,
      );
    }
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    ) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: seed.${key} must be a non-negative integer (got ${String(value)}).`,
      );
    }
  }
}

function assertResource(name: string, resource: unknown): asserts resource is MockResourceConfig {
  const label = `Mock resource "${name}"`;
  if (!isPlainObject(resource)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label} must be a dataset id string or an object like { type: "users-mock" }.`,
    );
  }
  for (const key of Object.keys(resource)) {
    if (!RESOURCE_OPTIONS.includes(key)) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label} has unsupported option "${key}". Supported options: ${RESOURCE_OPTIONS.join(", ")}.`,
      );
    }
  }

  const { type, slice, seed, pagination, operations } = resource;
  if (!isDatasetId(type)) {
    throw new MockApiError(
      "UNKNOWN_DATASET",
      `${label}: ${type === undefined ? 'missing "type"' : `unknown dataset ${JSON.stringify(type)}`}. ` +
        `Available: ${listDatasetIds().join(", ")}.`,
    );
  }
  if (slice !== undefined) assertSliceConfig(slice, label);
  if (seed !== undefined) assertSeed(seed, label);
  if (pagination !== undefined) {
    try {
      validatePagination(label, pagination);
    } catch (error) {
      const translated = new MockApiError("INVALID_CONFIG", (error as Error).message);
      (translated as { cause?: unknown }).cause = error;
      throw translated;
    }
  }
  if (slice !== undefined && pagination !== undefined && pagination !== false) {
    throw new MockApiError("INVALID_CONFIG", `${label}: slice cannot be combined with pagination.`);
  }
  assertOperations(operations, label);
}

/**
 * Standalone, local mock API: each resource is seeded from a catalog dataset and keeps its
 * changes in memory. Performs no network requests and needs no `defineApi()`. Every call gets
 * its own isolated state; the source datasets are never mutated.
 *
 * `operations` selects a preset or list at the root, and a resource can replace the selection
 * or add named overrides. The same selector is used by Core.
 *
 * @example
 * const api = defineMockApi({
 *   operations: "read",
 *   resources: {
 *     users: { type: "users-mock", operations: { count: false } },
 *     products: { type: "products-mock", pagination: true, operations: "crud" },
 *   },
 * });
 * const { data, total } = await api.products.getAll({ page: 1, pageSize: 10 });
 */
export function defineMockApi<
  const C extends MockRootConfig | MockApiConfigInput,
  const T extends Record<string, DatasetId>,
>(
  config: C & Partial<MockRootConfig> & ValidateMockRoot<NoInfer<C>> & TypedResources<T>,
): MockApi<C>;
export function defineMockApi(config: unknown): unknown {
  if (!isPlainObject(config)) throw new MockApiError("INVALID_CONFIG", EXPECTED_SHAPE);

  let rootOperations: unknown;
  let resources: Record<string, unknown>;
  if (isRootForm(config)) {
    for (const key of Object.keys(config)) {
      if (!ROOT_OPTIONS.includes(key)) {
        throw new MockApiError(
          "INVALID_CONFIG",
          `defineMockApi() has unsupported option "${key}". Supported options: ${ROOT_OPTIONS.join(", ")}.`,
        );
      }
    }
    rootOperations = config.operations;
    if (rootOperations !== undefined && typeof rootOperations !== "string" && !Array.isArray(rootOperations))
      throw new MockApiError("INVALID_CONFIG", "defineMockApi().operations must be a preset or list of builtin names.");
    assertOperations(rootOperations, "defineMockApi()");
    resources = config.resources as Record<string, unknown>;
  } else {
    resources = config;
  }

  const entries = Object.entries(resources);
  if (entries.length === 0) {
    throw new MockApiError("INVALID_CONFIG", "defineMockApi() needs at least one resource.");
  }

  const adapters: Record<string, ReturnType<typeof createResource>> = {};
  for (const [name, input] of entries) {
    const resource = typeof input === "string" ? { type: input } : input;
    assertResource(name, resource);
    const selected = resource.operations === undefined
      ? rootOperations
      : isPlainObject(resource.operations) && !Object.hasOwn(resource.operations, "preset") && rootOperations !== undefined
        ? { preset: rootOperations, ...resource.operations }
        : resource.operations;
    adapters[name] = createResource(name, resource.type as DatasetId, {
      slice: resource.slice,
      storage: resource.storage,
      fixtures: resource.fixtures,
      fileFields: resource.fileFields,
      fileLimits: resource.fileLimits,
      seed: resource.seed,
      pagination: resource.pagination,
      operations: expandOperations(selected as Parameters<typeof expandOperations>[0]),
    });
  }
  const definitions = Object.fromEntries(
    Object.entries(adapters).map(([key, adapter]) => [key, adapter.definition]),
  );
  const core = defineApi({
    baseURL: "https://mock.apixa.invalid",
    resources: definitions,
  } as never) as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => Promise<unknown>>
  >;
  const api = Object.fromEntries(
    Object.entries(adapters).map(([key, adapter]) => [key, adapter.wrap(core[key]!)]),
  );
  Object.defineProperty(api, Symbol.for("@apixa/mock-target"), { value: core });
  return api;
}
