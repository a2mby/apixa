import { TransformError } from "../errors/index.js";

/** Supported key conventions for `transforms.request.keys` / `transforms.response.keys`. */
export type KeyCase = "camelCase" | "snake_case" | "PascalCase" | "kebab-case";

export const KEY_CASES: readonly KeyCase[] = ["camelCase", "snake_case", "PascalCase", "kebab-case"];

export function isKeyCase(value: unknown): value is KeyCase {
  return typeof value === "string" && (KEY_CASES as readonly string[]).includes(value);
}

const isSeparator = (c: string) => c === "_" || c === "-";
const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();

/**
 * Character-wise conversion. The type-level converters in `types/transform.ts` follow the
 * exact same rules so runtime keys and TypeScript keys always agree.
 */
function toDelimited(key: string, sep: "_" | "-"): string {
  let out = "";
  for (const c of key) {
    if (isSeparator(c)) {
      if (out !== "" && !out.endsWith(sep)) out += sep;
    } else if (isUpper(c)) {
      out += out === "" || out.endsWith(sep) ? c.toLowerCase() : sep + c.toLowerCase();
    } else {
      out += c;
    }
  }
  return out;
}

function toCamel(key: string): string {
  let out = "";
  let upperNext = false;
  for (const c of key) {
    if (isSeparator(c)) {
      upperNext = out !== "";
    } else if (out === "") {
      out += c.toLowerCase();
      upperNext = false;
    } else {
      out += upperNext ? c.toUpperCase() : c;
      upperNext = false;
    }
  }
  return out;
}

export function convertKey(key: string, to: KeyCase): string {
  switch (to) {
    case "camelCase":
      return toCamel(key);
    case "PascalCase": {
      const camel = toCamel(key);
      return camel.charAt(0).toUpperCase() + camel.slice(1);
    }
    case "snake_case":
      return toDelimited(key, "_");
    case "kebab-case":
      return toDelimited(key, "-");
  }
}

/** Only plain objects (`{}` / `Object.create(null)`) and arrays are walked. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const MAX_DEPTH = 64;

/**
 * Recursively convert the keys of plain objects (including inside arrays). Values are never
 * rewritten; Dates, Blobs, streams, Maps, class instances, etc. pass through untouched.
 * Returns a new structure — the input is never mutated. Throws `TransformError` when two keys
 * collapse into the same converted key.
 */
export function transformKeys(value: unknown, to: KeyCase, cache?: Map<string, string>): unknown {
  return walk(value, to, cache ?? new Map(), "$", 0);
}

function walk(
  value: unknown,
  to: KeyCase,
  cache: Map<string, string>,
  path: string,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) {
    throw new TransformError(`Key transform exceeded max depth ${MAX_DEPTH} at ${path}`, {
      path,
      keys: [],
    });
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => walk(item, to, cache, `${path}[${i}]`, depth + 1));
  }
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  const origin = new Map<string, string>();
  for (const key of Object.keys(value)) {
    let next = cache.get(key);
    if (next === undefined) {
      next = convertKey(key, to);
      cache.set(key, next);
    }
    const previous = origin.get(next);
    if (previous !== undefined) {
      throw new TransformError(
        `Key transform to ${to} collision at ${path}: "${previous}" and "${key}" both become "${next}"`,
        { path, keys: [previous, key] },
      );
    }
    origin.set(next, key);
    const converted = walk(value[key], to, cache, `${path}.${key}`, depth + 1);
    if (next === "__proto__") {
      Object.defineProperty(out, next, { value: converted, enumerable: true, writable: true, configurable: true });
    } else {
      out[next] = converted;
    }
  }
  return out;
}
