import { type TransferSnapshot } from "apixa/core";
import { describe, expect, it } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

describe("honest session and request observation", () => {
  it("aggregates acknowledged source bytes once across retries and parallel parts", async () => {
    const server = protocolServer();
    const snapshots: TransferSnapshot[] = [];
    server.faults.failPart = 1;
    await server
      .client(
        { concurrency: 3 },
        { retry: { retries: 1, methods: ["PUT"], baseDelayMs: 0, maxDelayMs: 0 } },
      )
      .files.create(
        { document: source() },
        {
          transfer: {
            onSession(s) {
              snapshots.push(s);
            },
          },
        },
      );
    expect(snapshots.at(-1)).toMatchObject({ phase: "complete", total: 13, confirmedBytes: 13 });
    expect(snapshots.every((s) => s.confirmedBytes >= 0 && s.confirmedBytes <= 13)).toBe(true);
    expect(snapshots.filter((s) => s.phase === "complete")).toHaveLength(1);
    expect(snapshots.every((s) => Object.isFrozen(s))).toBe(true);
    expect(snapshots.flatMap((s) => s.parts).every((p) => p.loaded === undefined)).toBe(true);
  });
  it("observer throws and async rejections never break the transfer", async () => {
    const server = protocolServer();
    await expect(
      server.client().files.create(
        { document: source() },
        {
          transfer: {
            onSession(s) {
              if (s.phase === "starting") throw new Error("UI");
              return Promise.reject(new Error("UI async"));
            },
          },
        },
      ),
    ).resolves.toMatchObject({ size: 13 });
  });
});

it("response-acknowledgment bytes never overwrite observed chunk-upload progress", async () => {
  const server = protocolServer();
  const original = server.transport.request.bind(server.transport);
  server.transport.request = async (request) => {
    const result = await original(request);
    if (request.method === "PUT") {
      const bytes = (request.body as Blob).size;
      request.onTransfer?.({ direction: "upload", phase: "start", loaded: 0, total: bytes });
      request.onTransfer?.({ direction: "upload", phase: "complete", loaded: bytes, total: bytes });
      const responseBytes = new TextEncoder().encode(JSON.stringify(result.body)).length;
      request.onTransfer?.({
        direction: "download",
        phase: "start",
        loaded: 0,
        total: responseBytes,
      });
      request.onTransfer?.({
        direction: "download",
        phase: "complete",
        loaded: responseBytes,
        total: responseBytes,
      });
    }
    return result;
  };
  const snapshots: TransferSnapshot[] = [];
  await server.client().files.create(
    { document: source() },
    {
      transfer: {
        onSession(s) {
          snapshots.push(s);
        },
      },
    },
  );
  expect(snapshots.at(-1)!.parts.map((part) => part.loaded)).toEqual([4, 4, 4, 1]);
});
