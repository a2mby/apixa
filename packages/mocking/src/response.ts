import type { TransportResponse } from "@apixa/core";

export function mockResponse(status: number, body: unknown = null): TransportResponse {
  const headers = new Headers();
  const hasBody = status !== 204 && body !== null && body !== undefined;

  if (hasBody) {
    headers.set("content-type", "application/json");
  }

  const rawBody = hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : null;

  const raw = new Response(rawBody, { status, headers });

  return {
    status,
    headers: raw.headers,
    raw,
    body: hasBody ? body : null,
  };
}
