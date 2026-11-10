import { ConfigError, ValidationError } from "apixa/core";
import { describe, expect, it, vi } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";

describe("bounded integrity and source identity", () => {
  it("sends the known SHA-256 vector for abc and preserves server verification evidence", async () => {
    const server = protocolServer();
    await server.client().files.create({ document: new Blob(["abc"]) });
    expect(server.sessions.get("1")!.parts.get(0)!.ack).toMatchObject({
      verification: "server",
      checksum: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });
  it("rejects mismatched part checksums before finalization", async () => {
    const server = protocolServer();
    const original = server.config.protocol.uploadPart;
    const protocol = {
      ...server.config.protocol,
      uploadPart: async (...args: Parameters<typeof original>) => ({
        ...(await original(...args)),
        checksum: "0".repeat(64),
      }),
    };
    const error = await server
      .client({ protocol })
      .files.create({ document: source() })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.advancedTransfer.reason).toBe("integrity");
    expect(server.completions).toBe(0);
  });
  it("fails before initiation if required hashing is unavailable", async () => {
    const server = protocolServer();
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(server.client().files.create({ document: source() })).rejects.toBeInstanceOf(
        ConfigError,
      );
      expect(server.requests).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("a nonresumable protocol with optional integrity disabled can run without Web Crypto", async () => {
  const server = protocolServer();
  vi.stubGlobal("crypto", undefined);
  try {
    await expect(
      server
        .client({ integrity: "none", protocol: { ...server.config.protocol, inspect: undefined } })
        .files.create({ document: source() }),
    ).resolves.toHaveProperty("size", 13);
    expect(
      [...server.sessions.get("1")!.parts.values()].every(
        (p) => p.ack.verification === "unverified",
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
