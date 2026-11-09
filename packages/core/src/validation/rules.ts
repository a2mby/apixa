import type { FileLimits, FileRules } from "../types/definition.js";
import { ConfigError } from "../errors/index.js";

/** Resolved, normalized rules of one field (patterns lower-cased and split). */
export interface ResolvedFieldRules {
  /** Wire field name the rules apply to. */
  field: string;
  minSize?: number;
  maxSize?: number;
  min?: number;
  max?: number;
  acceptMime: readonly string[];
  acceptExt: readonly string[];
  rejectMime: readonly string[];
  rejectExt: readonly string[];
  hasAccept: boolean;
  unknownType: "allow" | "reject";
  noExtension: "allow" | "reject";
  strict: boolean;
}

/** Everything one operation validates; `undefined` on the operation means nothing is configured. */
export interface ResolvedFileRules {
  fields: ReadonlyMap<string, ResolvedFieldRules>;
  /** Wire name or multipart part alias → field. */
  partNames: ReadonlyMap<string, string>;
  limits: Readonly<FileLimits>;
}

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/;

/** Lower-case a MIME pattern or `.ext` entry; throws `ConfigError` for anything else. */
export function normalizeAcceptEntry(where: string, entry: unknown): string {
  if (typeof entry !== "string" || entry.trim() === "") {
    throw new ConfigError(`${where} entries must be non-empty strings.`);
  }
  const value = entry.trim().toLowerCase();
  if (value === "*/*" || MIME.test(value)) return value;
  if (/^\.[^./\\\s]+(\.[^./\\\s]+)*$/.test(value)) return value;
  throw new ConfigError(
    `${where} has an invalid entry ${JSON.stringify(entry)}: use a MIME type ("application/pdf"), a wildcard ("image/*") or an extension (".png").`,
  );
}

/** Declared MIME type, lower-cased, parameters stripped (`"Text/Plain; charset=x"` → `"text/plain"`). */
export function baseMime(type: string): string {
  const cut = type.indexOf(";");
  return (cut === -1 ? type : type.slice(0, cut)).trim().toLowerCase();
}

export function mimeMatches(patterns: readonly string[], type: string): boolean {
  if (type === "") return false;
  return patterns.some((pattern) => {
    if (pattern === "*/*") return true;
    if (pattern.endsWith("/*")) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
  });
}

export function extMatches(entries: readonly string[], name: string): boolean {
  const lower = name.toLowerCase();
  return entries.some((entry) => lower.length > entry.length && lower.endsWith(entry));
}

const INT = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Validate one rules object (field rules or limits) shape; `ConfigError` names the path. */
export function assertRules(where: string, rules: Record<string, unknown>): void {
  for (const key of ["minSize", "maxSize", "min", "max"] as const) {
    if (rules[key] !== undefined && !INT(rules[key])) {
      throw new ConfigError(
        `${where}.${key} must be a non-negative integer (got ${String(rules[key])}).`,
      );
    }
  }
  const lowerHigher = [
    ["minSize", "maxSize"],
    ["min", "max"],
  ] as const;
  for (const [low, high] of lowerHigher) {
    const a = rules[low] as number | undefined;
    const b = rules[high] as number | undefined;
    if (a !== undefined && b !== undefined && a > b) {
      throw new ConfigError(`${where}.${low} (${a}) must not exceed ${where}.${high} (${b}).`);
    }
  }
  for (const key of ["accept", "reject"] as const) {
    const list = rules[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length === 0) {
      throw new ConfigError(
        `${where}.${key} must be a non-empty array of MIME types or extensions.`,
      );
    }
    list.forEach((entry, i) => normalizeAcceptEntry(`${where}.${key}[${i}]`, entry));
  }
  for (const key of ["unknownType", "noExtension"] as const) {
    const value = rules[key];
    if (value !== undefined && value !== "allow" && value !== "reject") {
      throw new ConfigError(
        `${where}.${key} must be "allow" or "reject" (got ${JSON.stringify(value)}).`,
      );
    }
  }
  if (rules.filename !== undefined && rules.filename !== "strict") {
    throw new ConfigError(
      `${where}.filename must be "strict" (got ${JSON.stringify(rules.filename)}).`,
    );
  }
}

export function assertLimits(where: string, limits: Record<string, unknown>): void {
  for (const key of ["maxTotalSize", "maxFiles", "maxBodySize"]) {
    if (limits[key] !== undefined && !INT(limits[key])) {
      throw new ConfigError(
        `${where}.${key} must be a non-negative integer (got ${String(limits[key])}).`,
      );
    }
  }
}

const split = (list: readonly string[] | undefined) => {
  const all = (list ?? []).map((e) => normalizeAcceptEntry("accept", e));
  return {
    mime: all.filter((e) => !e.startsWith(".")),
    ext: all.filter((e) => e.startsWith(".")),
    any: all.length > 0,
  };
};

/** Merge resource and operation rules key-wise (a defined operation value, even `0`, wins). */
export function resolveFieldRules(
  field: string,
  layers: ReadonlyArray<FileRules | undefined>,
): ResolvedFieldRules | undefined {
  const merged: FileRules = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined && key !== "name") (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(merged).length === 0) return undefined;
  const accept = split(merged.accept);
  const reject = split(merged.reject);
  return {
    field,
    minSize: merged.minSize,
    maxSize: merged.maxSize,
    min: merged.min,
    max: merged.max,
    acceptMime: accept.mime,
    acceptExt: accept.ext,
    rejectMime: reject.mime,
    rejectExt: reject.ext,
    hasAccept: accept.any,
    unknownType: merged.unknownType ?? (accept.any ? "reject" : "allow"),
    noExtension: merged.noExtension ?? "allow",
    strict: merged.filename === "strict",
  };
}

/** Normalize a response `accept` list. */
export function resolveResponseAccept(
  list: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!list) return undefined;
  return list
    .map((e) => normalizeAcceptEntry("responseAccept", e))
    .filter((e) => !e.startsWith("."));
}
