import { SerializationError } from "../errors/index.js";
import type { MultipartOptions } from "../types/definition.js";

const MAX_DEPTH = 32;

/** Resolved per operation at construction; field names are already in wire (post-transform) form. */
export interface MultipartRuntime {
  options: Required<Pick<MultipartOptions, "nulls" | "arrays">>;
  /** Wire field name → verbatim part name. */
  aliases: ReadonlyMap<string, string>;
  /** Wire field names sent as one JSON part. */
  jsonFields: ReadonlySet<string>;
}

export const DEFAULT_MULTIPART: MultipartRuntime = {
  options: { nulls: "empty", arrays: "brackets" },
  aliases: new Map(),
  jsonFields: new Set(),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

/** True when a plain object / array (any depth, bounded) holds a `Blob` or `File`. */
export function containsBinary(value: unknown): boolean {
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): boolean => {
    if (isBlob(node)) return true;
    if (node === null || typeof node !== "object" || depth > MAX_DEPTH || seen.has(node)) {
      return false;
    }
    if (!Array.isArray(node) && !isPlainObject(node)) return false;
    seen.add(node);
    return (Array.isArray(node) ? node : Object.values(node)).some((v) => walk(v, depth + 1));
  };
  return walk(value, 0);
}

function unsupported(path: string, what: string): never {
  throw new SerializationError(`Cannot encode ${what} at ${path} as multipart/form-data.`, {
    path,
  });
}

/**
 * Encode a plain object (or a top-level array, as `items[i][field]`) as `FormData`. Never mutates
 * the input; binary parts keep their bytes, name and type. Errors name paths, never values.
 */
export function serializeMultipart(
  body: unknown,
  runtime: MultipartRuntime = DEFAULT_MULTIPART,
): FormData {
  const form = new FormData();
  const { nulls, arrays } = runtime.options;
  const active = new Set<object>();

  const appendBlob = (name: string, blob: Blob) => {
    if (typeof File !== "undefined" && blob instanceof File) form.append(name, blob, blob.name);
    else form.append(name, blob, "blob");
  };

  const appendValue = (name: string, value: unknown, path: string, depth: number): void => {
    if (value === undefined) return;
    if (value === null) {
      if (nulls === "empty") form.append(name, "");
      return;
    }
    if (isBlob(value)) return appendBlob(name, value);
    switch (typeof value) {
      case "string":
        return void form.append(name, value);
      case "number":
      case "boolean":
      case "bigint":
        return void form.append(name, String(value));
      case "function":
      case "symbol":
        return unsupported(path, typeof value);
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return unsupported(path, "an invalid Date");
      return void form.append(name, value.toISOString());
    }
    const isArray = Array.isArray(value);
    if (!isArray && !isPlainObject(value)) {
      return unsupported(path, `a ${(value as object).constructor?.name ?? "non-plain"} value`);
    }
    if (depth > MAX_DEPTH) return unsupported(path, "a value nested too deeply");
    if (active.has(value as object)) return unsupported(path, "a circular reference");
    active.add(value as object);
    try {
      if (isArray) {
        const items = value as unknown[];
        if (items.length > 0 && items.every(isBlob)) {
          for (const item of items) appendBlob(name, item as Blob);
        } else {
          items.forEach((item, i) => {
            const nested =
              item !== null && typeof item === "object" && !isBlob(item) && !(item instanceof Date);
            const key =
              nested || arrays === "indices"
                ? `${name}[${i}]`
                : arrays === "repeat"
                  ? name
                  : `${name}[]`;
            appendValue(key, item, `${path}[${i}]`, depth + 1);
          });
        }
      } else {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          appendValue(`${name}[${key}]`, child, `${path}.${key}`, depth + 1);
        }
      }
    } finally {
      active.delete(value as object);
    }
  };

  const appendRoot = (key: string, value: unknown, path: string) => {
    const name = runtime.aliases.get(key) ?? key;
    if (runtime.jsonFields.has(key)) {
      if (value === undefined) return;
      if (containsBinary(value)) {
        return unsupported(path, "binary values inside a JSON-encoded field");
      }
      let json: string | undefined;
      try {
        json = JSON.stringify(value);
      } catch {
        return unsupported(path, "a value that is not JSON-serializable");
      }
      if (json !== undefined) form.append(name, json);
      return;
    }
    appendValue(name, value, path, 1);
  };

  if (Array.isArray(body)) {
    body.forEach((item, i) => appendValue(`items[${i}]`, item, `$[${i}]`, 1));
  } else if (isPlainObject(body)) {
    for (const [key, value] of Object.entries(body)) appendRoot(key, value, `$.${key}`);
  } else {
    unsupported("$", "a body that is not a plain object or array");
  }
  return form;
}
