import { ConfigError } from "../errors/config-error.js";
import { ParseError } from "../errors/parse-error.js";
import type {
  PaginatedResult,
  PaginationFields,
  PaginationParams,
  PaginationResponseContext,
  PaginationStrategy,
  PaginationRequestParts,
  LogicalPaginationInput,
  ResourcePagination,
} from "../types/definition.js";

type Mode = PaginationStrategy;
type Row = Record<string, unknown>;

/** Resolved, ready-to-run pagination for one operation. */
export interface ResolvedPagination {
  mode: Mode;
  /**
   * Fields beyond the strategy's base set that the contract requires: all of them for Apixa's
   * standard envelope and presets (`total`, offset `pageSize`); only the declared ones for a custom
   * `fields` object; none for `parseList`.
   */
  required: readonly string[];
  /** Logical → backend query names (live requests only). */
  params?: PaginationParams;
  /** Backend page numbering (0 or 1). Logical pages are always one-based. */
  pageBase: 0 | 1;
  defaultPageSize?: number;
  maxPageSize?: number;
  /** Request adapter (live only). Replaces `params`. */
  buildRequest?: (
    input: LogicalPaginationInput,
    ctx: { method: string; query: Record<string, unknown>; body: unknown },
  ) => PaginationRequestParts;
  /** Decode a live response body into the normalized contract (throws `ParseError`). */
  parse: (body: unknown, ctx: PaginationResponseContext) => PaginatedResult;
  /** Validate the final contract (after parse/validate hooks; throws `ParseError`). */
  validate: (data: unknown) => PaginatedResult;
}

type PresetEntry = { fields: PaginationFields; params: PaginationParams };

/**
 * Backend presets are data only: field paths and query names, never code. A preset ships only for
 * a shape that is a pure field mapping. Each names one concrete package / envelope (not a whole
 * framework) and was checked against what that backend documents; the Laravel ones also against real
 * output of the local Laravel playground (`manual-testing/backends/laravel-backend`).
 */
const PRESETS = {
  /** Laravel API resource collection (`ProductResource::collection($paginator)`). */
  laravel: {
    page: {
      fields: {
        data: "data",
        total: "meta.total",
        page: "meta.current_page",
        pageSize: "meta.per_page",
      },
      params: { pageSize: "per_page" },
    },
  },
  /** Laravel paginator returned directly: `paginate()` / `cursorPaginate()` JSON. */
  "laravel-paginator": {
    page: {
      fields: { data: "data", total: "total", page: "current_page", pageSize: "per_page" },
      params: { pageSize: "per_page" },
    },
    cursor: {
      fields: { data: "data", nextCursor: "next_cursor", previousCursor: "prev_cursor" },
      params: { pageSize: "per_page" },
    },
  },
  /** Strapi REST: `{ data, meta: { pagination } }`, queried as `pagination[page]`. */
  strapi: {
    page: {
      fields: {
        data: "data",
        total: "meta.pagination.total",
        page: "meta.pagination.page",
        pageSize: "meta.pagination.pageSize",
      },
      params: { page: "pagination[page]", pageSize: "pagination[pageSize]" },
    },
  },
  /** Payload CMS REST: `{ docs, totalDocs, page, limit }`. */
  payload: {
    page: {
      fields: { data: "docs", total: "totalDocs", page: "page", pageSize: "limit" },
      params: { pageSize: "limit" },
    },
  },
  /** nestjs-typeorm-paginate (`Pagination<T>`): `{ items, meta }`, queried with `page` / `limit`. */
  nestjs: {
    page: {
      fields: {
        data: "items",
        total: "meta.totalItems",
        page: "meta.currentPage",
        pageSize: "meta.itemsPerPage",
      },
      params: { pageSize: "limit" },
    },
  },
} satisfies Record<string, Partial<Record<Mode, PresetEntry>>>;

/** Names accepted by `pagination.preset`. */
export const PAGINATION_PRESET_NAMES = Object.keys(PRESETS) as (keyof typeof PRESETS)[];

