import { isHttpError } from "../errors/index.js";
import { joinPath } from "../http/path.js";
import type { OperationFn, OperationFnContext } from "../types/builtins.js";
import type { QueryParams } from "../types/http.js";

/**
 * Composed builtins: implemented as ordinary operation functions (the same mechanism a
 * developer's own custom operation uses), not a private shortcut. `exists` / `findFirst` /
 * `getMany` delegate to the resource's already-resolved `getById` / `getAll` client functions
 * (wired in `api/resource-client.ts`) so an override of either is honored automatically; the
 * versions here are only the fallback used when `getById` / `getAll` has been removed via
 * `false`, in which case they fall back to the bare convention wire shape. `getBy` is a general
 * escape hatch for a custom field/path; it does assume whatever path you give it exists, and has
 * nothing to delegate to.
 */

const PARAM_PATTERN = /:[A-Za-z0-9_]+/;

const getBy: OperationFn = async (
  ctx: OperationFnContext,
  fieldOrPath: string,
  value: string | number,
) => {
  const encoded = encodeURIComponent(String(value));
  // `"/code/:code"` → interpolate the placeholder. `"slug"` / `"/by-slug"` → append the value.
  const relativePath = PARAM_PATTERN.test(fieldOrPath)
    ? fieldOrPath.replace(PARAM_PATTERN, encoded)
    : joinPath(fieldOrPath, encoded);
  return ctx.request({ method: "GET", path: relativePath });
};

/** A bare array, or a paginated envelope (`{ data, total, page, ... }`) — normalize to an array. */
function toArray(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)) {
    return (result as { data: unknown[] }).data;
  }
  return [];
}

const existsFallback: OperationFn = async (ctx: OperationFnContext, id: string | number) => {
  try {
    await ctx.request({ method: "GET", path: "/:id", params: { id } });
    return true;
  } catch (error) {
    if (isHttpError(error) && error.status === 404) return false;
    throw error;
  }
};

const findFirstFallback: OperationFn = async (ctx: OperationFnContext, query?: QueryParams) => {
  const list = await ctx.request<unknown>({ method: "GET", path: "", query });
  return toArray(list)[0] ?? null;
};

const getManyFallback: OperationFn = async (
  ctx: OperationFnContext,
  ids: Array<string | number>,
) => {
  const list = await ctx.request<unknown>({ method: "GET", path: "", query: { id: ids } });
  return toArray(list);
};

/**
 * Default, convention-only implementations — used by `expandOperations` to list the always-on
 * composed builtin names, and as the fallback when `api/resource-client.ts` finds `getById` /
 * `getAll` has been removed from the same resource. Prefer `createComposedBuiltins` below for the
 * real runtime wiring, which delegates to the resource's resolved operations instead.
 */
export const COMPOSED_BUILTINS: Record<string, OperationFn> = {
  exists: existsFallback,
  findFirst: findFirstFallback,
  getMany: getManyFallback,
  getBy,
};

export interface ComposedBuiltinDeps {
  /** The resource's already-resolved, override-aware `getById` client function, if present. */
  getById?: (...args: unknown[]) => Promise<unknown>;
  /** The resource's already-resolved, override-aware `getAll` client function, if present. */
  getAll?: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Build `exists` / `findFirst` / `getMany` against the resource's actual resolved `getById` /
 * `getAll` functions, so an override of either (custom path, custom config, or a custom function)
 * is honored by anything composed on top of it. Falls back to the bare convention wire shape via
 * `ctx.request` only when the corresponding builtin isn't available (removed with `false`).
 */
export function createComposedBuiltins(deps: ComposedBuiltinDeps): Record<string, OperationFn> {
  const exists: OperationFn = deps.getById
    ? async (_ctx: OperationFnContext, id: string | number) => {
        try {
          await deps.getById!(id);
          return true;
        } catch (error) {
          if (isHttpError(error) && error.status === 404) return false;
          throw error;
        }
      }
    : existsFallback;

  const findFirst: OperationFn = deps.getAll
    ? async (_ctx: OperationFnContext, query?: QueryParams) => {
        const result = await deps.getAll!(query !== undefined ? { query } : undefined);
        return toArray(result)[0] ?? null;
      }
    : findFirstFallback;

  const getMany: OperationFn = deps.getAll
    ? async (_ctx: OperationFnContext, ids: Array<string | number>) => {
        const result = await deps.getAll!({ query: { id: ids } });
        return toArray(result);
      }
    : getManyFallback;

  return { exists, findFirst, getMany, getBy };
}
