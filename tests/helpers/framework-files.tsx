import { defineApi } from "@apixa/core";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";

export type Doc = { id: string; name: string; photo?: string | null };

export interface Behavior {
  /** Response for the next request, or undefined for the default. */
  next?: (url: string, init: RequestInit) => Response | Promise<Response>;
}

export interface FilesHarness {
  api: ReturnType<typeof makeApi>["api"];
  requests: string[];
  behavior: Behavior;
}

const enc = (n: number, fill = 5) => new Uint8Array(n).fill(fill);

/** jsdom's Blob has no `arrayBuffer()`/`stream()` (and `Response` rejects it); read bytes by FileReader. */
export const bytesOf = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

async function drain(body: unknown): Promise<number> {
  if (!body) return 0;
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    let n = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) return n;
      n += r.value.byteLength;
    }
  }
  if (body instanceof FormData) {
    let n = 0;
    for (const [, v] of body.entries()) n += typeof v === "string" ? v.length : v.size;
    return n;
  }
  return typeof body === "string" ? body.length : ((body as Blob).size ?? 0);
}

export function makeApi(extra: { resource?: Record<string, unknown> } = {}) {
  const requests: string[] = [];
  const behavior: Behavior = {};
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    requests.push(`${method} ${new URL(url).pathname}`);
    if (behavior.next) {
      const next = behavior.next;
      behavior.next = undefined;
      return next(url, init);
    }
    const signal = init.signal as AbortSignal;
    const path = new URL(url).pathname;
    if (path.endsWith("/file")) {
      let i = 0;
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(c) {
            await new Promise((r) => setTimeout(r, 5));
            if (signal.aborted) return c.error(signal.reason);
            if (i++ < 3) c.enqueue(enc(4));
            else c.close();
          },
        },
        { highWaterMark: 0 },
      );
      signal.addEventListener("abort", () => body.cancel(signal.reason).catch(() => {}), {
        once: true,
      });
      return new Response(body, {
        headers: { "content-length": "12", "content-type": "application/octet-stream" },
      });
    }
    if (method === "GET") return Response.json([{ id: "1", name: "one" }]);
    const n = await drain(init.body);
    return Response.json(
      { id: "2", name: "made", photo: `ref-${n}` },
      { status: method === "POST" ? 201 : 200 },
    );
  }) as unknown as typeof fetch;
  const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://x.dev/v1",
    transport: createFetchTransport(fetchImpl),
    resources: {
      docs: {
        path: "/docs",
        fileFields: { photo: { maxSize: 8, accept: ["image/*"] } },
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          raw: { kind: "read", method: "GET", path: "/:id/raw", responseType: "arrayBuffer" },
          send: { kind: "write", method: "PUT", path: "/send", responseType: "text" },
          ...(extra.resource?.operations as object),
        },
        ...extra.resource,
      },
    },
  });
  return { api, requests, behavior };
}
