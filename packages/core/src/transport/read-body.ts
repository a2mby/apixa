import { isJsonContentType } from "../http/body.js";
import { ParseError } from "../errors/index.js";
import type { ResponseType } from "../types/transport.js";

const RAW_TEXT_PREVIEW_LENGTH = 200;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    const preview =
      text.length > RAW_TEXT_PREVIEW_LENGTH ? `${text.slice(0, RAW_TEXT_PREVIEW_LENGTH)}…` : text;
    throw new ParseError(`Failed to parse response body as JSON: ${preview}`, { cause });
  }
}

export const RESPONSE_TYPES: readonly ResponseType[] = [
  "json",
  "text",
  "blob",
  "arrayBuffer",
  "stream",
];

export function isResponseType(value: unknown): value is ResponseType {
  return typeof value === "string" && (RESPONSE_TYPES as readonly string[]).includes(value);
}

/**
 * Reads a body. `responseType` describes the body of a **successful** response: an error response
 * (non-2xx) is always read by content type, so `HttpError.data` is its JSON or text rather than a
 * `Blob`. An empty (204/205) body is `null` for JSON and `stream`, and an empty value of the
 * requested type for `text`, `blob` and `arrayBuffer`.
 */
export async function readBody(
  response: Response,
  responseType: ResponseType = "json",
): Promise<unknown> {
  const failed = !response.ok;
  if (response.status === 204 || response.status === 205) {
    if (failed) return null;
    if (responseType === "text") return "";
    if (responseType === "blob") return new Blob([]);
    if (responseType === "arrayBuffer") return new ArrayBuffer(0);
    return null;
  }

  if (!failed) {
    if (responseType === "stream") {
      return response.body;
    }
    if (responseType === "blob") {
      return response.blob();
    }
    if (responseType === "arrayBuffer") {
      return response.arrayBuffer();
    }
    if (responseType === "text") {
      return response.text();
    }
  }

  // json (default): prefer content-type, fall back to parse text
  const contentType = response.headers.get("content-type") ?? "";

  if (isJsonContentType(response.headers)) {
    const text = await response.text();
    if (!text) return null;
    return parseJson(text);
  }

  if (contentType.startsWith("text/")) {
    return response.text();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
