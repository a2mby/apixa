export function isJsonContentType(headers: Headers): boolean {
  const contentType = headers.get("content-type") ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

export function serializeBody(body: unknown, headers: Headers): BodyInit | null | undefined {
  if (body === undefined || body === null) {
    return body as null | undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}
