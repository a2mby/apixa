import { defineApi } from "@apixa/core";
import type { TransferEvent } from "@apixa/core";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";

export type StubFetch = (url: string, init: RequestInit & { duplex?: string }) => Promise<Response>;

/** Collects every event an `onTransfer` observer receives, in order. */
export function collector() {
  const events: TransferEvent[] = [];
  return {
    events,
    observer: (event: TransferEvent) => {
      events.push(event);
    },
    phases: () => events.map((e) => `${e.direction}:${e.phase}`),
    of: (direction: "upload" | "download") => events.filter((e) => e.direction === direction),
  };
}

export const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

/** A response whose body arrives in the given chunks (one pull each), like a real network body. */
export function chunkedResponse(
  chunks: Uint8Array[],
  init: ResponseInit & { signal?: AbortSignal | null } = {},
): Response {
  let i = 0;
  const { signal, ...rest } = init;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        if (i < chunks.length) controller.enqueue(chunks[i++]!);
        else controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  signal?.addEventListener("abort", () => {
    try {
      stream.cancel(signal.reason).catch(() => {});
    } catch {
      /* already closed */
    }
  });
  return new Response(stream, { status: 200, ...rest });
}

type Doc = { id: string };

export interface TestClient {
  docs: {
    download(options: { params: { id: string } } & Record<string, unknown>): Promise<Blob>;
    buffer(options?: Record<string, unknown>): Promise<ArrayBuffer>;
    text(options?: Record<string, unknown>): Promise<string>;
    json(options?: Record<string, unknown>): Promise<unknown>;
    feed(options?: Record<string, unknown>): Promise<ReadableStream<Uint8Array> | null>;
    upload(body: unknown, options?: Record<string, unknown>): Promise<string>;
    push(body: unknown, options?: Record<string, unknown>): Promise<string>;
  };
}

/** A client whose operations cover every response type, over the real fetch transport + a stub. */
export function transferClient(
  fetchImpl: StubFetch,
  extra: { root?: Record<string, unknown>; operation?: Record<string, unknown> } = {},
): TestClient {
  const op = (path: string, responseType: string, method = "GET", kind = "read") => ({
    kind,
    method,
    path,
    responseType,
    ...extra.operation,
  });
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport: createFetchTransport(fetchImpl as unknown as typeof fetch),
    ...extra.root,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: op("/:id/file", "blob"),
          buffer: op("/buffer", "arrayBuffer"),
          text: op("/text", "text"),
          json: op("/json", "json"),
          feed: op("/feed", "stream"),
          upload: op("/upload", "text", "POST", "write"),
          push: op("/push", "text", "PUT", "write"),
        },
      },
    },
  } as never) as never as TestClient;
}

export async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export async function bodyBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof ReadableStream) return drain(body as ReadableStream<Uint8Array>);
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}
