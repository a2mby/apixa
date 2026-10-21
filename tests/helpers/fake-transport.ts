import type { Transport, TransportRequest, TransportResponse } from "@apixa/core";

export interface FakeResult {
  status?: number;
  body?: unknown;
  headers?: HeadersInit;
}

function rejectionFromSignal(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof DOMException && reason.name === "TimeoutError") {
    return reason;
  }
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function abortRace(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      reject(rejectionFromSignal(signal));
      return;
    }
    signal.addEventListener("abort", () => reject(rejectionFromSignal(signal)), { once: true });
  });
}

export function createFakeTransport(
  handler: (request: TransportRequest) => FakeResult | Promise<FakeResult>,
): Transport {
  return {
    async request(input: TransportRequest): Promise<TransportResponse> {
      const result = await Promise.race([
        Promise.resolve().then(() => handler(input)),
        abortRace(input.signal),
      ]);
      const status = result.status ?? 200;
      const body = result.body ?? null;
      const headers = new Headers(result.headers);

      if (body !== null && body !== undefined && !headers.has("content-type") && status !== 204) {
        headers.set("content-type", "application/json");
      }

      const rawBody =
        status === 204 || body === null || body === undefined
          ? null
          : typeof body === "string"
            ? body
            : JSON.stringify(body);

      const raw = new Response(rawBody, { status, headers });

      return {
        status,
        headers: raw.headers,
        raw,
        body,
      };
    },
  };
}
