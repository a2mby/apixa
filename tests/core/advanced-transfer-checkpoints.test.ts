import { ConfigError, type TransferCheckpoint } from "apixa/core";
import { describe, expect, it } from "vitest";
import {
  captureCheckpoint,
  protocolServer,
  source,
} from "../helpers/advanced-transfer-protocol.js";

async function interrupted() {
  const server = protocolServer();
  const checkpoint = captureCheckpoint();
  server.faults.failPart = 1;
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: checkpoint.save } })
    .catch(() => {});
  return { server, checkpoint };
}
describe("typed caller-owned checkpoints", () => {
  it.each([
    (c: TransferCheckpoint) => {
      c.version = 2 as never;
    },
    (c: TransferCheckpoint) => {
      c.chunkSize = 3;
    },
    (c: TransferCheckpoint) => {
      c.protocol.id = "different";
    },
    (c: TransferCheckpoint) => {
      c.operation = "patch";
    },
    (c: TransferCheckpoint) => {
      c.source.size++;
    },
    (c: TransferCheckpoint) => {
      c.parts = [...c.parts, ...c.parts];
    },
    (c: TransferCheckpoint) => {
      Object.assign(c, { url: "https://storage.example/secret" });
    },
  ])("rejects incompatible/corrupt checkpoint %#", async (mutate) => {
    const { server, checkpoint } = await interrupted();
    const copied = JSON.parse(JSON.stringify(checkpoint.value)) as TransferCheckpoint;
    mutate(copied);
    const before = server.requests.length;
    await expect(
      server.client().files.create({ document: source() }, { transfer: { checkpoint: copied } }),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(server.requests).toHaveLength(before);
  });
  it("serializes deeply immutable monotonic snapshots without source bytes or signed data", async () => {
    const server = protocolServer();
    const seen: TransferCheckpoint[] = [];
    await server.client({ concurrency: 3 }).files.create(
      { document: source() },
      {
        transfer: {
          saveCheckpoint(c) {
            seen.push(c);
            expect(Object.isFrozen(c.parts)).toBe(true);
          },
        },
      },
    );
    expect(seen.map((c) => c.revision)).toEqual([1, 2, 3, 4, 5]);
    expect(seen.map((c) => c.parts.length)).toEqual([0, 1, 2, 3, 4]);
    expect(JSON.stringify(seen)).not.toMatch(/blob|Authorization|presigned|Signature/);
  });
  it("stops scheduling when checkpoint persistence fails", async () => {
    const server = protocolServer();
    const error = await server
      .client()
      .files.create(
        { document: source() },
        {
          transfer: {
            saveCheckpoint(c) {
              if (c.parts.length) throw new Error("disk full");
            },
          },
        },
      )
      .catch((e) => e);
    expect(error).toMatchObject({ advancedTransfer: { reason: "durability" } });
    expect(server.requests.filter((r) => r.method === "PUT")).toHaveLength(1);
    expect(server.completions).toBe(0);
  });
});
