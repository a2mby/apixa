import { HttpError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { bytes, chunkedResponse, collector, drain, transferClient } from "../helpers/transfer.js";

const parts = [bytes(4, 1), bytes(3, 2), bytes(5, 3)]; // 12 bytes
const ALL = Uint8Array.from([...parts[0]!, ...parts[1]!, ...parts[2]!]);

describe("download progress", () => {
  it("blob: counts bytes, reports a trustworthy total, result bytes equal the unobserved path", async () => {
    const make = () =>
      transferClient(async () =>
        chunkedResponse(parts, {
          headers: { "content-length": "12", "content-type": "image/png" },
        }),
      );
    const c = collector();
    const observed = await make().docs.download({ params: { id: "1" }, onTransfer: c.observer });
    const plain = await make().docs.download({ params: { id: "1" } });
    expect(c.phases()).toEqual([
      "download:start",
      "download:progress",
      "download:progress",
      "download:progress",
      "download:complete",
    ]);
    expect(c.events.map((e) => e.phase !== "unsupported" && e.loaded)).toEqual([0, 4, 7, 12, 12]);
    expect(c.events.every((e) => e.phase === "unsupported" || e.total === 12)).toBe(true);
    expect(observed.type).toBe("image/png");
    expect(new Uint8Array(await observed.arrayBuffer())).toEqual(ALL);
    expect(new Uint8Array(await observed.arrayBuffer())).toEqual(
      new Uint8Array(await plain.arrayBuffer()),
    );
  });

  it("arrayBuffer and text read the same bytes", async () => {
    const c = collector();
    const buf = await transferClient(async () =>
      chunkedResponse(parts, { headers: { "content-length": "12" } }),
    ).docs.buffer({ onTransfer: c.observer });
    expect(new Uint8Array(buf)).toEqual(ALL);
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", loaded: 12, total: 12 });

    const enc = new TextEncoder().encode("héllo wörld");
    const t = collector();
    const text = await transferClient(async () =>
      chunkedResponse([enc.slice(0, 2), enc.slice(2)], {
        headers: { "content-type": "text/plain" },
      }),
    ).docs.text({ onTransfer: t.observer });
    expect(text).toBe("héllo wörld");
    expect(t.events.at(-1)).toMatchObject({ phase: "complete", loaded: enc.byteLength });
  });

  it("json: parses the body and still reports progress", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ ok: true }));
    const c = collector();
    const data = await transferClient(async () =>
      chunkedResponse([body], { headers: { "content-type": "application/json" } }),
    ).docs.json({ onTransfer: c.observer });
    expect(data).toEqual({ ok: true });
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", loaded: body.byteLength });
  });

  it("unknown length: no total, ever", async () => {
    const c = collector();
    await transferClient(async () => chunkedResponse(parts)).docs.download({
      params: { id: "1" },
      onTransfer: c.observer,
    });
    expect(c.events.every((e) => !("total" in e))).toBe(true);
  });

  it.each([
    ["malformed", { "content-length": "twelve" }],
    ["negative", { "content-length": "-3" }],
    ["compressed", { "content-length": "5", "content-encoding": "gzip" }],
  ])("%s length is not trusted", async (_name, headers) => {
    const c = collector();
    await transferClient(async () =>
      chunkedResponse(parts, { headers: headers as Record<string, string> }),
    ).docs.download({ params: { id: "1" }, onTransfer: c.observer });
    expect(c.events.every((e) => !("total" in e))).toBe(true);
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", loaded: 12 });
  });

  it("a body longer than its Content-Length drops the total instead of exceeding it", async () => {
    const c = collector();
    await transferClient(async () =>
      chunkedResponse(parts, { headers: { "content-length": "5" } }),
    ).docs.download({ params: { id: "1" }, onTransfer: c.observer });
    const last = c.events.at(-1)!;
    expect(last).toMatchObject({ phase: "complete", loaded: 12 });
    expect("total" in last).toBe(false);
  });

  it("empty body completes with loaded 0; 204 completes with loaded 0", async () => {
    const e = collector();
    const empty = await transferClient(
      async () => new Response(new Blob([]), { status: 200 }),
    ).docs.download({ params: { id: "1" }, onTransfer: e.observer });
    expect(empty.size).toBe(0);
    expect(e.events.at(-1)).toMatchObject({ phase: "complete", loaded: 0 });

    const n = collector();
    const none = await transferClient(
      async () => new Response(null, { status: 204 }),
    ).docs.download({ params: { id: "1" }, onTransfer: n.observer });
    expect(none.size).toBe(0);
    expect(n.phases()).toEqual(["download:start", "download:complete"]);
  });

  it("stream: counts as the consumer reads and completes only when drained", async () => {
    const c = collector();
    const stream = await transferClient(async () =>
      chunkedResponse(parts, { headers: { "content-length": "12" } }),
    ).docs.feed({ onTransfer: c.observer });
    expect(c.phases()).toEqual(["download:start"]);
    const reader = stream!.getReader();
    await reader.read();
    expect(c.events.at(-1)).toMatchObject({ phase: "progress", loaded: 4, total: 12 });
    const rest = await drain(
      new ReadableStream({
        async pull(ctl) {
          const r = await reader.read();
          if (r.done) ctl.close();
          else ctl.enqueue(r.value);
        },
      }),
    );
    expect(rest.byteLength).toBe(8);
    expect(c.events.at(-1)).toMatchObject({ phase: "complete", loaded: 12, total: 12 });
  });

  it("a failed download emits start then error and still throws HttpError with a readable body", async () => {
    const c = collector();
    const failure = await transferClient(
      async () =>
        new Response(JSON.stringify({ message: "nope" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    )
      .docs.download({ params: { id: "1" }, onTransfer: c.observer })
      .catch((e) => e);
    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).data).toEqual({ message: "nope" });
    expect(c.phases()).toEqual(["download:start", "download:error"]);
    expect(c.events.at(-1)).toMatchObject({ phase: "error", willRetry: false });
  });

  it("without onTransfer nothing is reported and the request carries no observer", async () => {
    let seen: unknown = "unset";
    const transport = {
      async request(input: { onTransfer?: unknown; responseType?: string }) {
        seen = input.onTransfer;
        const raw = new Response(new Blob([bytes(2)]));
        return { status: 200, headers: raw.headers, raw, body: await raw.blob() };
      },
    };
    const { defineApi } = await import("@apixa/core");
    const api = defineApi<{ d: { path: "/d"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: { d: { path: "/d" } },
    } as never) as never as { d: { getById(id: string): Promise<unknown> } };
    await api.d.getById("1");
    expect(seen).toBeUndefined();
  });
});
