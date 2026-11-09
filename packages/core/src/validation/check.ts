import { MAX_VIOLATIONS } from "../errors/validation-error.js";
import type { FileViolation } from "../types/errors.js";
import { collectFiles, type FoundFile } from "./collect.js";
import {
  baseMime,
  extMatches,
  mimeMatches,
  type ResolvedFieldRules,
  type ResolvedFileRules,
} from "./rules.js";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const RISKY_INNER = new Set([
  "php",
  "phtml",
  "exe",
  "js",
  "mjs",
  "sh",
  "bat",
  "cmd",
  "com",
  "scr",
  "jar",
  "vbs",
  "ps1",
  "html",
  "htm",
  "svg",
]);

/** The first unsafe-name finding, as a rule label (never the name itself). */
export function unsafeFilename(name: string): string | undefined {
  if (name === "." || name === "..") return "dot-name";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return "control-character";
  if (/[/\\]/.test(name)) return "separator";
  if (name.length > 255) return "length";
  if (/[. ]$/.test(name)) return "trailing-dot-or-space";
  if (RESERVED.test(name.replace(/\..*$/, ""))) return "reserved-name";
  const parts = name.toLowerCase().split(".");
  if (parts.length > 2 && parts.slice(1, -1).some((p) => RISKY_INNER.has(p)))
    return "double-extension";
  return undefined;
}

function checkFile(file: FoundFile, rules: ResolvedFieldRules, out: FileViolation[]): void {
  const { path } = file;
  if (file.size !== undefined) {
    if (rules.maxSize !== undefined && file.size > rules.maxSize) {
      out.push({ code: "FILE_TOO_LARGE", path, limit: rules.maxSize, actual: file.size });
    }
    if (rules.minSize !== undefined && file.size < rules.minSize) {
      out.push({ code: "FILE_TOO_SMALL", path, limit: rules.minSize, actual: file.size });
    }
  }
  const type = baseMime(file.type);
  const ext = extMatches;
  if (rules.rejectMime.length + rules.rejectExt.length > 0) {
    if (mimeMatches(rules.rejectMime, type))
      out.push({ code: "TYPE_NOT_ALLOWED", path, rule: "reject" });
    else if (ext(rules.rejectExt, file.name))
      out.push({ code: "EXTENSION_NOT_ALLOWED", path, rule: "reject" });
  }
  if (rules.hasAccept) {
    const matched = mimeMatches(rules.acceptMime, type) || ext(rules.acceptExt, file.name);
    if (!matched) {
      if (type === "") {
        if (rules.unknownType === "reject")
          out.push({ code: "TYPE_NOT_ALLOWED", path, rule: "unknown-type" });
      } else if (rules.acceptMime.length > 0) {
        out.push({ code: "TYPE_NOT_ALLOWED", path, rule: "accept" });
      } else {
        out.push({ code: "EXTENSION_NOT_ALLOWED", path, rule: "accept" });
      }
    }
  }
  if (rules.noExtension === "reject" && !/\.[^./\\]+$/.test(file.name.replace(/^\./, ""))) {
    out.push({ code: "EXTENSION_NOT_ALLOWED", path, rule: "no-extension" });
  }
  if (rules.strict) {
    const rule = unsafeFilename(file.name);
    if (rule) out.push({ code: "UNSAFE_FILENAME", path, rule });
  }
}

/**
 * Evaluate a request body against resolved rules. Reads metadata only. Returns every violation
 * (the caller caps the list); an empty array means nothing configured was broken.
 */
export function validateRequestFiles(body: unknown, rules: ResolvedFileRules): FileViolation[] {
  const found = collectFiles(body, rules.partNames);
  const out: FileViolation[] = [];
  const byField = new Map<string, FoundFile[]>();
  for (const file of found.files) {
    const list = byField.get(file.field) ?? [];
    list.push(file);
    byField.set(file.field, list);
    const fieldRules = rules.fields.get(file.field);
    if (fieldRules) checkFile(file, fieldRules, out);
  }
  for (const [field, fieldRules] of rules.fields) {
    const files = byField.get(field) ?? [];
    if (fieldRules.min !== undefined && found.present.has(field) && files.length < fieldRules.min) {
      out.push({
        code: "TOO_FEW_FILES",
        path: `$.${field}`,
        limit: fieldRules.min,
        actual: files.length,
      });
    }
    if (fieldRules.max !== undefined && files.length > fieldRules.max) {
      out.push({
        code: "TOO_MANY_FILES",
        path: `$.${field}`,
        limit: fieldRules.max,
        actual: files.length,
      });
    }
  }
  const { maxFiles, maxTotalSize, maxBodySize } = rules.limits;
  if (maxFiles !== undefined && found.files.length > maxFiles) {
    out.push({ code: "TOO_MANY_FILES", path: "$", limit: maxFiles, actual: found.files.length });
  }
  if (maxTotalSize !== undefined) {
    const total = found.files.reduce((n, f) => n + (f.size ?? 0), 0) + (found.rawSize ?? 0);
    if (total > maxTotalSize)
      out.push({ code: "TOTAL_TOO_LARGE", path: "$", limit: maxTotalSize, actual: total });
  }
  if (maxBodySize !== undefined && found.rawSize !== undefined && found.rawSize > maxBodySize) {
    out.push({ code: "BODY_TOO_LARGE", path: "$", limit: maxBodySize, actual: found.rawSize });
  }
  return out.slice(0, MAX_VIOLATIONS + 1);
}

/** Byte limit for a raw stream body: the smaller of `maxBodySize` and `maxTotalSize`. */
export function streamLimit(
  rules: ResolvedFileRules,
): { limit: number; code: "BODY_TOO_LARGE" | "TOTAL_TOO_LARGE" } | undefined {
  const { maxBodySize, maxTotalSize } = rules.limits;
  if (maxBodySize === undefined && maxTotalSize === undefined) return undefined;
  if (maxTotalSize === undefined || (maxBodySize !== undefined && maxBodySize <= maxTotalSize)) {
    return { limit: maxBodySize!, code: "BODY_TOO_LARGE" };
  }
  return { limit: maxTotalSize, code: "TOTAL_TOO_LARGE" };
}
