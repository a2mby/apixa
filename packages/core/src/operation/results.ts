import { ResponseShapeError, ValidationError } from "../errors/index.js";
import type { ApiResponse, GetManySort } from "../types/transport.js";

type Id = string | number;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Canonical integers share a domain; codes such as '001' remain exact strings. */
function identity(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? `n:${value}` : undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && String(n) === value ? `n:${n}` : `s:${value}`;
}

export function prepareBatchIds(value: unknown): Id[] {
  if (!Array.isArray(value)) throw new ValidationError("getMany: ids must be an array.");
  const seen = new Set<string>();
  const ids: Id[] = [];
  for (const id of value) {
    const key = identity(id);
    if (key === undefined)
      throw new ValidationError("getMany: each id must be a nonempty string or safe integer.");
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  }
  return ids;
}

export function normalizeCount(value: unknown, response: ApiResponse<unknown>): number {
  let candidate = value;
  if (record(value)) {
    const key = ["count", "total", "data", "records", "quantity", "numberOfUsers"].find((key) =>
      Object.hasOwn(value, key),
    );
    candidate =
      key !== undefined
        ? value[key]
        : Object.hasOwn(value, "statistics") &&
            record(value.statistics) &&
            Object.hasOwn(value.statistics, "count")
          ? value.statistics.count
          : undefined;
  }
  if (typeof candidate === "string" && /^\d+$/.test(candidate.trim()))
    candidate = Number(candidate.trim());
  if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0)
    return candidate;
  throw new ResponseShapeError(
    "count: expected a nonnegative safe integer in a supported count response.",
    { response, status: response.status },
  );
}

/** Validate membership once, then restore requested order and optionally sort without mutating records. */
export function finalizeBatch(
  value: unknown,
  ids: readonly Id[],
  idKey: string,
  sort: GetManySort | undefined,
  response: ApiResponse<unknown>,
  allowSubset = false,
): unknown[] {
  const fail = (message: string): never => {
    throw new ResponseShapeError(`getMany: ${message}`, { response, status: response.status });
  };
  if (!Array.isArray(value)) return fail("expected an array response.");
  const requested = new Set(ids.map((id) => identity(id)!));
  const found = new Map<string, Record<string, unknown>>();
  const extraIds: Id[] = [],
    duplicateIds: Id[] = [];
  for (const item of value) {
    if (!record(item) || !Object.hasOwn(item, idKey))
      return fail(`missing identity property "${idKey}".`);
    const key = identity(item[idKey]);
    if (key === undefined) return fail(`invalid identity property "${idKey}".`);
    if (found.has(key)) duplicateIds.push(item[idKey] as Id);
    if (!requested.has(key)) extraIds.push(item[idKey] as Id);
    found.set(key, item);
  }
  const missingIds = allowSubset ? [] : ids.filter((id) => !found.has(identity(id)!));
  if (missingIds.length || extraIds.length || duplicateIds.length) {
    throw new ResponseShapeError("getMany: response identities do not match the requested ids.", {
      response,
      status: response.status,
      missingIds,
      extraIds,
      duplicateIds,
    });
  }
  const orderedIds = allowSubset ? ids.filter((id) => found.has(identity(id)!)) : ids;
  const result = orderedIds.map((id) => found.get(identity(id)!)!);
  if (sort === undefined) return result;
  const config = typeof sort === "string" ? { field: sort } : sort;
  if (
    !record(config) ||
    typeof config.field !== "string" ||
    !config.field ||
    (config.order !== undefined && config.order !== "asc" && config.order !== "desc") ||
    (config.type !== undefined && config.type !== "number" && config.type !== "string")
  ) {
    throw new ValidationError("getMany: invalid sortBy configuration.");
  }
  const numeric = config.type === "number";
  const keys = result.map((item) => {
    let v = item[config.field];
    if (!Object.hasOwn(item, config.field)) return fail(`missing sort field "${config.field}".`);
    if (numeric && typeof v === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)) v = Number(v);
    if (numeric) {
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)
        return fail(`invalid numeric sort field "${config.field}".`);
      return v;
    }
    if (typeof v !== "string" && (typeof v !== "number" || !Number.isFinite(v)))
      return fail(`invalid sort field "${config.field}".`);
    return v;
  });
  const direction = config.order === "desc" ? -1 : 1;
  return result
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const x = keys[a.i]!,
        y = keys[b.i]!;
      return (x < y ? -direction : x > y ? direction : 0) || a.i - b.i;
    })
    .map(({ item }) => item);
}
