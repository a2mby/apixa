import {
  AbortError,
  ApiError,
  HttpError,
  NetworkError,
  TimeoutError,
  ValidationError,
  defineApi,
  type Transport,
  type TransportRequest,
} from "apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";
import { step, withFaults } from "../helpers/fault-injection.js";

/**
 * v1.8.0 Batch 6 (register L16) — one table for how every file operation reports each kind of
 * failure. A failure maps to exactly one error class, is observed by `onError` exactly once, and
 * never resolves as success. No new error classes: this pins the existing contract.
 */
const hang = (): Transport => ({
  request: (input: TransportRequest) =>
    new Promise((_, reject) => {
      input.signal?.addEventListener("abort", () => reject(input.signal!.reason), { once: true });
    }),
});
const throwing = (error: unknown): Transport => ({
  request: async () => {
    throw error;
  },
});

function client(transport: Transport, seen: unknown[], extra: object = {}) {
  return defineApi({
    baseURL: "https://api.example.com",
    transport,
    middleware: [{ onError: (error) => void seen.push(error) }],
    resources: {
      docs: {
        path: "/docs",
        fileFields: { file: { maxSize: 8 } },
        ...extra,
      },
    },
  });
}
const blob = (n: number) => new Blob([new Uint8Array(n)]);

describe("upload failures", () => {
  const cases: [string, () => Transport, object, (e: unknown) => void][] = [
    [
      "network failure",
      () => throwing(new TypeError("fetch failed")),
      { retry: false },
      (e) => expect(e).toBeInstanceOf(NetworkError),
    ],
    ["timeout", hang, { retry: false, timeout: 5 }, (e) => expect(e).toBeInstanceOf(TimeoutError)],
    [
      "HTTP 500 with a JSON body",
      () => createFakeTransport(() => ({ status: 500, body: { message: "boom" } })),
      { retry: false },
      (e) => {
        expect(e).toBeInstanceOf(HttpError);
        expect(e).toMatchObject({ status: 500, data: { message: "boom" } });
      },
    ],
    [
      "HTTP 413 with a text body",
      () =>
        createFakeTransport(() => ({
          status: 413,
          body: "too big",
          headers: { "content-type": "text/plain" },
        })),
      { retry: false },
      (e) => expect(e).toMatchObject({ status: 413, data: "too big" }),
    ],
  ];
  it.each(cases)("%s → one classified error, observed once", async (_n, make, options, check) => {
    const seen: unknown[] = [];
    const error = await client(make(), seen)
      .docs.create({ file: blob(4) } as never, options)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    check(error);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(error);
  });

  it("a caller abort → AbortError, observed once", async () => {
    const seen: unknown[] = [];
    const controller = new AbortController();
    const pending = client(hang(), seen)
      .docs.create({ file: blob(4) } as never, { signal: controller.signal, retry: false })
      .catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(error).toBeInstanceOf(AbortError);
    expect(seen).toHaveLength(1);
  });

  it("a rule violation → ValidationError with typed violations, no request, observed once", async () => {
    const seen: unknown[] = [];
    let calls = 0;
    const counting: Transport = {
      request: async (input) => {
        calls++;
        return createFakeTransport(() => ({ body: {} })).request(input);
      },
    };
    const error = (await client(counting, seen)
      .docs.create({ file: blob(9) } as never)
      .catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.violations).toEqual([
      { code: "FILE_TOO_LARGE", path: "$.file", limit: 8, actual: 9 },
    ]);
    expect(calls).toBe(0);
    expect(seen).toHaveLength(1);
  });
});

describe("download failures", () => {
  it("HTTP 404 with a JSON body is an HttpError carrying parsed data (never a Blob)", async () => {
    const seen: unknown[] = [];
    const error = await client(
      createFakeTransport(() => ({ status: 404, body: { message: "gone" } })),
      seen,
    )
      .docs.getById(1, { responseType: "blob", retry: false })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, data: { message: "gone" } });
    expect(seen).toHaveLength(1);
  });

  it("a response over maxResponseSize is a ValidationError, not a success", async () => {
    const seen: unknown[] = [];
    const error = (await client(
      createFakeTransport(() => ({
        body: "x".repeat(50),
        headers: { "content-type": "text/plain" },
      })),
      seen,
    )
      .docs.getById(1, { responseType: "text", maxResponseSize: 10, retry: false })
      .catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.violations?.[0]).toMatchObject({ code: "RESPONSE_TOO_LARGE", limit: 10 });
    expect(seen).toHaveLength(1);
  });

  it("an aborted download → AbortError, observed once", async () => {
    const seen: unknown[] = [];
    const controller = new AbortController();
    const pending = client(hang(), seen)
      .docs.getById(1, { responseType: "blob", signal: controller.signal, retry: false })
      .catch((e: unknown) => e);
    controller.abort();
    expect(await pending).toBeInstanceOf(AbortError);
    expect(seen).toHaveLength(1);
  });
});

describe("advanced transfer failures keep one classification and a typed reason", () => {
  const run = async (fault: Parameters<typeof withFaults>[1][number]) => {
    const server = protocolServer();
    const seen: unknown[] = [];
    const api = defineApi<{ files: { entity: { id: string; document: string } } }>()({
      baseURL: "https://api.example.com",
      transport: withFaults(server.transport, [fault]),
      middleware: [{ onError: (error) => void seen.push(error) }],
      resources: {
        files: {
          path: "/files",
          fileFields: ["document"],
          operations: { create: { transfer: server.config } },
        },
      },
    });
    const error = (await api.files
      .create({ document: source() }, { retry: false })
      .catch((e: unknown) => e)) as ApiError;
    return { error, seen, server };
  };

  it("a part rejected with HTTP 500 is an HttpError that carries the transfer phase", async () => {
    const { error } = await run({
      match: step.part(1),
      before: () => {
        throw new HttpError("Request failed with status 500", { status: 500 });
      },
    });
    expect(error).toBeInstanceOf(HttpError);
    expect(error.advancedTransfer).toMatchObject({ phase: "uploading" });
  });

  it("an expired session is a typed session-expired failure, never a success", async () => {
    const server = protocolServer();
    const checkpoints: unknown[] = [];
    server.faults.failPart = 1;
    await server
      .client()
      .files.create(
        { document: source() },
        { transfer: { saveCheckpoint: (c) => void checkpoints.push(c) } },
      )
      .catch(() => {});
    server.sessions.get("1")!.state = "expired";
    const error = (await server
      .client()
      .files.create(
        { document: source() },
        { transfer: { checkpoint: checkpoints.at(-1) as never } },
      )
      .catch((e: unknown) => e)) as ApiError;
    expect(error.advancedTransfer?.reason).toBe("session-expired");
    expect(server.completions).toBe(0);
  });

  it("a network failure is a NetworkError with reason interrupted", async () => {
    const { error } = await run({
      match: step.part(0),
      before: () => {
        throw new NetworkError("down");
      },
    });
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.advancedTransfer?.reason).toBe("interrupted");
  });
});
