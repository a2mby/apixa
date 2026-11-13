import { defineApi, ParseError, type ApiResponse } from "@apixa/core";
import { createFetchTransport } from "../../packages/core/src/transport/fetch.js";
import { describe, expect, it } from "vitest";

// Batch 0: characterization of the pre-existing `responseType` behavior, through the real fetch
// transport over a stubbed `fetch` that returns genuine `Response` objects.

const BYTES = new Uint8Array([0, 255, 128, 10, 13, 0xc3, 0x28]); // not valid UTF-8

function respond(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}) {
  const calls: Request[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push(new Request(input as string, options));
    return new Response(init.body ?? null, { status: init.status ?? 200, headers: init.headers });
  }) as typeof fetch;
  return { transport: createFetchTransport(fetchImpl), calls };
}

type Doc = { id: string; fileName: string };
function makeApi(init: Parameters<typeof respond>[0], transforms = {}) {
  const { transport, calls } = respond(init);
  const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport,
    resources: {
      docs: {
        path: "/docs",
        transforms,
        operations: {
          raw: { method: "GET", path: "/:id/raw", responseType: "auto" },
        },
      },
    },
  });
  return { api, calls };
}

describe("responseType (per call), existing behavior", () => {
  it("blob: byte-exact, keeps the content type", async () => {
    const { api } = makeApi({ body: BYTES, headers: { "content-type": "application/pdf" } });
    const out = await api.docs.getById("1", { responseType: "blob" });
    expect(out).toBeInstanceOf(Blob);
    expect(out.type).toBe("application/pdf");
    expect(new Uint8Array(await out.arrayBuffer())).toEqual(BYTES);
  });

  it("arrayBuffer: byte-exact", async () => {
    const { api } = makeApi({ body: BYTES });
    const out = (await api.docs.getById("1", { responseType: "arrayBuffer" })) as unknown;
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(out as ArrayBuffer)).toEqual(BYTES);
  });

  it("text: never JSON-parsed", async () => {
    const { api } = makeApi({ body: '{"a":1}', headers: { "content-type": "application/json" } });
    expect(await api.docs.getById("1", { responseType: "text" })).toBe('{"a":1}');
  });

  it("stream: the response body stream", async () => {
    const { api } = makeApi({ body: BYTES });
    const out = (await api.docs.getById("1", { responseType: "stream" })) as unknown;
    expect(out).toBeInstanceOf(ReadableStream);
    const read = await new Response(out as ReadableStream).arrayBuffer();
    expect(new Uint8Array(read)).toEqual(BYTES);
  });

  it("json default is strict; auto negotiates text/* and JSON-looking fallbacks", async () => {
    const a = makeApi({ body: '{"id":"1"}', headers: { "content-type": "application/json" } });
    expect(await a.api.docs.getById("1")).toEqual({ id: "1" });
    const b = makeApi({ body: "plain", headers: { "content-type": "text/plain" } });
    await expect(b.api.docs.getById("1")).rejects.toBeInstanceOf(ParseError);
    expect(await b.api.docs.raw({ params: { id: "1" } })).toBe("plain");
    const c = makeApi({
      body: '{"id":"2"}',
      headers: { "content-type": "application/octet-stream" },
    });
    await expect(c.api.docs.getById("1")).rejects.toBeInstanceOf(ParseError);
    expect(await c.api.docs.raw({ params: { id: "1" } })).toEqual({ id: "2" });
    const d = makeApi({
      body: "not json",
      headers: { "content-type": "application/octet-stream" },
    });
    expect(await d.api.docs.raw({ params: { id: "1" } })).toBe("not json");
  });

  it("default JSON 204 is null", async () => {
    const { api } = makeApi({ status: 204 });
    expect(await api.docs.getById("1")).toBeNull();
  });

  it("full: true exposes status, headers and the raw response for binary data", async () => {
    const { api } = makeApi({
      body: BYTES,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(BYTES.length),
        "content-disposition": 'attachment; filename="a.pdf"',
      },
    });
    const res = (await api.docs.getById("1", {
      responseType: "blob",
      full: true,
    })) as unknown as ApiResponse<Blob>;
    expect(res.status).toBe(200);
    expect(res.data).toBeInstanceOf(Blob);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(BYTES.length));
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="a.pdf"');
    expect(res.raw).toBeInstanceOf(Response);
  });

  it("response key transforms leave Blob and ArrayBuffer untouched", async () => {
    const t = { response: { keys: "camelCase" } };
    const blob = makeApi({ body: BYTES }, t);
    const out = (await blob.api.docs.getById("1", { responseType: "blob" })) as unknown;
    expect(out).toBeInstanceOf(Blob);
    const buf = makeApi({ body: BYTES }, t);
    expect(await buf.api.docs.getById("1", { responseType: "arrayBuffer" })).toBeInstanceOf(
      ArrayBuffer,
    );
    const json = makeApi(
      { body: '{"file_name":"a"}', headers: { "content-type": "application/json" } },
      t,
    );
    expect(await json.api.docs.getById("1")).toEqual({ fileName: "a" });
  });

  it("ctx.request forwards responseType to the transport", async () => {
    const { transport } = respond({ body: BYTES });
    const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        docs: {
          path: "/docs",
          operations: {
            file: {
              kind: "read",
              run: (ctx, id: string) =>
                ctx.request<Blob>({ path: `/${id}/file`, responseType: "blob" }),
            },
          },
        },
      },
    });
    expect(await api.docs.file("1")).toBeInstanceOf(Blob);
  });
});

