import {
  AbortError,
  MockError,
  defineApi,
  mockFiles,
  resetMock,
  type Transport,
} from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]);

/** A transport that must never run: mocked operations never reach the network. */
const forbidden: Transport = {
  request() {
    throw new Error("a mocked operation reached the transport");
  },
};

type Doc = { id: string; name: string; file?: string | null };

function makeApi() {
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport: forbidden,
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: [{ id: "1", name: "Seed", file: null as string | null }],
        operations: {
          download: {
            kind: "read",
            method: "GET",
            path: "/:id/file",
            responseType: "blob",
            mock: ({ params, store, files }) =>
              files.get(store.get(params.id).file as string).blob(),
          },
          raw: {
            kind: "read",
            method: "GET",
            path: "/:id/raw",
            responseType: "arrayBuffer",
            mock: ({ params, store, files }) =>
              files.get(store.get(params.id).file as string).bytes(),
          },
          note: {
            kind: "read",
            method: "GET",
            path: "/:id/note",
            responseType: "text",
            mock: ({ params, store, files }) =>
              files.get(store.get(params.id).file as string).text(),
          },
          info: {
            kind: "read",
            method: "GET",
            path: "/:id/info",
            responseType: "blob",
            // JSON data: the mock serializes it like a server would
            mock: ({ params, store }) => ({ id: params.id, name: store.get(params.id).name }),
          },
          missing: {
            kind: "read",
            method: "GET",
            path: "/missing",
            responseType: "blob",
            mock: ({ files }) => files.get("mock-file://nope/x.bin").blob(),
          },
          probe: {
            kind: "read",
            method: "GET",
            path: "/probe",
            mock: ({ files }) => ({
              has: files.has("mock-file://nope/x.bin"),
              list: files.list().length,
            }),
          },
          tail: {
            kind: "read",
            method: "GET",
            path: "/tail",
            responseType: "stream",
            mock: () => new Blob(["x"]),
          },
        },
      },
    },
  });
}

async function upload(api: ReturnType<typeof makeApi>, name = "photo.png") {
  const file = new File([PNG], name, { type: "image/png" });
  return api.docs.create({ name: "With file", file });
}

describe("mock downloads from the virtual file store", () => {
  it("round-trips an uploaded file through a declarative operation", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const blob = await api.docs.download({ params: { id: doc.id } });
    expectTypeOf(blob).toEqualTypeOf<Blob>();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG);
    expect((blob as File).name).toBe("photo.png");
  });

  it("full: true carries Content-Type, Content-Length and Content-Disposition", async () => {
    const api = makeApi();
    const doc = await upload(api, "résumé.png");
    const res = await api.docs.download({ ...({ full: true }), params: { id: doc.id } });
    expect(res.status).toBe(200);
    expect(res.raw).toBeUndefined();
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(PNG.length));
    const { parseContentDisposition } = await import("@apixa/core");
    expect(parseContentDisposition(res.headers)).toEqual({
      type: "attachment",
      filename: "résumé.png",
    });
  });

  it("is coerced to the requested responseType, per operation and per call", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const buffer = await api.docs.raw({ params: { id: doc.id } });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buffer)).toEqual(PNG);
    expect(await api.docs.note({ params: { id: doc.id } })).toBe(new TextDecoder().decode(PNG));
    const asBuffer = await api.docs.download({ ...({ responseType: "arrayBuffer" }), params: { id: doc.id } });
    expect(new Uint8Array(asBuffer)).toEqual(PNG);
    const asText = await api.docs.download({ ...({ responseType: "text" }), params: { id: doc.id } });
    expect(asText).toBe(new TextDecoder().decode(PNG));
  });

  it("serializes JSON results for a binary responseType, like a server would", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const res = await api.docs.info({ ...({ full: true }), params: { id: doc.id } });
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await res.data.text())).toEqual({ id: doc.id, name: "With file" });
  });

  it("a missing file is MOCK_NOT_FOUND; has() probes without throwing", async () => {
    const api = makeApi();
    const error = await api.docs.missing().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MockError);
    expect((error as MockError).code).toBe("MOCK_NOT_FOUND");
    expect(await api.docs.probe()).toEqual({ has: false, list: 0 });
    await upload(api);
    expect(await api.docs.probe()).toEqual({ has: false, list: 1 });
  });

  it("never reaches the transport, creates no object URL, and mocked stream is unsupported", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const original = URL.createObjectURL;
    let created = 0;
    URL.createObjectURL = ((...args: Parameters<typeof original>) => {
      created++;
      return original(...args);
    }) as typeof original;
    try {
      await api.docs.download({ params: { id: doc.id } });
    } finally {
      URL.createObjectURL = original;
    }
    expect(created).toBe(0);
    const error = await api.docs.tail().catch((e: unknown) => e);
    expect((error as MockError).code).toBe("MOCK_UNSUPPORTED");
  });

  it("clients are isolated; reset and record deletion remove the bytes", async () => {
    const a = makeApi();
    const b = makeApi();
    const doc = await upload(a);
    await expect(b.docs.download({ params: { id: doc.id } })).rejects.toMatchObject({ code: "MOCK_NOT_FOUND" });
    expect(mockFiles(a).size).toBe(1);
    expect(mockFiles(b).size).toBe(0);

    await a.docs.delete(doc.id);
    expect(mockFiles(a).size).toBe(0);
    await expect(a.docs.download({ params: { id: doc.id } })).rejects.toBeInstanceOf(MockError);

    const again = await upload(a);
    await expect(a.docs.download({ params: { id: again.id } })).resolves.toBeInstanceOf(Blob);
    resetMock(a);
    expect(mockFiles(a).size).toBe(0);
    await expect(a.docs.download({ params: { id: again.id } })).rejects.toBeInstanceOf(MockError);
  });

  it("handlers get fresh copies: mutating a download does not change the stored file", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const buffer = await api.docs.raw({ params: { id: doc.id } });
    new Uint8Array(buffer).fill(0);
    expect(new Uint8Array(await api.docs.raw({ params: { id: doc.id } }))).toEqual(PNG);
  });

  it("cancellation before the handler rejects with AbortError", async () => {
    const api = makeApi();
    const doc = await upload(api);
    const controller = new AbortController();
    controller.abort();
    await expect(api.docs.download({ ...({ signal: controller.signal }), params: { id: doc.id } })).rejects.toBeInstanceOf(
      AbortError,
    );
  });
});
