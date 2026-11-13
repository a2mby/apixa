import {
  ConfigError,
  SecurityError,
  ValidationError,
  createFetchTransport,
  defineApi,
  type TransportRequest,
} from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("advanced transfer Batch 0: existing execution seams", () => {
  it("a write function cannot inspect a session with GET through ordinary ctx.request", async () => {
    const sent: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        sent.push(request);
        return { body: { state: "active" } };
      }),
      resources: {
        files: {
          path: "/files",
          operations: {
            upload: {
              kind: "write",
              run: (ctx) => ctx.request({ method: "GET", path: "/sessions/one" }),
            },
          },
        },
      },
    });

    await expect(api.files.upload()).rejects.toBeInstanceOf(ConfigError);
    expect(sent).toHaveLength(0);
  });

  it("each request in a function has a distinct signal and middleware lifecycle", async () => {
    const sent: TransportRequest[] = [];
    const middlewareSteps: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        sent.push(request);
        return { body: { ok: true } };
      }),
      middleware: [
        {
          onRequest(request) {
            middlewareSteps.push(request.path);
          },
        },
      ],
      resources: {
        files: {
          path: "/files",
          operations: {
            upload: {
              kind: "write",
              run: async (ctx) => {
                await ctx.request({ method: "POST", path: "/sessions", timeout: 1000 });
                return ctx.request({ method: "PUT", path: "/parts/one", timeout: 1000 });
              },
            },
          },
        },
      },
    });

    const result = api.files.upload();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual({ ok: true });
    expect(middlewareSteps).toEqual(["/files/sessions", "/files/parts/one"]);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.signal).not.toBe(sent[1]!.signal);
  });

  it("rejects a storage-origin URL even when request middleware supplies it", async () => {
    let sends = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { Authorization: "Bearer api-secret" },
      transport: createFakeTransport(() => {
        sends++;
        return { body: null };
      }),
      middleware: [
        {
          onRequest(request) {
            request.url = "https://storage.example.com/object?signature=temporary";
          },
        },
      ],
      resources: { files: { path: "/files" } },
    });

    await expect(api.files.getAll()).rejects.toBeInstanceOf(SecurityError);
    expect(sends).toBe(0);
  });

  it("validates a middleware-replaced whole source before a custom upload request", async () => {
    let sends = 0;
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => {
        sends++;
        return { body: { id: "one" } };
      }),
      resources: {
        files: {
          path: "/files",
          fileFields: { document: { maxSize: 2 } },
          middleware: [
            {
              onRequest(request) {
                request.body = { document: new Blob(["oversized"]) };
              },
            },
          ],
          operations: {
            upload: {
              kind: "write",
              run: (ctx) => ctx.request({ method: "POST", body: { document: new Blob(["x"]) } }),
            },
          },
        },
      },
    });

    await expect(api.files.upload()).rejects.toBeInstanceOf(ValidationError);
    expect(sends).toBe(0);
  });

  it("ordinary custom uploads send raw Blob bytes as one request without a new strategy", async () => {
    const sent: TransportRequest[] = [];
    const source = new Blob([new Uint8Array([0, 255, 1, 128, 2])]);
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        sent.push(request);
        return { body: { id: "one" } };
      }),
      resources: {
        files: {
          path: "/files",
          operations: {
            upload: {
              kind: "write",
              run: (ctx, body: Blob) => ctx.request({ method: "PUT", path: "/raw", body }),
            },
          },
        },
      },
    });

    await api.files.upload(source);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe(source);
    expect(await new Response(sent[0]!.body).arrayBuffer()).toEqual(await source.arrayBuffer());
  });

  // Batch 0 regression: forwarding must retain the limit before binary body reading.
  it("ctx.request must enforce its declared per-request maxResponseSize", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFetchTransport(async () => new Response("too large")),
      resources: {
        files: {
          path: "/files",
          operations: {
            inspect: {
              kind: "read",
              run: (ctx) =>
                ctx.request({ responseType: "blob", maxResponseSize: 2, path: "/session" }),
            },
          },
        },
      },
    });

    await expect(api.files.inspect()).rejects.toBeInstanceOf(ValidationError);
  });
});