// ---- v1.2.0 (batch 2): operation-level responseType, validation, empty and error bodies ----

import { ConfigError, HttpError } from "@apixa/core";

function build(init: Parameters<typeof respond>[0], resource: Record<string, unknown> = {}) {
  const { transport, calls } = respond(init);
  const api = defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport,
    resources: {
      docs: {
        path: "/docs",
        operations: {
          download: { kind: "read", method: "GET", path: "/:id/file", responseType: "blob" },
          raw: { kind: "read", method: "GET", path: "/:id/raw", responseType: "arrayBuffer" },
          note: { kind: "read", method: "GET", path: "/:id/note", responseType: "text" },
          tail: { kind: "read", method: "GET", path: "/:id/tail", responseType: "stream" },
          report: { kind: "write", method: "POST", path: "/report", responseType: "blob" },
        },
        ...resource,
      },
    },
  });
  return { api, calls };
}

describe("operation-level responseType", () => {
  it("a declarative operation reads its body with its own responseType", async () => {
    const { api, calls } = build({ body: BYTES, headers: { "content-type": "application/pdf" } });
    const blob = await api.docs.download({ params: { id: "1" } });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES);
    expect(new URL(calls[0]!.url).pathname).toBe("/docs/1/file");
    expect(
      await (
        await build({ body: BYTES }).api.docs.raw({ params: { id: "1" } })
      ).byteLength,
    ).toBe(BYTES.length);
    expect(await build({ body: "hi" }).api.docs.note({ params: { id: "1" } })).toBe("hi");
    expect(await build({ body: BYTES }).api.docs.tail({ params: { id: "1" } })).toBeInstanceOf(
      ReadableStream,
    );
  });

  it("works for write operations and overrides of builtins", async () => {
    const { api, calls } = build({ body: BYTES });
    expect(await api.docs.report({ any: "body" })).toBeInstanceOf(Blob);
    expect(calls[0]!.method).toBe("POST");
    const override = build({ body: BYTES }, { operations: { getById: { responseType: "blob" } } });
    expect(await override.api.docs.getById("1")).toBeInstanceOf(Blob);
  });

  it("a per-call responseType wins over the operation's", async () => {
    const { api } = build({ body: "plain" });
    expect(await api.docs.download({ ...{ responseType: "text" }, params: { id: "1" } })).toBe(
      "plain",
    );
  });

  it("no responseType: JSON behavior is unchanged", async () => {
    const { api } = build({ body: '{"id":"1"}', headers: { "content-type": "application/json" } });
    expect(await api.docs.getById("1")).toEqual({ id: "1" });
  });

  it("rejects an unknown responseType in the config and per call", async () => {
    const make = (responseType: unknown) => () =>
      defineApi({
        baseURL: "https://api.example.com",
        resources: {
          docs: {
            path: "/docs",
            operations: { x: { kind: "read", method: "GET", responseType } },
          },
        },
      } as never);
    expect(make("xml")).toThrow(ConfigError);
    expect(make("xml")).toThrow(/responseType/);
    expect(make(1)).toThrow(ConfigError);
    const { api, calls } = build({ body: "{}" });
    await expect(api.docs.getById("1", { responseType: "xml" as never })).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("empty (204/205) bodies", () => {
  it.each([204, 205])(
    "%i: explicit text/blob/arrayBuffer give an empty typed value",
    async (status) => {
      const { api } = build({ status });
      expect(await api.docs.note({ params: { id: "1" } })).toBe("");
      const blob = await api.docs.download({ params: { id: "1" } });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(0);
      const buffer = await api.docs.raw({ params: { id: "1" } });
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(0);
      expect(await api.docs.tail({ params: { id: "1" } })).toBeNull();
      expect(await api.docs.getById("1")).toBeNull(); // default JSON stays null
    },
  );
});

describe("failed downloads", () => {
  it("parse the error body by content type, not as the requested binary type", async () => {
    const json = build({
      status: 404,
      body: '{"message":"gone"}',
      headers: { "content-type": "application/json" },
    });
    const error = await json.api.docs.download({ params: { id: "1" } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
    expect((error as HttpError).data).toEqual({ message: "gone" });

    const text = build({ status: 500, body: "boom", headers: { "content-type": "text/plain" } });
    expect(
      ((await text.api.docs.raw({ params: { id: "1" } }).catch((e: unknown) => e)) as HttpError)
        .data,
    ).toBe("boom");

    const stream = build({
      status: 400,
      body: '{"a":1}',
      headers: { "content-type": "application/json" },
    });
    expect(
      ((await stream.api.docs.tail({ params: { id: "1" } }).catch((e: unknown) => e)) as HttpError)
        .data,
    ).toEqual({
      a: 1,
    });
  });
});

describe("binary data bypasses JSON shaping", () => {
  it("getAll with a binary responseType is not wrapped by toArray or sliced", async () => {
    const { api } = build({ body: BYTES }, { slice: 1 });
    const out = await api.docs.getAll({ responseType: "blob" });
    expect(out).toBeInstanceOf(Blob);
  });

  it("response middleware receives the unchanged Blob", async () => {
    const seen: unknown[] = [];
    const { api } = build(
      { body: BYTES },
      { middleware: { onResponse: [(r: { data: unknown }) => void seen.push(r.data)] } },
    );
    const out = await api.docs.download({ params: { id: "1" } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(out);
  });
});
