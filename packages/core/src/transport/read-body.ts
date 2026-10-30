import { isJsonContentType } from "../http/body.js";
import type { ResponseType } from "../types/transport.js";

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
    return JSON.parse(text) as unknown;
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
