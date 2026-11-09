import http from "node:http";
import { defineApi, type TransferEvent } from "@apixa/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import {
  bodyBytes,
  bytes,
  collector,
  transferClient,
  type StubFetch,
} from "../helpers/transfer.js";

/** Records what reached the "network": body bytes, headers, duplex. */
function recorder() {
  const calls: Array<{
    body: Uint8Array;
    headers: Headers;
    duplex?: string;
    bodyKind: string;
  }> = [];
  const fetchImpl: StubFetch = async (_url, init) => {
    calls.push({
      body: await bodyBytes(init.body),
      headers: new Headers(init.headers),
      duplex: init.duplex,
      bodyKind: init.body instanceof ReadableStream ? "stream" : typeof init.body,
    });
    return new Response("ok");
  };
  return { calls, fetchImpl };
}

describe("upload progress", () => {
  it("Blob: start, progress, complete with a known total; same bytes and headers on the wire", async () => {
    const blob = new Blob([bytes(5000, 9)], { type: "application/pdf" });
    const plain = recorder();
    await transferClient(plain.fetchImpl).docs.upload(blob);
    const watched = recorder();
    const c = collector();
    await transferClient(watched.fetchImpl).docs.upload(blob, { onTransfer: c.observer });

    const up = c.of("upload");
    expect(up[0]).toMatchObject({ phase: "start", loaded: 0, total: 5000 });
    expect(up.at(-1)).toMatchObject({ phase: "complete", loaded: 5000, total: 5000 });
    expect(up.every((e) => e.phase === "unsupported" || e.total === 5000)).toBe(true);
    expect(watched.calls[0]!.body).toEqual(plain.calls[0]!.body);
    expect(watched.calls[0]!.headers.get("content-length")).toBe("5000");
    expect(watched.calls[0]!.headers.get("content-type")).toBe("application/pdf");
    expect(watched.calls[0]!.duplex).toBe("half");
    expect(plain.calls[0]!.duplex).toBeUndefined();
    expect(plain.calls[0]!.bodyKind).toBe("object");
  });

  it("typed arrays, ArrayBuffer and strings are observed with exact totals", async () => {
    for (const [body, size] of [
      [bytes(10), 10],
      [bytes(6).buffer, 6],
      ["héllo", 6],
    ] as const) {
      const r = recorder();
      const c = collector();
      await transferClient(r.fetchImpl).docs.upload(body, { onTransfer: c.observer });
      expect(c.of("upload").at(-1), String(size)).toMatchObject({
        phase: "complete",
        loaded: size,
        total: size,
      });
      expect(r.calls[0]!.body.byteLength).toBe(size);
    }
    const r = recorder();
    await transferClient(r.fetchImpl).docs.upload("héllo", { onTransfer: () => {} });
    expect(r.calls[0]!.headers.get("content-type")).toMatch(/^text\/plain/);
  });

  it("an explicit Content-Type header is kept", async () => {
    const r = recorder();
    await transferClient(r.fetchImpl).docs.upload(new Blob([bytes(3)], { type: "a/b" }), {
      onTransfer: () => {},
      headers: { "content-type": "application/x-custom" },
    });
    expect(r.calls[0]!.headers.get("content-type")).toBe("application/x-custom");
  });

  it("a ReadableStream body is counted with an unknown total and sent half-duplex", async () => {
    const make = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes(3, 1));
          c.enqueue(bytes(2, 2));
          c.close();
        },
      });
    const r = recorder();
    const c = collector();
    await transferClient(r.fetchImpl).docs.upload(make(), { onTransfer: c.observer });
    expect(c.of("upload").map((e) => e.phase)).toEqual([
      "start",
      "progress",
      "progress",
      "complete",
    ]);
    expect(c.of("upload").every((e) => !("total" in e))).toBe(true);
    expect(c.of("upload").at(-1)).toMatchObject({ loaded: 5 });
    expect(Array.from(r.calls[0]!.body)).toEqual([1, 1, 1, 2, 2]);
    expect(r.calls[0]!.duplex).toBe("half");

    // Unobserved stream bodies also need duplex (the v1.2.0 gap).
    const plain = recorder();
    await transferClient(plain.fetchImpl).docs.upload(make());
    expect(plain.calls[0]!.duplex).toBe("half");
  });

  it("FormData: observed bytes equal the unobserved multipart body (boundary preserved)", async () => {
    const form = () => {
      const f = new FormData();
      f.append("name", "report");
      f.append("file", new Blob([bytes(300, 4)], { type: "application/octet-stream" }), "a.bin");
      return f;
    };
    const watched = recorder();
    const c = collector();
    await transferClient(watched.fetchImpl).docs.upload(form(), { onTransfer: c.observer });
    const type = watched.calls[0]!.headers.get("content-type")!;
    const boundary = /boundary=(.+)$/.exec(type)![1]!;
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    const text = new TextDecoder().decode(watched.calls[0]!.body);
    expect(text.startsWith(`--${boundary}`)).toBe(true);
    expect(text.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    const total = watched.calls[0]!.body.byteLength;
    expect(watched.calls[0]!.headers.get("content-length")).toBe(String(total));
    expect(c.of("upload").at(-1)).toMatchObject({ phase: "complete", loaded: total, total });
  });

  it("a body that cannot be observed without changing the wire is reported unsupported, not faked", async () => {
    // A runtime that forbids Content-Length (browser-like): sized bodies are sent untouched.
    const Original = globalThis.Request;
    class BrowserRequest extends Original {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        const headers = new Headers(init?.headers);
        headers.delete("content-length");
        super(input, { ...init, headers });
      }
    }
    globalThis.Request = BrowserRequest as typeof Request;
    try {
      const r = recorder();
      const c = collector();
      const blob = new Blob([bytes(50)]);
      await transferClient(r.fetchImpl).docs.upload(blob, { onTransfer: c.observer });
      expect(c.of("upload")).toEqual([
        expect.objectContaining({ phase: "unsupported", direction: "upload", attempt: 0 }),
      ]);
      expect(r.calls[0]!.bodyKind).toBe("object"); // the Blob itself, untouched
      expect(r.calls[0]!.duplex).toBeUndefined();
      expect(r.calls[0]!.headers.has("content-length")).toBe(false);
      // Download is still observable.
      expect(c.of("download").length).toBeGreaterThan(0);
    } finally {
      globalThis.Request = Original;
    }
  });

  it("no body means no upload events", async () => {
    const c = collector();
    await transferClient(async () => new Response("x")).docs.text({ onTransfer: c.observer });
    expect(c.of("upload")).toEqual([]);
  });

  it("an abort mid-upload ends the upload with abort and rejects with AbortError", async () => {
    const controller = new AbortController();
    const c = collector();
    const fetchImpl: StubFetch = async (_u, init) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      controller.abort();
      if (init.signal!.aborted) throw init.signal!.reason;
      await new Promise((_r, reject) =>
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
      );
      return new Response("never");
    };
    const body = new ReadableStream<Uint8Array>({
      pull(ctl) {
        ctl.enqueue(bytes(4));
      },
    });
    const error = await transferClient(fetchImpl)
      .docs.upload(body, { signal: controller.signal, onTransfer: c.observer })
      .catch((e) => e);
    expect(error.name).toBe("AbortError");
    expect(c.of("upload").at(-1)).toMatchObject({ phase: "abort", loaded: 4 });
  });
});

