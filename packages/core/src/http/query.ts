import { SerializationError } from "../errors/index.js";
import type { QueryArrayFormat, QueryOptions } from "../types/definition.js";
import type { QueryParams } from "../types/http.js";
import { isPlainObject, MAX_DEPTH } from "./multipart.js";

function invalid(path: string, what: string): never {
  throw new SerializationError(`Cannot encode ${what} at ${path} in the query string.`, { path });
}

function scalarText(
  value: unknown,
  path: string,
  nulls: NonNullable<QueryOptions["nulls"]>,
  booleans: NonNullable<QueryOptions["booleans"]>,
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    if (nulls === "omit") return undefined;
    return nulls === "null" ? "null" : "";
  }
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) invalid(path, "a non-finite number");
      return String(value);
    case "boolean":
      return booleans === "number" ? (value ? "1" : "0") : String(value);
    case "bigint":
    case "function":
    case "symbol":
      return invalid(path, typeof value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) invalid(path, "an invalid Date");
    return value.toISOString();
  }
  return invalid(path, `a ${(value as object).constructor?.name ?? "non-plain"} value`);
}

/**
 * Serialize structured query parameters into a query string starting with `?` (or `""` if empty).
 * Supports nested plain objects (`filter[color]=blue`), arrays (`repeat`, `brackets`, `comma`),
 * ISO-8601 `Date`s, percent-encoded keys, and configurable `null`, empty-array, and boolean modes.
 */
export function buildQueryString(
  query?: QueryParams,
  format: QueryArrayFormat = "repeat",
  options: QueryOptions = {},
): string {
  if (query === undefined) return "";
  if (!isPlainObject(query)) invalid("$", "a query value that is not a plain object");

  const nulls = options.nulls ?? "omit";
  const emptyArrays = options.emptyArrays ?? "omit";
  const booleans = options.booleans ?? "string";
  const parts: string[] = [];
  const active = new Set<object>();

  const pushPair = (wireKey: string, text: string) => {
    parts.push(`${encodeURIComponent(wireKey)}=${encodeURIComponent(text)}`);
  };

  const append = (wireKey: string, value: unknown, path: string, depth: number): void => {
    if (value === undefined) return;
    if (value === null) {
      const text = scalarText(value, path, nulls, booleans);
      if (text !== undefined) pushPair(wireKey, text);
      return;
    }
    if (typeof value !== "object" || value instanceof Date) {
      const text = scalarText(value, path, nulls, booleans);
      if (text !== undefined) pushPair(wireKey, text);
      return;
    }

    const isArray = Array.isArray(value);
    if (!isArray && !isPlainObject(value)) {
      invalid(path, `a ${(value as object).constructor?.name ?? "non-plain"} value`);
    }
    if (depth > MAX_DEPTH) invalid(path, "a value nested too deeply");
    if (active.has(value)) invalid(path, "a circular reference");

    active.add(value);
    try {
      if (isArray) {
        if (value.length === 0) {
          if (emptyArrays === "empty") {
            pushPair(format === "brackets" ? `${wireKey}[]` : wireKey, "");
          }
          return;
        }
        if (format === "comma") {
          const hasStructured = value.some(
            (item) => item !== null && typeof item === "object" && !(item instanceof Date),
          );
          if (!hasStructured) {
            const items: string[] = [];
            value.forEach((item, i) => {
              const text = scalarText(item, `${path}[${i}]`, nulls, booleans);
              if (text !== undefined) items.push(text);
            });
            if (items.length > 0) {
              pushPair(wireKey, items.join(","));
            } else if (emptyArrays === "empty") {
              pushPair(wireKey, "");
            }
            return;
          }
        }
        let emitted = false;
        value.forEach((item, i) => {
          if (item === undefined) return;
          const itemPath = `${path}[${i}]`;
          if (item !== null && typeof item === "object" && !(item instanceof Date)) {
            emitted = true;
            append(`${wireKey}[${i}]`, item, itemPath, depth + 1);
            return;
          }
          const text = scalarText(item, itemPath, nulls, booleans);
          if (text !== undefined) {
            emitted = true;
            pushPair(format === "brackets" ? `${wireKey}[]` : wireKey, text);
          }
        });
        if (!emitted && emptyArrays === "empty") {
          pushPair(format === "brackets" ? `${wireKey}[]` : wireKey, "");
        }
        return;
      }

      for (const [key, child] of Object.entries(value)) {
        append(`${wireKey}[${key}]`, child, `${path}.${key}`, depth + 1);
      }
    } finally {
      active.delete(value);
    }
  };

  active.add(query);
  try {
    for (const [key, value] of Object.entries(query)) {
      append(key, value, `$.${key}`, 1);
    }
  } finally {
    active.delete(query);
  }

  return parts.length ? `?${parts.join("&")}` : "";
}