type PresetTable = Record<string, Partial<Record<Mode, PresetEntry>>>;

const MODES: readonly Mode[] = ["page", "cursor", "offset"];
const SHORTHANDS = new Set<string>(["page", "cursor", "offset"]);

/** Fields each strategy can carry, in output order. */
const ALL_KEYS: Record<Mode, readonly (keyof PaginationFields)[]> = {
  page: ["data", "total", "page", "pageSize", "pageCount", "hasMore"],
  offset: ["data", "total", "offset", "pageSize", "nextOffset", "previousOffset", "hasMore"],
  cursor: ["data", "nextCursor", "previousCursor", "hasMore"],
};
/** Required for every configuration (`nextCursor` may be `null`: that is how an end is reported). */
const REQUIRED: Record<Mode, readonly string[]> = {
  page: ["data", "page", "pageSize"],
  offset: ["data", "offset"],
  cursor: ["data", "nextCursor"],
};
/** Additionally required by the standard envelope and presets; custom mappings opt in by declaring them. */
const STRICT_REQUIRED: Record<Mode, readonly string[]> = {
  page: ["total"],
  offset: ["total", "pageSize"],
  cursor: [],
};

const FIELD_KEYS = new Set<string>([
  "data",
  "total",
  "page",
  "pageSize",
  "pageCount",
  "hasMore",
  "offset",
  "nextOffset",
  "previousOffset",
  "nextCursor",
  "previousCursor",
]);
const PARAM_KEYS = new Set<string>(["page", "pageSize", "cursor", "before", "offset"]);
/** Logical request keys each strategy owns. `before` only counts once it is mapped. */
const LOGICAL_KEYS: Record<Mode, readonly string[]> = {
  page: ["page", "pageSize"],
  offset: ["offset", "pageSize"],
  cursor: ["cursor", "before", "pageSize"],
};
const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Own-property path read (dot notation). Never walks the prototype chain. */
export function readPath(body: unknown, path: string): { found: boolean; value: unknown } {
  let current: unknown = body;
  for (const key of path.split(".")) {
    if (
      UNSAFE_SEGMENTS.has(key) ||
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return { found: false, value: undefined };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

/** A configured name must not be able to write through the prototype chain. */
function assertSafeName(where: string, label: string, name: string, dotted: boolean): void {
  const segments = dotted ? name.split(".") : [name];
  for (const segment of segments) {
    if (segment === "" && dotted) {
      throw new ConfigError(`${where}.${label} must not contain empty path segments.`);
    }
    if (UNSAFE_SEGMENTS.has(segment)) {
      throw new ConfigError(`${where}.${label} must not use "${segment}".`);
    }
  }
}

function checkKeys(
  where: string,
  label: string,
  value: unknown,
  allowed: Set<string>,
  dotted: boolean,
): Row {
  if (!isRecord(value)) throw new ConfigError(`${where}.${label} must be an object.`);
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `${where}.${label}: unknown key "${key}" (expected ${[...allowed].join(", ")}).`,
      );
    }
    if (typeof entry !== "string" || entry === "") {
      throw new ConfigError(`${where}.${label}.${key} must be a non-empty string.`);
    }
    assertSafeName(where, `${label}.${key}`, entry, dotted);
  }
  return value;
}

function positiveIntConfig(where: string, key: string, label: string, value: unknown): void {
  if (value !== undefined && (!Number.isInteger(value) || (value as number) < 1)) {
    throw new ConfigError(`${where}.${key}.${label} must be a positive integer.`);
  }
}

const SHAPE_MESSAGE = (where: string, got: unknown, key: string) =>
  `${where}.${key} must be true, false, "page", "cursor" or "offset", a preset (${PAGINATION_PRESET_NAMES.join(", ")}), or an object (got ${JSON.stringify(got)}).`;

