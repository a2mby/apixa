import type { Transport, TransportRequest, TransportResponse } from "apixa/core";

/** A scripted fault: when `match` accepts a request, `fail` decides what happens (once by default). */
export interface Fault {
  match(request: TransportRequest): boolean;
  /** Throw to fail before the server sees the request. */
  before?(request: TransportRequest): void | Promise<void>;
  /** Run after the server processed the request, before the client sees the response (a lost reply). */
  after?(request: TransportRequest, response: TransportResponse): void | Promise<void>;
  times?: number;
}

/** Wraps a transport with deterministic, stage-addressed faults. No timers, no randomness. */
export function withFaults(inner: Transport, faults: Fault[]): Transport & { hits: number[] } {
  const remaining = faults.map((fault) => fault.times ?? 1);
  const hits = faults.map(() => 0);
  return {
    capabilities: inner.capabilities,
    hits,
    async request(input: TransportRequest): Promise<TransportResponse> {
      const active = faults
        .map((fault, index) => ({ fault, index }))
        .filter(({ fault, index }) => remaining[index]! > 0 && fault.match(input));
      for (const { fault, index } of active) {
        if (!fault.before) continue;
        remaining[index]!--;
        hits[index]!++;
        await fault.before(input);
      }
      const response = await inner.request(input);
      for (const { fault, index } of active) {
        if (!fault.after) continue;
        remaining[index]!--;
        hits[index]!++;
        await fault.after(input, response);
      }
      return response;
    },
  };
}

/** Protocol steps of the shared test protocol, by request shape. */
export const step = {
  initiate: (r: TransportRequest) => r.method === "POST" && r.url.endsWith("/files/sessions"),
  inspect: (r: TransportRequest) => r.method === "GET" && /\/sessions\/\d+$/.test(r.url),
  part: (index?: number) => (r: TransportRequest) =>
    r.method === "PUT" && (index === undefined || r.url.endsWith(`/parts/${index}`)),
  complete: (r: TransportRequest) => r.method === "POST" && r.url.endsWith("/complete"),
  abort: (r: TransportRequest) => r.method === "DELETE",
};
