/** A parsed `Content-Disposition` header. */
export interface ContentDisposition {
  /** Lower-cased disposition type (`"attachment"`, `"inline"`, `"form-data"`, …); `""` when absent. */
  type: string;
  /** Decoded file name, when the header carries a usable one. Never assumed to exist. */
  filename?: string;
}

const EMPTY: ContentDisposition = Object.freeze({ type: "" });

/** `;`-separated parts, ignoring separators inside quoted strings. */
function splitParts(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (quoted && c === "\\" && i + 1 < value.length) {
      current += c + value[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return trimmed;
}

/** RFC 5987 `charset'language'percent-encoded-value`; `undefined` when it cannot be decoded. */
function decodeExtended(value: string): string | undefined {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value.trim());
  if (!match) return undefined;
  const charset = (match[1] || "utf-8").toLowerCase();
  const encoded = match[2]!;
  if (!/^(?:[A-Za-z0-9!#$&+\-.^_`|~]|%[0-9A-Fa-f]{2})*$/.test(encoded)) return undefined;
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  try {
    return new TextDecoder(charset, { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return undefined;
  }
}

/** Drops directory components and control characters; an empty result is no file name. */
function clean(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  // eslint-disable-next-line no-control-regex
  const base = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()!
    .trim();
  return base === "" || base === "." || base === ".." ? undefined : base;
}

/**
 * Parses a `Content-Disposition` header (RFC 6266). `filename*` (RFC 5987, percent-encoded,
 * UTF-8 or ISO-8859-1) wins over `filename`; quoted strings are unescaped; directory parts and
 * control characters are removed. Never throws: an absent or malformed header yields
 * `{ type: "" }` or a result without `filename`.
 */
export function parseContentDisposition(
  source: Headers | string | null | undefined,
): ContentDisposition {
  const raw = typeof source === "string" ? source : (source?.get("content-disposition") ?? "");
  if (typeof raw !== "string" || raw.trim() === "") return EMPTY;
  try {
    const [head, ...params] = splitParts(raw);
    const type = (head ?? "").trim().toLowerCase();
    let plain: string | undefined;
    let extended: string | undefined;
    for (const part of params) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const name = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1);
      if (name === "filename*") extended ??= decodeExtended(value);
      else if (name === "filename") plain ??= unquote(value);
    }
    const filename = clean(extended) ?? clean(plain);
    return filename === undefined ? { type } : { type, filename };
  } catch {
    return EMPTY;
  }
}