/** Validate a resource or operation pagination value; throws `ConfigError` naming the offending key. */
export function validatePagination(
  where: string,
  value: unknown,
  key: "pagination" | "paginationConfig" = "pagination",
): void {
  if (value === undefined || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (SHORTHANDS.has(value) || Object.hasOwn(PRESETS, value)) return;
    throw new ConfigError(SHAPE_MESSAGE(where, value, key));
  }
  if (!isRecord(value)) throw new ConfigError(SHAPE_MESSAGE(where, value, key));
  const allowed = new Set([
    "strategy",
    "preset",
    "fields",
    "params",
    "pageBase",
    "defaultPageSize",
    "maxPageSize",
    "parseList",
    "buildRequest",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `${where}.${key}: unknown key "${key}" (expected ${[...allowed].join(", ")}).`,
      );
    }
  }
  if (value.preset !== undefined) {
    if (typeof value.preset !== "string" || !Object.hasOwn(PRESETS, value.preset)) {
      throw new ConfigError(
        `${where}.${key}.preset must be one of ${PAGINATION_PRESET_NAMES.join(", ")} (got ${JSON.stringify(value.preset)}).`,
      );
    }
    if (value.fields !== undefined) {
      throw new ConfigError(`${where}.${key}: use either \`preset\` or \`fields\`, not both.`);
    }
  }
  const effectiveType = value.strategy ?? (value.preset !== undefined ? "page" : undefined);
  if (typeof effectiveType !== "string" || !MODES.includes(effectiveType as Mode)) {
    throw new ConfigError(
      `${where}.${key}.strategy must be "page", "cursor" or "offset" (got ${JSON.stringify(value.strategy)}).`,
    );
  }
  if (
    value.preset !== undefined &&
    !(PRESETS as PresetTable)[value.preset as string]![effectiveType as Mode]
  ) {
    throw new ConfigError(
      `${where}.${key}.preset "${value.preset}" has no "${effectiveType}" mapping; declare \`fields\` or \`parseList\`.`,
    );
  }
  if (value.fields !== undefined) {
    checkKeys(where, `${key}.fields`, value.fields, FIELD_KEYS, true);
  }
  if (value.params !== undefined) {
    checkKeys(where, `${key}.params`, value.params, PARAM_KEYS, false);
  }
  if (value.pageBase !== undefined) {
    if (value.pageBase !== 0 && value.pageBase !== 1) {
      throw new ConfigError(`${where}.${key}.pageBase must be 0 or 1.`);
    }
    if (effectiveType !== "page") {
      throw new ConfigError(`${where}.${key}.pageBase only applies to the "page" strategy.`);
    }
  }
  positiveIntConfig(where, key, "defaultPageSize", value.defaultPageSize);
  positiveIntConfig(where, key, "maxPageSize", value.maxPageSize);
  if (
    typeof value.defaultPageSize === "number" &&
    typeof value.maxPageSize === "number" &&
    value.defaultPageSize > value.maxPageSize
  ) {
    throw new ConfigError(`${where}.${key}.defaultPageSize must not exceed maxPageSize.`);
  }
  if (value.parseList !== undefined && typeof value.parseList !== "function") {
    throw new ConfigError(`${where}.${key}.parseList must be a function.`);
  }
  if (value.buildRequest !== undefined) {
    if (typeof value.buildRequest !== "function") {
      throw new ConfigError(`${where}.${key}.buildRequest must be a function.`);
    }
    if (value.params !== undefined || value.preset !== undefined) {
      throw new ConfigError(
        `${where}.${key}: \`buildRequest\` decides request placement; do not combine it with \`params\` or \`preset\`.`,
      );
    }
  }
}

function fail(resource: string, opName: string, path: string, detail: string): never {
  throw new ParseError(`${resource}.${opName}: pagination field "${path}" ${detail}.`);
}

function isInt(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}

/**
 * Check the public envelope without dropping backend extension metadata. Metadata that is present
 * is validated; metadata that is absent stays absent (nothing is fabricated). Contradictory
 * metadata is rejected rather than resolved silently.
 */
