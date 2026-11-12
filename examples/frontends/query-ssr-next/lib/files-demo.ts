import { createFetchTransport, defineApi } from "@apixa/core";

export type StoredFile = { id: string; name: string; photo?: string | null };

/** Bytes the demo "server" sends for `GET /files/1/file`. */
export const DOWNLOAD_SIZE = 10_000;
const CHUNK = 2_000;

function record(method: string, url: string): void {
  // Test hook (browser checks): records each request when a page installs `__apixaRequests`.
  const u = new URL(url);
  (globalThis as { __apixaRequests?: string[] }).__apixaRequests?.push(`${method} ${u.pathname}`);
}

/** Read a request body completely, like a server would (stream, Blob, FormData or nothing). */
async function drain(body: BodyInit | null | undefined): Promise<number> {
  if (!body) return 0;
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return n;
      n += value.byteLength;
      await new Promise((r) => setTimeout(r, 15)); // a slow link: progress is observable
    }
  }
  return new Response(body).arrayBuffer().then((b) => b.byteLength);
}

/**
 * A deterministic local `fetch`: no server or network. It answers like a real one (headers, a
 * chunked body that ends when the request is aborted, a request body it must read), so Apixa's
 * fetch transport reports real counted progress and honors cancellation.
 */
const localFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  record(method, url);
  const path = new URL(url).pathname;
  if (path === "/files/1/file") {
    const signal = init?.signal;
    let sent = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          await new Promise((r) => setTimeout(r, 40));
          if (signal?.aborted) return controller.error(signal.reason);
          if (sent >= DOWNLOAD_SIZE) return controller.close();
          controller.enqueue(new Uint8Array(CHUNK).fill(7));
          sent += CHUNK;
        },
      },
      { highWaterMark: 0 },
    );
    signal?.addEventListener("abort", () => body.cancel(signal.reason).catch(() => {}), { once: true });
    return new Response(body, {
      headers: { "content-type": "application/octet-stream", "content-length": String(DOWNLOAD_SIZE) },
    });
  }
  const received = await drain(init?.body as BodyInit | null | undefined);
  if (path === "/files/send") return new Response(`received ${received} bytes`);
  if (method === "POST") {
    return Response.json({ id: "2", name: "uploaded", photo: `ref-${received}` }, { status: 201 });
  }
  return Response.json([{ id: "1", name: "report.bin" }] satisfies StoredFile[]);
}) as typeof fetch;

export const filesApi = defineApi<{ files: { path: "/files"; entity: StoredFile } }>()({
  baseURL: "https://example.test",
  transport: createFetchTransport(localFetch),
  resources: {
    files: {
      path: "/files",
      // Opt-in client-side rules: fast local feedback, not security (the backend validates again).
      fileFields: { photo: { maxSize: 1024, accept: ["image/*"] } },
      operations: {
        // A download is an ordinary operation: `responseType` types the result as `Blob`.
        download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
        // Sends a stream or a Blob; the response is plain text.
        send: { kind: "write", method: "PUT", path: "/send", responseType: "text" },
      },
    },
  },
});
