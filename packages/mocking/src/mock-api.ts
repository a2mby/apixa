import { BUILTIN_CONVENTIONS, expandOperations, type OperationGroupName } from "@apixa/core";
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

const SELECTION_KEYS = ["defaultOperations", "readOnly", "writeOnly", "operationGroups"] as const;
const ROOT_OPTIONS = ["resources", ...SELECTION_KEYS];
const RESOURCE_OPTIONS = ["type", "slice", "pagination", "operations", ...SELECTION_KEYS];
const GROUPS: readonly OperationGroupName[] = ["read", "write", "many", "extended"];
const EXPECTED_SHAPE =
  'defineMockApi() expects { resources: { users: { type: "users-mock" } } } (or the shorthand { users: "users-mock" }).';

type Settings = {
  defaultOperations?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  operationGroups?: Partial<Record<OperationGroupName, boolean>>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `{ resources: {…} }` is the main form; a top-level `resources` that is itself a resource is flat. */
function isRootForm(config: Record<string, unknown>): boolean {
  const { resources } = config;
  if (!isPlainObject(resources)) return false;
  return typeof resources.type !== "string";
}

function assertSettings(settings: Record<string, unknown>, label: string): void {
  for (const key of ["defaultOperations", "readOnly", "writeOnly"] as const) {
    const value = settings[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: ${key} must be a boolean (got ${String(value)}).`,
      );
    }
  }
  if (settings.readOnly === true && settings.writeOnly === true) {
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label}: readOnly and writeOnly cannot both be true.`,
    );
  }
  const groups = settings.operationGroups;
  if (groups === undefined) return;
  if (!isPlainObject(groups)) {
    throw new MockApiError("INVALID_CONFIG", `${label}: operationGroups must be an object.`);
  }
  for (const [group, choice] of Object.entries(groups)) {
    if (!GROUPS.includes(group as OperationGroupName)) {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: unknown operation group "${group}". Supported groups: ${GROUPS.join(", ")}.`,
      );
    }
    if (choice !== undefined && typeof choice !== "boolean") {
      throw new MockApiError(
        "INVALID_CONFIG",
        `${label}: operationGroups.${group} must be a boolean (got ${String(choice)}).`,
      );
    }
  }
}

function assertOperations(operations: unknown, label: string): void {
  if (operations === undefined) return;
  if (!isPlainObject(operations)) {
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label}: operations must be an object of { name: true | false | function }.`,
    );
  }
  for (const [name, value] of Object.entries(operations)) {
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

  const { type, slice, pagination, operations } = resource;
  if (!isDatasetId(type)) {
    throw new MockApiError(
      "UNKNOWN_DATASET",
      `${label}: ${type === undefined ? 'missing "type"' : `unknown dataset ${JSON.stringify(type)}`}. ` +
        `Available: ${listDatasetIds().join(", ")}.`,
    );
  }
  if (slice !== undefined) assertSliceConfig(slice, label);
  if (pagination !== undefined && typeof pagination !== "boolean") {
    throw new MockApiError(
      "INVALID_CONFIG",
      `${label}: pagination must be a boolean (got ${String(pagination)}).`,
    );
  }
  assertSettings(resource as Record<string, unknown>, label);
  assertOperations(operations, label);
}

function pickSettings(source: Record<string, unknown>): Settings {
  const out: Settings = {};
  for (const key of SELECTION_KEYS) {
    if (source[key] !== undefined) (out as Record<string, unknown>)[key] = source[key];
  }
  return out;
}

/** Resource settings win over root settings; operation groups merge group by group. */
function mergeSettings(root: Settings, resource: Settings): Settings {
  const merged: Settings = { ...root, ...resource };
  if (root.operationGroups || resource.operationGroups) {
    merged.operationGroups = { ...root.operationGroups, ...resource.operationGroups };
  }
  return merged;
}

/**
 * Standalone, local mock API: each resource is seeded from a catalog dataset and keeps its
 * changes in memory. Performs no network requests and needs no `defineApi()`. Every call gets
 * its own isolated state; the source datasets are never mutated.
 *
 * The config mirrors `defineApi`: `resources` holds one entry per client property, and the
 * operation settings (`defaultOperations`, `readOnly`, `writeOnly`, `operationGroups`) may be set
 * on the root (shared by every resource) or on a resource (wins over the root). Resolution is
 * Core's own `expandOperations`: defaults → `defaultOperations` → `readOnly`/`writeOnly` →
 * `extended` → `read`/`write` → `many` → individual `operations` entries.
 *
 * @example
 * const api = defineMockApi({
 *   readOnly: true,
 *   resources: {
 *     users: { type: "users-mock", operations: { getBySlug: false } },
 *     products: { type: "products-mock", pagination: true, readOnly: false },
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

  let root: Settings = {};
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
    assertSettings(config, "defineMockApi()");
    root = pickSettings(config);
    resources = config.resources as Record<string, unknown>;
  } else {
    resources = config;
  }

  const entries = Object.entries(resources);
  if (entries.length === 0) {
    throw new MockApiError("INVALID_CONFIG", "defineMockApi() needs at least one resource.");
  }

  const api: Record<string, unknown> = {};
  for (const [name, input] of entries) {
    const resource = typeof input === "string" ? { type: input } : input;
    assertResource(name, resource);
    const raw = resource as unknown as Record<string, unknown>;
    const settings = mergeSettings(root, pickSettings(raw));
    api[name] = createResource(name, resource.type as DatasetId, {
      slice: resource.slice,
      pagination: resource.pagination,
      operations: expandOperations(
        resource.operations as unknown as Parameters<typeof expandOperations>[0],
        settings,
      ),
    });
  }
  return api;
}
