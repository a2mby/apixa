import { defineApi } from "@apixa/core";
import type { Transport, TransportRequest } from "@apixa/core";

export const file = (size: number, name = "a.png", type = "image/png") =>
  new File([new Uint8Array(size)], name, { type });

type Pet = { id: string; name: string; photo?: string | null; docs?: string[] | null };

export interface Recorded {
  calls: TransportRequest[];
}

/** A transport that records every request and answers `{ id: "1" }`. */
export function recordingTransport(): Transport & Recorded {
  const calls: TransportRequest[] = [];
  return {
    calls,
    async request(input) {
      calls.push(input);
      const raw = new Response(JSON.stringify({ id: "1", name: "x" }), {
        headers: { "content-type": "application/json" },
      });
      return { status: 200, headers: raw.headers, raw, body: { id: "1", name: "x" } };
    },
  };
}

export interface PetClient {
  pets: {
    create(body: unknown, options?: Record<string, unknown>): Promise<unknown>;
    upload(body: unknown, options?: Record<string, unknown>): Promise<unknown>;
    viaCtx(body: unknown): Promise<unknown>;
    getAll(options?: Record<string, unknown>): Promise<unknown>;
  };
}

/**
 * The same resource, live (recording transport) or mocked, so both can be checked against the same
 * fixtures. `resource` and `operation` extend the declaration under test.
 */
export function petApi(
  mode: "live" | "mock",
  config: { resource?: Record<string, unknown>; upload?: Record<string, unknown> } = {},
) {
  const transport = recordingTransport();
  const resource: Record<string, unknown> = {
    path: "/pets",
    fileFields: { photo: {}, docs: {} },
    ...(mode === "mock" ? { mock: [{ id: 1, name: "Seed", photo: null }] } : {}),
    operations: {
      upload: {
        kind: "write",
        method: "POST",
        path: "/upload",
        ...(mode === "mock" ? { mock: () => ({ ok: true }) } : {}),
        ...config.upload,
      },
      viaCtx: {
        kind: "write",
        run: (ctx: { request: (init: object) => Promise<unknown> }, body: unknown) =>
          ctx.request({ method: "POST", path: "/ctx", body }),
      },
    },
    ...config.resource,
  };
  const api = defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
    baseURL: "https://api.example.com",
    transport,
    resources: { pets: resource },
  } as never) as never as PetClient;
  return { api, transport, calls: transport.calls };
}

export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (e: unknown) => e,
  );
}