export function validatePaginatedResult(
  body: unknown,
  mode: Mode,
  extra: readonly string[],
  resource: string,
  opName: string,
): PaginatedResult {
  if (!isRecord(body)) fail(resource, opName, "data", "is missing from the response");
  const get = (key: string): unknown => (Object.hasOwn(body, key) ? body[key] : undefined);
  if (!Array.isArray(get("data"))) fail(resource, opName, "data", "must be an array");
  const required = new Set([...REQUIRED[mode], ...extra]);
  const check = (key: string, ok: (value: unknown) => boolean, expected: string): void => {
    const value = get(key);
    if (value === undefined) {
      if (required.has(key)) fail(resource, opName, key, "is missing from the response");
      return;
    }
    if (!ok(value)) fail(resource, opName, key, `must be ${expected}`);
  };
  const nonNegative = (v: unknown) => isInt(v, 0);
  const positive = (v: unknown) => isInt(v, 1);
  const bool = (v: unknown) => typeof v === "boolean";
  check("hasMore", bool, "a boolean");
  if (mode === "page") {
    check("page", positive, "a positive integer");
    check("pageSize", positive, "a positive integer");
    check("total", nonNegative, "a non-negative integer");
    check("pageCount", nonNegative, "a non-negative integer");
    const pageCount = get("pageCount");
    const hasMore = get("hasMore");
    if (typeof pageCount === "number" && typeof hasMore === "boolean") {
      if (hasMore !== (get("page") as number) < pageCount) {
        fail(resource, opName, "hasMore", "contradicts page and pageCount");
      }
    }
  } else if (mode === "offset") {
    check("offset", nonNegative, "a non-negative integer");
    check("pageSize", positive, "a positive integer");
    check("total", nonNegative, "a non-negative integer");
    const cont = (v: unknown) => v === null || nonNegative(v);
    check("nextOffset", cont, "a non-negative integer or null");
    check("previousOffset", cont, "a non-negative integer or null");
    const next = get("nextOffset");
    const hasMore = get("hasMore");
    if (typeof hasMore === "boolean" && next !== undefined) {
      if (hasMore !== (next !== null)) {
        fail(resource, opName, "hasMore", "contradicts nextOffset");
      }
    }
  } else {
    const cursor = (v: unknown) => v === null || typeof v === "string";
    check("nextCursor", cursor, "a string or null");
    check("previousCursor", cursor, "a string or null");
    const next = get("nextCursor");
    const hasMore = get("hasMore");
    if (typeof hasMore === "boolean" && next !== undefined) {
      if (hasMore !== (next !== null)) {
        // Never print the cursor value itself.
        fail(resource, opName, "hasMore", "contradicts nextCursor");
      }
    }
  }
  return body as PaginatedResult;
}

function mapFields(
  resource: string,
  opName: string,
  mode: Mode,
  extra: readonly string[],
  declared: PaginationFields,
  pageBase: 0 | 1,
  body: unknown,
): Row {
  const required = new Set([...REQUIRED[mode], ...extra]);
  const out: Row = {};
  for (const key of ALL_KEYS[mode]) {
    const explicit = declared[key];
    const path = explicit ?? key;
    const hit = readPath(body, path);
    if (!hit.found) {
      if (required.has(key) || explicit !== undefined) {
        fail(resource, opName, path, "is missing from the response");
      }
      continue;
    }
    out[key] = hit.value;
  }
  if (mode === "page" && pageBase === 0 && typeof out.page === "number") out.page += 1;
  return out;
}

