import { SerializationError } from "../errors/index.js";
import type { DataFormat } from "../types/definition.js";
import {
  containsBinary,
  isPlainObject,
  MAX_DEPTH,
  serializeMultipart,
  type MultipartRuntime,
} from "./multipart.js";

export function isJsonContentType(headers: Headers): boolean {
  const contentType = (headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("application/json") || contentType.includes("+json");
}

export interface BodyEncoding {
  dataFormat?: DataFormat;
  multipart?: MultipartRuntime;
}

function invalidJson(path: string, what: string, cause?: unknown): never {
  throw new SerializationError(
    `Cannot encode ${what} at ${path} as JSON.`,
    { path },
    cause !== undefined ? { cause } : undefined,
  );
}

/**
 * Validate a non-binary JSON body value before `JSON.stringify` so unsupported values (cycles,
 * excessive depth, `BigInt`, functions, symbols, invalid `Date`, non-finite numbers, class
 * instances / `Map` / `Set`) fail with a field-scoped `SerializationError` instead of being
 * silently dropped or failing with an untyped `TypeError`.
 */
function assertJsonSerializable(value: unknown): void {
  const active = new Set<object>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (node === undefined || node === null) return;
    switch (typeof node) {
      case "string":
      case "boolean":
        return;
      case "number":
        if (!Number.isFinite(node)) invalidJson(path, "a non-finite number");
        return;
      case "bigint":
      case "function":
      case "symbol":
        return invalidJson(path, typeof node);
    }
    if (node instanceof Date) {
      if (Number.isNaN(node.getTime())) invalidJson(path, "an invalid Date");
      return;
    }
    const isArray = Array.isArray(node);
    if (!isArray && !isPlainObject(node)) {
      invalidJson(path, `a ${(node as object).constructor?.name ?? "non-plain"} value`);
    }
    if (depth > MAX_DEPTH) invalidJson(path, "a value nested too deeply");
    if (active.has(node as object)) invalidJson(path, "a circular reference");

    active.add(node as object);
    try {
      if (isArray) {
        for (let i = 0; i < node.length; i++) {
          walk(node[i], `${path}[${i}]`, depth + 1);
        }
      } else {
        for (const [key, child] of Object.entries(node)) {
          if (child !== undefined) walk(child, `${path}.${key}`, depth + 1);
        }
      }
    } finally {
      active.delete(node as object);
    }
  };

  walk(value, "$", 0);
}

/**
 * Encode a request body.
 * - `FormData`: `Content-Type` is cleared so the transport generates the multipart boundary.
 * - `URLSearchParams`, `Blob`, buffers, `ReadableStream`: passed through as-is.
 * - `string`: sent raw with `Content-Type: text/plain` (unless already set); pass
 *   `dataFormat: "json"` to encode it as a JSON string (`"..."`) with `application/json`.
 * - Plain objects / arrays / scalars: serialized as JSON, or multipart when binary values are
 *   present (or `dataFormat: "multipart"`). Throws `SerializationError` on invalid values.
 */
export function serializeBody(
  body: unknown,
  headers: Headers,
  encoding: BodyEncoding = {},
): BodyInit | null | undefined {
  if (body === undefined || body === null) {
    return body as null | undefined;
  }

  if (body instanceof FormData) {
    headers.delete("content-type");
    return body;
  }

  if (typeof body === "string") {
    if (encoding.dataFormat === "multipart") {
      const form = serializeMultipart(body, encoding.multipart);
      headers.delete("content-type");
      return form;
    }
    if (encoding.dataFormat === "json") {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      return JSON.stringify(body);
    }
    if (!headers.has("content-type")) headers.set("content-type", "text/plain");
    return body;
  }

  if (
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  ) {
    return body as BodyInit;
  }

  const binary = containsBinary(body);
  const format = encoding.dataFormat ?? (binary ? "multipart" : "json");
  if (format === "multipart") {
    const form = serializeMultipart(body, encoding.multipart);
    headers.delete("content-type");
    return form;
  }
  if (binary) {
    throw new SerializationError(
      'The request body contains binary values and cannot be sent as JSON (dataFormat: "json"). Remove dataFormat or use "multipart".',
      { path: "$" },
    );
  }

  assertJsonSerializable(body);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  try {
    return JSON.stringify(body);
  } catch (cause) {
    return invalidJson("$", "an unserializable value", cause);
  }
}
