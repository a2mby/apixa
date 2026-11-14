import { ConfigError } from "../errors/config-error.js";
import { ParseError } from "../errors/parse-error.js";
import type {
  ResourcePagination,
  PaginationFields,
  PaginationParams,
} from "../types/definition.js";

type Mode = "page" | "cursor";
type Row = Record<string, unknown>;

/** What a live paginated `getAll` resolves to (the same contract mocks produce). */
export type PageResult =
  | { data: unknown[]; total: number; page: number; pageSize: number }
  | { data: unknown[]; nextCursor: string | null };

/** Resolved, ready-to-run pagination for one resource. */
export interface ResolvedPagination {
  mode: Mode;
  /** Rename apixa's `page` / `pageSize` / `cursor` query keys on the wire. */
  params?: PaginationParams;
  /**
   * Turn a live response body into the validated page contract (throws `ParseError`).
   */
  parse?: (body: unknown, status: number) => PageResult;
}

/**
 * Backend presets are data only: field paths and query names, never code. A preset ships only for
 * a shape that is a pure 1-based field mapping (no offsets, headers or request-derived values).
 * Each was checked against the shape the backend or library documents, and the Laravel ones also
 * against real output of the playground backend (`examples/backends/laravel-backend`).
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
      fields: { data: "data", nextCursor: "next_cursor" },
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
} satisfies Record<
  string,
  Partial<Record<Mode, { fields: PaginationFields; params: PaginationParams }>>
>;

/** Names accepted by `pagination.preset`. */
export const PAGINATION_PRESET_NAMES = Object.keys(PRESETS) as (keyof typeof PRESETS)[];

type PresetTable = Record<
  string,
  Partial<Record<Mode, { fields: PaginationFields; params: PaginationParams }>>
>;

const OWN_FIELDS: Record<Mode, PaginationFields> = {
  page: { data: "data", total: "total", page: "page", pageSize: "pageSize" },
  cursor: { data: "data", nextCursor: "nextCursor" },
};

const FIELD_KEYS = new Set(["data", "total", "page", "pageSize", "nextCursor"]);
const PARAM_KEYS = new Set(["page", "pageSize", "cursor"]);

function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPath(body: unknown, path: string): { found: boolean; value: unknown } {
  let current: unknown = body;
  for (const key of path.split(".")) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

function checkKeys(where: string, label: string, value: unknown, allowed: Set<string>): Row {
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
  }
  return value;
}

/** Validate a resource or operation `pagination` value; throws `ConfigError` naming the offending key. */
export function validatePagination(where: string, value: unknown): void {
  if (value === undefined || typeof value === "boolean" || value === "page" || value === "cursor") {
    return;
  }
  if (typeof value === "string") {
    if (Object.hasOwn(PRESETS, value)) return;
    throw new ConfigError(
      `${where}.pagination must be true, false, "page" or "cursor", a preset (${PAGINATION_PRESET_NAMES.join(", ")}), or an object (got ${JSON.stringify(value)}).`,
    );
  }
  if (!isRecord(value)) {
    throw new ConfigError(
      `${where}.pagination must be true, false, "page" or "cursor", a preset (${PAGINATION_PRESET_NAMES.join(", ")}), or an object (got ${JSON.stringify(value)}).`,
    );
  }
  const allowed = new Set(["type", "preset", "fields", "params", "parseList"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `${where}.pagination: unknown key "${key}" (expected ${[...allowed].join(", ")}).`,
      );
    }
  }
  if (value.preset !== undefined) {
    if (typeof value.preset !== "string" || !Object.hasOwn(PRESETS, value.preset)) {
      throw new ConfigError(
        `${where}.pagination.preset must be one of ${PAGINATION_PRESET_NAMES.join(", ")} (got ${JSON.stringify(value.preset)}).`,
      );
    }
    if (value.fields !== undefined) {
      throw new ConfigError(`${where}.pagination: use either \`preset\` or \`fields\`, not both.`);
    }
  }
  const effectiveType = value.type ?? (value.preset !== undefined ? "page" : undefined);
  if (effectiveType !== "page" && effectiveType !== "cursor") {
    throw new ConfigError(
      `${where}.pagination.type must be "page" or "cursor" (got ${JSON.stringify(value.type)}).`,
    );
  }
  if (
    value.preset !== undefined &&
    !(PRESETS as PresetTable)[value.preset as string]![effectiveType]
  ) {
    throw new ConfigError(
      `${where}.pagination.preset "${value.preset}" has no "${effectiveType}" mapping; declare \`fields\` or \`parseList\`.`,
    );
  }
  if (value.fields !== undefined) checkKeys(where, "pagination.fields", value.fields, FIELD_KEYS);
  if (value.params !== undefined) checkKeys(where, "pagination.params", value.params, PARAM_KEYS);
  if (value.parseList !== undefined && typeof value.parseList !== "function") {
    throw new ConfigError(`${where}.pagination.parseList must be a function.`);
  }
}