describe("upload over a real socket (loopback)", () => {
  let server: http.Server;
  let url = "";
  const seen: Array<{ cl?: string; te?: string; ct?: string; body: Buffer }> = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (d) => chunks.push(d));
      req.on("end", () => {
        seen.push({
          cl: req.headers["content-length"],
          te: req.headers["transfer-encoding"],
          ct: req.headers["content-type"],
          body: Buffer.concat(chunks),
        });
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const api = () =>
    defineApi<{ docs: { path: "/docs"; entity: { id: string } } }>()({
      baseURL: url,
      transport: createFetchTransport(),
      resources: {
        docs: {
          path: "/docs",
          operations: {
            upload: { kind: "write", method: "POST", path: "/up", responseType: "text" },
          },
        },
      },
    } as never) as never as { docs: { upload(b: unknown, o?: object): Promise<string> } };

  it("observing a Blob keeps Content-Length and the exact bytes; multipart keeps its boundary", async () => {
    const blob = new Blob([bytes(70_000, 5)], { type: "application/octet-stream" });
    await api().docs.upload(blob);
    const c = collector();
    await api().docs.upload(blob, { onTransfer: c.observer });
    const [plain, watched] = seen.slice(-2);
    expect(watched!.cl).toBe(plain!.cl);
    expect(watched!.te).toBeUndefined();
    expect(watched!.ct).toBe(plain!.ct);
    expect(watched!.body.equals(plain!.body)).toBe(true);
    expect(c.of("upload").at(-1)).toMatchObject({
      phase: "complete",
      loaded: 70_000,
      total: 70_000,
    });

    const form = () => {
      const f = new FormData();
      f.append("file", new Blob([bytes(5000, 8)]), "x.bin");
      return f;
    };
    await api().docs.upload(form());
    await api().docs.upload(form(), { onTransfer: () => {} });
    const [pf, wf] = seen.slice(-2);
    expect(wf!.cl).toBe(pf!.cl);
    expect(wf!.ct).toMatch(/^multipart\/form-data; boundary=/);
    expect(wf!.body.length).toBe(pf!.body.length);
  });

  it("a large streamed body is not buffered: the source is never read far ahead of the socket", async () => {
    const CHUNK = 1024 * 1024;
    const TOTAL = 48;
    let generated = 0;
    let maxAhead = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(ctl) {
          if (generated >= TOTAL) return ctl.close();
          generated++;
          ctl.enqueue(new Uint8Array(CHUNK));
        },
      },
      { highWaterMark: 0 },
    );
    const before = seen.length;
    const received = () => (seen[before] ? Math.floor(seen[before]!.body.length / CHUNK) : 0);
    await api().docs.upload(body, {
      onTransfer: (e: TransferEvent) => {
        if (e.phase === "progress" && e.direction === "upload")
          maxAhead = Math.max(maxAhead, generated - e.loaded / CHUNK);
      },
    });
    expect(seen[before]!.body.length).toBe(TOTAL * CHUNK);
    expect(received()).toBe(TOTAL);
    // 48 MiB moved while the source stayed within a few chunks of what had been consumed.
    expect(maxAhead).toBeLessThanOrEqual(4);
  });

  it("a streamed body really reaches the server (chunked)", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(bytes(10, 1));
        ctl.enqueue(bytes(10, 2));
        ctl.close();
      },
    });
    const c = collector();
    await api().docs.upload(body, { onTransfer: c.observer });
    const last = seen.at(-1)!;
    expect(last.te).toBe("chunked");
    expect(last.body.length).toBe(20);
    expect(c.of("upload").at(-1)).toMatchObject({ phase: "complete", loaded: 20 });
  });
});
