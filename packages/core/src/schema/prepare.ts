import { ConfigError } from "../errors/index.js";
import type { QueryParams } from "../types/http.js";
import type { StandardSchemaV1 } from "../types/standard-schema.js";
import { validateSync, type SchemaSite } from "./validate.js";

/** Per-operation validators, resolved once at construction. */
export interface PreparedSchemas {
  body?: StandardSchemaV1;
  query?: StandardSchemaV1;
  response?: StandardSchemaV1;
}

/**
 * Query objects that already went through a schema (never validated twice). Remembers which schema
 * and control keys produced them: a query prepared for one operation is never trusted by another.
 */
const PREPARED_QUERIES = new WeakMap<
  object,
  { schema: StandardSchemaV1; controlKeys: readonly string[] | undefined }
>();

function sameKeys(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  return !!a && !!b && a.length === b.length && a.every((key, i) => key === b[i]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the caller's query synchronously and return the parsed value. `controlKeys` are the
 * SDK-owned pagination controls (`page`, `pageSize`, ...): they are not application filters, so
 * they bypass the schema and are merged back untouched (an object schema would otherwise strip
 * them silently). A query that was already prepared is returned as is.
 */
export function prepareQuery(
  schema: StandardSchemaV1,
  query: QueryParams | undefined,
  site: SchemaSite,
  controlKeys?: readonly string[],
): QueryParams | undefined {
  if (query !== undefined && isRecord(query)) {
    const known = PREPARED_QUERIES.get(query);
    if (known && known.schema === schema && sameKeys(known.controlKeys, controlKeys)) return query;
  }
  let input: unknown = query;
  let controls: Record<string, unknown> | undefined;
  if (controlKeys && isRecord(query)) {
    const rest: Record<string, unknown> = {};
    for (const key of Object.keys(query)) {
      if (controlKeys.includes(key)) (controls ??= {})[key] = query[key];
      else rest[key] = query[key];
    }
    input = controls ? rest : query;
  }
  const parsed = validateSync(schema, input, site);
  if (parsed !== undefined && !isRecord(parsed)) {
    throw new ConfigError(
      `${site.resource}.${site.operation}.schema.query: the schema must produce an object (or undefined), got ${parsed === null ? "null" : Array.isArray(parsed) ? "an array" : typeof parsed}.`,
    );
  }
  if (parsed === undefined && controls === undefined) return undefined;
  const out = { ...(parsed ?? {}), ...(controls ?? {}) } as QueryParams;
  PREPARED_QUERIES.set(out, { schema, controlKeys });
  return out;
}
