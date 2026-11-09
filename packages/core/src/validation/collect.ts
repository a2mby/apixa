import { MAX_DEPTH, isBlob, isPlainObject } from "../http/multipart.js";

/** One file found in a request body: where it is, which field owns it and its metadata. */
export interface FoundFile {
  /** Location like `$.gallery[2]`; built from keys and indices, never from file names. */
  path: string;
  /** Wire field (top-level key, after leading array indices) or multipart part name. */
  field: string;
  size: number | undefined;
  /** Declared `File.type` (caller-controlled, lower-cased by the runtime). */
  type: string;
  /** `File.name`; a plain `Blob` is sent as `blob`. */
  name: string;
}

export interface Collected {
  files: FoundFile[];
  /** Top-level fields present in the body (not `undefined`/`null`), for `min` checks. */
  present: Set<string>;
  /** Size of a raw body (`Blob`, buffer, string) that is not a field; `undefined` for none. */
  rawSize?: number;
  /** A raw `ReadableStream` body: unknown size, counted while it flows. */
  stream: boolean;
}

const describe = (blob: Blob) => ({
  size: typeof blob.size === "number" && Number.isFinite(blob.size) ? blob.size : undefined,
  type: typeof blob.type === "string" ? blob.type : "",
  name: typeof File !== "undefined" && blob instanceof File ? blob.name : "blob",
});

const utf8Size = (text: string) => new TextEncoder().encode(text).byteLength;

/**
 * Find every file in a request body, reading metadata only. Plain objects and arrays are walked to a
 * bounded depth (cycles are safe); caller-built `FormData` is read by entry; a raw `Blob`, buffer,
 * string or stream is described as a raw body. JSON-like values contribute nothing.
 */
export function collectFiles(body: unknown, partNames: ReadonlyMap<string, string>): Collected {
  const out: Collected = { files: [], present: new Set(), stream: false };
  if (body === undefined || body === null) return out;

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const seen = new Map<string, number>();
    for (const [key, value] of body.entries()) {
      const field = partNames.get(key.replace(/\[.*$/, "")) ?? key.replace(/\[.*$/, "");
      out.present.add(field);
      if (!isBlob(value)) continue;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      out.files.push({ path: `$.${key}${n > 0 ? `[${n}]` : ""}`, field, ...describe(value) });
    }
    return out;
  }
  if (isBlob(body)) {
    out.rawSize = describe(body).size;
    return out;
  }
  if (body instanceof ArrayBuffer) {
    out.rawSize = body.byteLength;
    return out;
  }
  if (ArrayBuffer.isView(body)) {
    out.rawSize = body.byteLength;
    return out;
  }
  if (typeof body === "string") {
    out.rawSize = utf8Size(body);
    return out;
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    out.rawSize = utf8Size(body.toString());
    return out;
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    out.stream = true;
    return out;
  }

  const seen = new Set<object>();
  const walk = (node: unknown, path: string, field: string | undefined, depth: number): void => {
    if (isBlob(node)) {
      out.files.push({ path, field: field ?? "", ...describe(node) });
      return;
    }
    if (node === null || typeof node !== "object" || depth > MAX_DEPTH || seen.has(node)) return;
    const isArray = Array.isArray(node);
    if (!isArray && !isPlainObject(node)) return;
    seen.add(node);
    if (isArray) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, field, depth + 1));
    } else {
      for (const [key, value] of Object.entries(node)) {
        // The owning field is the first object key below the root (leading array indices skipped).
        const owner = field ?? key;
        if (field === undefined && value !== undefined && value !== null) out.present.add(key);
        walk(value, `${path}.${key}`, owner, depth + 1);
      }
    }
  };
  walk(body, "$", undefined, 0);
  return out;
}
