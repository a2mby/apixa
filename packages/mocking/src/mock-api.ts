import {
  isDatasetId,
  listDatasetIds,
  type DatasetId,
  type EntityOf,
  type IdKeyOf,
} from "./catalog.js";
import { MockApiError } from "./errors.js";
import { createResource, type MockOperationValue, type MockResource } from "./resource.js";
import { assertSliceConfig, type MockSlice } from "./slice.js";

export type MockResourceConfig = {
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
   * Add, remove, or override operations (v0.10.0): `true` enables an opt-in builtin with its
   * default implementation, `false` removes a builtin, a function fully replaces it.
   */
  operations?: Record<string, MockOperationValue>;
};

/** Per-resource input: dataset id string, or full config object. */
export type MockApiResourceInput = DatasetId | MockResourceConfig;

export type MockApiConfigInput = Record<string, MockApiResourceInput>;

export type MockApiConfig = Record<string, MockResourceConfig>;

type ResolvedConfig<R> = R extends DatasetId
  ? { readonly type: R }
  : R extends MockResourceConfig
    ? R
    : never;

/** Only the literal `true` enables the page envelope; `false` / absent → plain list. */
type PaginationOf<R> = R extends { readonly pagination: true }
  ? true
  : R extends { readonly pagination: false }
    ? false
    : undefined;

export type MockApi<C extends MockApiConfigInput> = {
  [R in keyof C]: MockResource<
    EntityOf<ResolvedConfig<C[R]>["type"]>,
    IdKeyOf<ResolvedConfig<C[R]>["type"]>,
    PaginationOf<ResolvedConfig<C[R]>>
  >;
};

/** Extra keys on object resources are a type error; strings pass through. */
type ExactInput<C extends MockApiConfigInput> = {
  [R in keyof C]: C[R] extends string
    ? C[R]
    : C[R] extends MockResourceConfig
      ? C[R] & { [K in Exclude<keyof C[R], keyof MockResourceConfig>]: never }
      : never;
};

const OPTIONS = ["type", "slice", "pagination", "operations"];

function normalizeConfig(config: Record<string, unknown>): MockApiConfig {
  const out: MockApiConfig = {};
  for (const [name, resource] of Object.entries(config)) {
    if (typeof resource === "string") {
      out[name] = { type: resource as DatasetId };
    } else {
      out[name] = resource as MockResourceConfig;
    }
  }
  return out;
}

function assertConfig(config: unknown): asserts config is MockApiConfig {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      'defineMockApi() expects an object of resources, e.g. { users: "users-mock" } or { users: { type: "users-mock" } }.',
    );
  }
  const entries = Object.entries(config);
  if (entries.length === 0) {
    throw new MockApiError("INVALID_CONFIG", "defineMockApi() needs at least one resource.");
  }

  for (const [name, resource] of entries) {
    const label = `Mock resource "${name}"`;
    if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label} must be a dataset id string or an object like { type: "users-mock" }.`,
      );
    }
    for (const key of Object.keys(resource)) {
      if (!OPTIONS.includes(key)) {
        throw new MockApiError(
          "INVALID_CONFIG",
          `${label} has unsupported option "${key}". Supported options: ${OPTIONS.join(", ")}.`,
        );
      }
    }

    const { type, slice, pagination, operations } = resource as Record<string, unknown>;
    if (!isDatasetId(type)) {
      throw new MockApiError(
        "UNKNOWN_DATASET",
        `${label}: ${type === undefined ? 'missing "type"' : `unknown dataset ${JSON.stringify(type)}`}. ` +
          `Available: ${listDatasetIds().join(", ")}.`,
      );
    }
    if (slice !== undefined) {
      assertSliceConfig(slice, label);
    }
    if (pagination !== undefined && typeof pagination !== "boolean") {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: pagination must be a boolean (got ${String(pagination)}).`,
      );
    }
    if (
      operations !== undefined &&
      (operations === null || typeof operations !== "object" || Array.isArray(operations))
    ) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: operations must be an object of { name: true | false | function }.`,
      );
    }
  }
}

/**
 * Standalone, local mock API: each resource is seeded from a catalog dataset and keeps its
 * CRUD changes in memory. Performs no network requests and needs no `defineApi()`.
 * Every call gets its own isolated state; the source datasets are never mutated.
 *
 * @example
 * const mockApi = defineMockApi({
 *   users: "users-mock",
 *   products: { type: "products-mock", slice: 50, pagination: true },
 * });
 * const { data, total } = await mockApi.products.getAll({ page: 1, pageSize: 10 });
 */
export function defineMockApi<const C extends MockApiConfigInput>(
  config: C & ExactInput<C>,
): MockApi<C> {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      'defineMockApi() expects an object of resources, e.g. { users: "users-mock" } or { users: { type: "users-mock" } }.',
    );
  }
  const normalized = normalizeConfig(config as Record<string, unknown>);
  assertConfig(normalized);
  const api: Record<string, unknown> = {};
  for (const [name, resource] of Object.entries(normalized)) {
    api[name] = createResource(name, resource.type, resource);
  }
  return api as MockApi<C>;
}
