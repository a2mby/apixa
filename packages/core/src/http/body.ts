import { SerializationError } from "../errors/index.js";
import type { DataFormat } from "../types/definition.js";
import { containsBinary, serializeMultipart, type MultipartRuntime } from "./multipart.js";

export function isJsonContentType(headers: Headers): boolean {
  const contentType = headers.get("content-type") ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

export interface BodyEncoding {
  dataFormat?: DataFormat;
  multipart?: MultipartRuntime;
}

/**
 * Encode a request body. Caller-built bodies (`FormData`, `Blob`, strings, buffers, streams) are
 * sent as is; plain objects / arrays become JSON, or multipart when they hold binary values (or
 * `dataFormat: "multipart"`). Binary values are never JSON-stringified. For multipart the
 * `Content-Type` header is removed so the transport can generate the boundary.
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

  if (
    typeof body === "string" ||
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

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}
