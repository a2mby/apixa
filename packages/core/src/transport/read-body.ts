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

export async function readBody(
  response: Response,
  responseType: ResponseType = "json",
): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

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