function fail(resource: string, opName: string, path: string, detail: string): never {
  throw new ParseError(`${resource}.${opName}: pagination field "${path}" ${detail}.`);
}

function number(resource: string, opName: string, path: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(resource, opName, path, `must be a number (got ${JSON.stringify(value)})`);
  }
  return value;
}

function fromFields(resource: string, opName: string, mode: Mode, fields: PaginationFields) {
  const merged = { ...OWN_FIELDS[mode], ...fields };
  return (body: unknown): PageResult => {
    const pick = (key: keyof PaginationFields): unknown => {
      const path = merged[key]!;
      const hit = readPath(body, path);
      if (!hit.found) fail(resource, opName, path, "is missing from the response");
      return hit.value;
    };
    const data = pick("data");
    if (!Array.isArray(data)) fail(resource, opName, merged.data!, "must be an array");
    if (mode === "page") {
      return {
        data,
        total: number(resource, opName, merged.total!, pick("total")),
        page: number(resource, opName, merged.page!, pick("page")),
        pageSize: number(resource, opName, merged.pageSize!, pick("pageSize")),
      };
    }
    const next = pick("nextCursor");
    if (next !== null && typeof next !== "string") {
      fail(resource, opName, merged.nextCursor!, "must be a string or null");
    }
    return { data, nextCursor: next };
  };
}

/** Check the public envelope without dropping backend extension metadata. */
export function validatePageResult(
  body: unknown,
  mode: Mode,
  resource: string,
  opName: string,
): PageResult {
  fromFields(resource, opName, mode, {})(body);
  if (mode === "page") {
    const page = body as Extract<PageResult, { total: number }>;
    for (const key of ["total", "page", "pageSize"] as const) {
      const value = page[key];
      if (!Number.isInteger(value) || value < (key === "total" ? 0 : 1)) {
        fail(
          resource,
          opName,
          key,
          key === "total" ? "must be a non-negative integer" : "must be a positive integer",
        );
      }
    }
  }
  return body as PageResult;
}

/** Build the runtime pagination for a resource (`undefined` when absent or `false`). */
export function resolvePagination(
  resource: string,
  value: ResourcePagination | undefined,
  opName = "getAll",
): ResolvedPagination | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return resolvePagination(resource, "page", opName);
  if (value === "page" || value === "cursor") {
    return { mode: value, parse: (body) => validatePageResult(body, value, resource, opName) };
  }
  if (typeof value === "string") {
    return resolvePagination(resource, { type: "page", preset: value }, opName);
  }
  const mode = value.type ?? "page";
  const preset = value.preset ? (PRESETS as PresetTable)[value.preset]![mode]! : undefined;
  const params = { ...(preset?.params ?? {}), ...(value.params ?? {}) };
  const parse = value.parseList
    ? (body: unknown, status: number): PageResult => {
        const out = (value.parseList as (b: unknown, c: { status: number }) => PageResult)(body, {
          status,
        });
        if (!isRecord(out) || !Array.isArray(out.data)) {
          throw new ParseError(
            `${resource}.${opName}: parseList must return an object with a \`data\` array.`,
          );
        }
        return validatePageResult(out, mode, resource, opName);
      }
    : (body: unknown) =>
        validatePageResult(
          fromFields(resource, opName, mode, value.fields ?? preset?.fields ?? {})(body),
          mode,
          resource,
          opName,
        );
  return { mode, params: Object.keys(params).length ? params : undefined, parse };
}

/** Resolve pagination for an individual operation (`getAll` inherits resource pagination; `getMany` and custom ops opt in). */
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
    const inherited = resolvePagination(resourceName, resourcePagination, opName);
    return inherited ?? resolvePagination(resourceName, "page", opName);
  }
  return resolvePagination(resourceName, opPagination, opName);
}

/** Rename apixa's pagination query keys to the backend's (live requests only). */
export function renamePaginationQuery<T extends Record<string, unknown> | undefined>(
  query: T,
  params: PaginationParams | undefined,
): T {
  if (!query || !params) return query;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    out[Object.hasOwn(params, key) ? params[key as keyof PaginationParams]! : key] = value;
  }
  return out as T;
}
