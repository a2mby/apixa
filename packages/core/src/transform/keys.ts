import { TransformError } from "../errors/index.js";

/** Supported key conventions for `transforms.request.keys` / `transforms.response.keys`. */
export type KeyCase = "camelCase" | "snake_case" | "PascalCase" | "kebab-case";

export const KEY_CASES: readonly KeyCase[] = [
  "camelCase",
  "snake_case",
  "PascalCase",
  "kebab-case",
];

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

const DEFAULT_MAX_DEPTH = 64;

export interface TransformKeysOptions {
  exclude?: readonly string[];
  preserve?: readonly string[];
  maxDepth?: number;
}

interface CompiledPattern {
  segments?: string[];
  key?: string;
}

function compilePatterns(patterns?: readonly string[]): CompiledPattern[] {
  if (!patterns || patterns.length === 0) return [];
  return patterns.map((raw) => {
    if (raw.startsWith("$.")) {
      return { segments: raw.slice(2).split(".") };
    }
    if (raw.includes(".")) {
      return { segments: raw.split(".") };
    }
    return { key: raw };
  });
}

function matchesAny(
  patterns: readonly CompiledPattern[],
  segments: readonly string[],
  key: string,
): boolean {
  for (const pattern of patterns) {
    if (pattern.key !== undefined) {
      if (key === pattern.key) return true;
      continue;
    }
    const target = pattern.segments!;
    if (target.length !== segments.length) continue;
    let matched = true;
    for (let i = 0; i < target.length; i++) {
      if (target[i] !== "*" && target[i] !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Recursively convert the keys of plain objects (including inside arrays). Values are never
 * rewritten; Dates, Blobs, streams, Maps, class instances, etc. pass through untouched.
 * Returns a new structure — the input is never mutated. Throws `TransformError` on key collisions,
 * circular references, or when `depth > maxDepth`.
 */
export function transformKeys(
  value: unknown,
  to: KeyCase,
  cacheOrOptions?: Map<string, string> | TransformKeysOptions,
  cacheArg?: Map<string, string>,
): unknown {
  const options = cacheOrOptions instanceof Map ? undefined : cacheOrOptions;
  const cache = cacheOrOptions instanceof Map ? cacheOrOptions : (cacheArg ?? new Map());
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const exclude = compilePatterns(options?.exclude);
  const preserve = compilePatterns(options?.preserve);
  const active = new Set<object>();
  return walk(value, to, cache, maxDepth, exclude, preserve, active, "$", [], 0);
}

function walk(
  value: unknown,
  to: KeyCase,
  cache: Map<string, string>,
  maxDepth: number,
  exclude: readonly CompiledPattern[],
  preserve: readonly CompiledPattern[],
  active: Set<object>,
  path: string,
  segments: string[],
  depth: number,
): unknown {
  if (Array.isArray(value)) {
    if (depth > maxDepth) {
      throw new TransformError(`Key transform exceeded max depth ${maxDepth} at ${path}`, {
        path,
        keys: [],
      });
    }
    if (active.has(value)) {
      throw new TransformError(`Key transform detected a circular reference at ${path}`, {
        path,
        keys: [],
      });
    }
    active.add(value);
    try {
      return value.map((item, i) =>
        walk(item, to, cache, maxDepth, exclude, preserve, active, `${path}[${i}]`, segments, depth + 1),
      );
    } finally {
      active.delete(value);
    }
  }
  if (!isPlainObject(value)) return value;

  if (depth > maxDepth) {
    throw new TransformError(`Key transform exceeded max depth ${maxDepth} at ${path}`, {
      path,
      keys: [],
    });
  }
  if (active.has(value)) {
    throw new TransformError(`Key transform detected a circular reference at ${path}`, {
      path,
      keys: [],
    });
  }
  active.add(value);
  try {
    const out: Record<string, unknown> = {};
    const origin = new Map<string, string>();
    for (const key of Object.keys(value)) {
      segments.push(key);
      const excluded = exclude.length > 0 && matchesAny(exclude, segments, key);
      const preserved = !excluded && preserve.length > 0 && matchesAny(preserve, segments, key);
      let next: string;
      if (excluded) {
        next = key;
      } else {
        next = cache.get(key)!;
        if (next === undefined) {
          next = convertKey(key, to);
          cache.set(key, next);
        }
      }
      const previous = origin.get(next);
      if (previous !== undefined) {
        segments.pop();
        throw new TransformError(
          `Key transform to ${to} collision at ${path}: "${previous}" and "${key}" both become "${next}"`,
          { path, keys: [previous, key] },
        );
      }
      origin.set(next, key);
      const converted =
        excluded || preserved
          ? value[key]
          : walk(
              value[key],
              to,
              cache,
              maxDepth,
              exclude,
              preserve,
              active,
              `${path}.${key}`,
              segments,
              depth + 1,
            );
      segments.pop();
      if (next === "__proto__") {
        Object.defineProperty(out, next, {
          value: converted,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else {
        out[next] = converted;
      }
    }
    return out;
  } finally {
    active.delete(value);
  }
}