/** Build the runtime pagination for one operation (`undefined` when absent or `false`). */
export function resolvePagination(
  resource: string,
  value: ResourcePagination | undefined,
  opName = "getAll",
): ResolvedPagination | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return resolvePagination(resource, "page", opName);
  if (typeof value === "string" && SHORTHANDS.has(value)) {
    const mode = value as Mode;
    return finish(
      {
        mode,
        required: STRICT_REQUIRED[mode],
        pageBase: 1,
        parse: (body) =>
          validatePaginatedResult(body, mode, STRICT_REQUIRED[mode], resource, opName),
        validate: (data) =>
          validatePaginatedResult(data, mode, STRICT_REQUIRED[mode], resource, opName),
      },
      resource,
      opName,
    );
  }
  if (typeof value === "string") {
    return resolvePagination(resource, { strategy: "page", preset: value as never }, opName);
  }
  const mode: Mode = value.strategy ?? "page";
  const preset = value.preset ? (PRESETS as PresetTable)[value.preset]![mode]! : undefined;
  const bare = !preset && !value.fields && !value.parseList;
  const declared = (value.fields ?? preset?.fields ?? {}) as PaginationFields;
  const required: readonly string[] = value.parseList
    ? []
    : preset || bare
      ? STRICT_REQUIRED[mode]
      : STRICT_REQUIRED[mode].filter(
          (key) => declared[key as keyof PaginationFields] !== undefined,
        );
  const pageBase = value.pageBase ?? 1;
  const params = { ...(preset?.params ?? {}), ...(value.params ?? {}) };
  const validate = (data: unknown) =>
    validatePaginatedResult(data, mode, required, resource, opName);
  const parse = value.parseList
    ? (body: unknown, ctx: PaginationResponseContext): PaginatedResult => {
        const out = (value.parseList as (b: unknown, c: PaginationResponseContext) => unknown)(
          body,
          ctx,
        );
        if (!isRecord(out) || !Array.isArray(out.data)) {
          throw new ParseError(
            `${resource}.${opName}: parseList must return an object with a \`data\` array.`,
          );
        }
        return validate(out);
      }
    : (body: unknown) =>
        validate(mapFields(resource, opName, mode, required, declared, pageBase, body));
  return finish(
    {
      mode,
      required,
      pageBase,
      ...(Object.keys(params).length ? { params } : {}),
      ...(value.defaultPageSize !== undefined ? { defaultPageSize: value.defaultPageSize } : {}),
      ...(value.maxPageSize !== undefined ? { maxPageSize: value.maxPageSize } : {}),
      ...(value.buildRequest ? { buildRequest: value.buildRequest } : {}),
      parse,
      validate,
    },
    resource,
    opName,
  );
}

/** Reject configurations whose backend names collide (two logical values on one wire name). */
function finish(
  resolved: ResolvedPagination,
  resource: string,
  opName: string,
): ResolvedPagination {
  const seen = new Map<string, string>();
  for (const key of LOGICAL_KEYS[resolved.mode]) {
    const mapped = resolved.params?.[key as keyof PaginationParams];
    if (key === "before" && mapped === undefined) continue;
    const wire = mapped ?? key;
    const previous = seen.get(wire);
    if (previous !== undefined) {
      throw new ConfigError(
        `${resource}.${opName}: pagination maps "${previous}" and "${key}" to the same backend name "${wire}".`,
      );
    }
    seen.set(wire, key);
  }
  return resolved;
}

/**
 * Resolve pagination for an individual operation.
 *
 * - `undefined` on `getAll` follows the shared resource configuration; elsewhere it means off.
 * - `false` is off; `true` uses the resource configuration (or the standard `"page"` contract).
 * - Any other value is an independent configuration: nothing from the resource is merged into it.
 */
export function resolveOperationPagination(
  resourceName: string,
  resourcePagination: ResourcePagination | undefined,
  opName: string,
  opPagination: ResourcePagination | undefined,
  isBuiltin: boolean,
): ResolvedPagination | undefined {
  const isGetAll = isBuiltin && opName === "getAll";
  if (opPagination === undefined) {
    return isGetAll ? resolvePagination(resourceName, resourcePagination, opName) : undefined;
  }
  if (opPagination === false) return undefined;
  if (opPagination === true) {
    return (
      resolvePagination(resourceName, resourcePagination, opName) ??
      resolvePagination(resourceName, "page", opName)
    );
  }
  return resolvePagination(resourceName, opPagination, opName);
}
