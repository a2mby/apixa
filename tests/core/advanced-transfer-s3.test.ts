import { ValidationError, defineApi, type Transport, type TransportRequest } from "apixa/core";
import { describe, expect, it } from "vitest";
import { s3Transfer } from "../../examples/frontends/query-ssr-next/lib/s3-transfer.js";

function setup() {
  const parts = new Map<number, { partNumber: number; size: number; etag: string }>();
  const sent: TransportRequest[] = [];
  let expired = false;
  let missingEtag = false;
  let completionError = false;
  let renewals = 0;
  const transport: Transport = {
    capabilities: { presigned: true },
    async request(r) {
      sent.push(r);
      const url = new URL(r.url);
      const headers = new Headers();
      let status = 200;
      let body: unknown;
      if (url.hostname === "storage.example") {
        if (expired) {
          expired = false;
          status = 403;
          body = "expired";
        } else {
          const partNumber = Number(url.pathname.slice(1));
          const size = (await new Response(r.body).arrayBuffer()).byteLength;
          const etag = `"opaque-${partNumber}"`;
          if (!missingEtag) headers.set("etag", etag);
          parts.set(partNumber, { partNumber, size, etag });
          body = "";
        }
      } else if (r.method === "GET") {
        renewals++;
        body = { state: "active", parts: [...parts.values()] };
      } else if (url.pathname.endsWith("/presign"))
        body = {
          url: `https://storage.example/${JSON.parse(String(r.body)).partNumber}?signature=secret`,
        };
      else if (url.pathname.endsWith("/complete")) {
        const input = JSON.parse(String(r.body));
        if (
          input.parts.map((p: { partNumber: number }) => p.partNumber).join() !==
          [...parts.keys()].sort().join()
        )
          throw Error("bad S3 manifest");
        body = completionError
          ? { Error: { Code: "InvalidPart" } }
          : { id: "object", size: [...parts.values()].reduce((n, p) => n + p.size, 0) };
      } else body = { id: "upload" };
      const raw = new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers,
      });
      return { status, body, raw, headers };
    },
  };
  const api = defineApi<{ files: { entity: { id: string; file: string; size?: number } } }>()({
    baseURL: "https://backend.example",
    headers: { Authorization: "Bearer backend-secret" },
    transport,
    resources: {
      files: {
        path: "/files",
        fileFields: ["file"],
        operations: {
          create: {
            transfer: s3Transfer("file", 5 * 1024 * 1024),
            presigned: { origins: ["https://storage.example"] },
          },
        },
      },
    },
  });
  return {
    api,
    sent,
    parts,
    expire() {
      expired = true;
    },
    hideEtag() {
      missingEtag = true;
    },
    failCompletion() {
      completionError = true;
    },
    get renewals() {
      return renewals;
    },
  };
}
describe("backend-mediated S3 multipart recipe", () => {
  it("presigns bounded raw parts and completes with opaque ETags in part-number order", async () => {
    const test = setup();
    const size = 5 * 1024 * 1024 + 2;
    await expect(
      test.api.files.create({ file: new Blob([new Uint8Array(size)]) }),
    ).resolves.toMatchObject({ size });
    expect([...test.parts.keys()]).toEqual([1, 2]);
    const signed = test.sent.filter((r) => r.url.includes("storage.example"));
    expect(signed).toHaveLength(2);
    expect(
      signed.every((r) => !r.headers.has("authorization") && r.security?.credentials === "omit"),
    ).toBe(true);
    expect(signed.every((r) => r.body instanceof Blob && !(r.body instanceof FormData))).toBe(true);
  });
  it("renews an expired part URL only after authoritative inspection", async () => {
    const test = setup();
    test.expire();
    await expect(
      test.api.files.create({ file: new Blob(["small final part"]) }),
    ).resolves.toHaveProperty("id", "object");
    expect(test.renewals).toBeGreaterThanOrEqual(1);
    expect(test.sent.filter((r) => r.url.includes("storage.example"))).toHaveLength(2);
  });
  it("rejects missing ETag and embedded HTTP-200 completion errors", async () => {
    const noTag = setup();
    noTag.hideEtag();
    await expect(noTag.api.files.create({ file: new Blob(["x"]) })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const error = setup();
    error.failCompletion();
    await expect(error.api.files.create({ file: new Blob(["x"]) })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
