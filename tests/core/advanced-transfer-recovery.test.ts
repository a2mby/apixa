import { ApiError, ConfigError, NetworkError } from "apixa/core";
import { describe, expect, it } from "vitest";
import {
  captureCheckpoint,
  protocolServer,
  source,
} from "../helpers/advanced-transfer-protocol.js";

describe("authoritative session recovery", () => {
  it.each(["failPart", "loseAck"] as const)(
    "recovers after %s with a new client and serialized checkpoint",
    async (fault) => {
      const server = protocolServer();
      const checkpoint = captureCheckpoint();
      server.faults[fault] = 1;
      await expect(
        server
          .client()
          .files.create({ document: source() }, { transfer: { saveCheckpoint: checkpoint.save } }),
      ).rejects.toBeInstanceOf(NetworkError);
      const copied = JSON.parse(JSON.stringify(checkpoint.value));
      const before = server.requests.length;
      await server
        .client()
        .files.create({ document: source() }, { transfer: { checkpoint: copied } });
      const later = server.requests.slice(before);
      expect(later[0]!.method).toBe("GET");
      expect(later.some((r) => r.url.endsWith("/parts/0"))).toBe(false);
      if (fault === "loseAck") expect(later.some((r) => r.url.endsWith("/parts/1"))).toBe(false);
      expect(server.sessions.size).toBe(1);
      expect(server.completions).toBe(1);
    },
  );
  it("does not trust a locally confirmed part that the server no longer has", async () => {
    const server = protocolServer();
    const checkpoint = captureCheckpoint();
    server.faults.failPart = 2;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { saveCheckpoint: checkpoint.save } })
      .catch(() => {});
    server.sessions.get("1")!.parts.delete(0);
    const before = server.requests.length;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { checkpoint: checkpoint.value } });
    expect(server.requests.slice(before).filter((r) => r.url.endsWith("/parts/0"))).toHaveLength(1);
  });
  it.each(["expired", "aborted"] as const)(
    "rejects a server %s session without restarting",
    async (state) => {
      const server = protocolServer();
      const checkpoint = captureCheckpoint();
      server.faults.failPart = 1;
      await server
        .client()
        .files.create({ document: source() }, { transfer: { saveCheckpoint: checkpoint.save } })
        .catch(() => {});
      server.sessions.get("1")!.state = state;
      const error = await server
        .client()
        .files.create({ document: source() }, { transfer: { checkpoint: checkpoint.value } })
        .catch((e: ApiError) => e);
      expect(error).toMatchObject({ advancedTransfer: { reason: "session-expired" } });
      expect(server.sessions.size).toBe(1);
    },
  );
  it("reconciles a lost finalization response rather than completing twice", async () => {
    const server = protocolServer();
    server.faults.loseCompletion = true;
    await expect(server.client().files.create({ document: source() })).resolves.toMatchObject({
      size: 13,
    });
    expect(server.completions).toBe(1);
  });
  it("rejects changed same-size source before trusting a persisted session", async () => {
    const server = protocolServer();
    const checkpoint = captureCheckpoint();
    server.faults.failPart = 1;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { saveCheckpoint: checkpoint.save } })
      .catch(() => {});
    const before = server.requests.length;
    await expect(
      server
        .client()
        .files.create(
          { document: new Blob([new Uint8Array(13).fill(99)]) },
          { transfer: { checkpoint: checkpoint.value } },
        ),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(server.requests).toHaveLength(before);
  });
});

it("rejects an unknown server session without creating a replacement", async () => {
  const server = protocolServer();
  const cp = captureCheckpoint();
  server.faults.failPart = 1;
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
    .catch(() => {});
  server.sessions.clear();
  const error = await server
    .client()
    .files.create({ document: source() }, { transfer: { checkpoint: cp.value } })
    .catch((e) => e);
  expect(error).toMatchObject({ advancedTransfer: { reason: "session-expired" } });
  expect(server.sessions.size).toBe(0);
});
it("rejects conflicting server ETags instead of skipping an inconsistent part", async () => {
  const server = protocolServer();
  const cp = captureCheckpoint();
  server.faults.failPart = 1;
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
    .catch(() => {});
  server.sessions.get("1")!.parts.get(0)!.ack.etag = '"changed"';
  await expect(
    server.client().files.create({ document: source() }, { transfer: { checkpoint: cp.value } }),
  ).rejects.toMatchObject({ advancedTransfer: { reason: "integrity" } });
});
it("rejects duplicate authoritative parts", async () => {
  const server = protocolServer();
  const cp = captureCheckpoint();
  server.faults.failPart = 1;
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
    .catch(() => {});
  const original = server.config.protocol.inspect!;
  const protocol = {
    ...server.config.protocol,
    inspect: async (...args: Parameters<typeof original>) => {
      const state = await original(...args);
      return state.state === "active"
        ? { ...state, parts: [...state.parts, ...state.parts] }
        : state;
    },
  };
  await expect(
    server
      .client({ protocol })
      .files.create({ document: source() }, { transfer: { checkpoint: cp.value } }),
  ).rejects.toMatchObject({ advancedTransfer: { reason: "protocol" } });
});
it("a failed HTTP envelope cannot masquerade as authoritative completion", async () => {
  const server = protocolServer();
  const cp = captureCheckpoint();
  server.faults.failPart = 1;
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
    .catch(() => {});
  const original = server.config.protocol.inspect!;
  const protocol = {
    ...server.config.protocol,
    inspect: async (...args: Parameters<typeof original>) => {
      await original(...args);
      const response = await args[0].request<import("apixa/core").ApiResponse<unknown>>({
        kind: "read",
        method: "GET",
        path: "/sessions/1",
        full: true,
      });
      return {
        state: "completed" as const,
        result: { ...response, data: { id: "1", size: 13 }, status: 503 },
      };
    },
  };
  await expect(
    server
      .client({ protocol })
      .files.create({ document: source() }, { transfer: { checkpoint: cp.value } }),
  ).rejects.toMatchObject({ advancedTransfer: { reason: "protocol" } });
});

it("resuming an already completed session returns authoritative result without repeating completion", async () => {
  const server = protocolServer();
  const cp = captureCheckpoint();
  await server
    .client()
    .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } });
  const before = server.requests.length;
  await expect(
    server.client().files.create({ document: source() }, { transfer: { checkpoint: cp.value } }),
  ).resolves.toHaveProperty("size", 13);
  expect(server.requests.slice(before).map((r) => r.method)).toEqual(["GET"]);
  expect(server.completions).toBe(1);
});
