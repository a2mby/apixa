import {
  ApiError,
  NetworkError,
  createTransferControl,
  defineApi,
  type TransferCheckpoint,
} from "apixa/core";
import { describe, expect, it } from "vitest";
import { protocolServer, source } from "../helpers/advanced-transfer-protocol.js";
import { step, withFaults, type Fault } from "../helpers/fault-injection.js";

/**
 * v1.8.0 Batch 3 — deterministic fault injection at every protocol step and persistence point
 * (register L8, L9, L17). Guarantee under test: per part at-least-once, completion applied exactly
 * once, and the server ledger — not the client — is authoritative after any interruption.
 */
type Server = ReturnType<typeof protocolServer>;
const clientWith = (server: Server, faults: Fault[], override: object = {}) =>
  defineApi<{ files: { entity: { id: string; size?: number; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: withFaults(server.transport, faults),
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: { create: { transfer: { ...server.config, ...override } } },
      },
    },
  });
const lost = (message: string) => () => {
  throw new NetworkError(message);
};
const captured = () => {
  const saves: TransferCheckpoint[] = [];
  return { saves, save: (c: TransferCheckpoint) => void saves.push(c) };
};
const checkpointOf = (error: unknown) =>
  (error as ApiError).advancedTransfer?.checkpoint as TransferCheckpoint | undefined;

describe("a network failure at each protocol step is recoverable without duplicate completion", () => {
  it.each([
    ["part 0 request", step.part(0), "before"],
    ["part 2 request", step.part(2), "before"],
    ["part 1 reply (committed, ack lost)", step.part(1), "after"],
  ] as const)("%s", async (_name, match, when) => {
    const server = protocolServer();
    const cp = captured();
    const fault: Fault =
      when === "before" ? { match, before: lost("x") } : { match, after: lost("x") };
    const error = await clientWith(server, [fault])
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(server.completions).toBe(0);
    const resume = checkpointOf(error) ?? cp.saves.at(-1)!;
    await server
      .client()
      .files.create({ document: source() }, { transfer: { checkpoint: resume } });
    expect(server.completions).toBe(1);
    expect(server.sessions.size).toBe(1);
    expect(server.sessions.get("1")!.state).toBe("completed");
  });

  it("a lost completion reply reconciles to the authoritative result without completing twice", async () => {
    const server = protocolServer();
    const cp = captured();
    const result = await clientWith(server, [
      { match: step.complete, after: lost("reply lost") },
    ]).files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } });
    expect(result).toMatchObject({ id: "1" });
    expect(server.completions).toBe(1);
  });

  it("a failed completion request (never processed) leaves the session resumable", async () => {
    const server = protocolServer();
    const cp = captured();
    const error = await clientWith(server, [{ match: step.complete, before: lost("down") }], {})
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch((e: unknown) => e);
    // NetworkError during completion triggers reconcile; the server still reports `active`.
    expect(error).toBeInstanceOf(NetworkError);
    expect(server.completions).toBe(0);
    await server
      .client()
      .files.create({ document: source() }, { transfer: { checkpoint: checkpointOf(error)! } });
    expect(server.completions).toBe(1);
  });

  it("initiate failure creates no session and no checkpoint", async () => {
    const server = protocolServer();
    const cp = captured();
    const error = await clientWith(server, [{ match: step.initiate, before: lost("down") }])
      .files.create({ document: source() }, { transfer: { saveCheckpoint: cp.save } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(server.sessions.size).toBe(0);
    expect(cp.saves).toHaveLength(0);
  });
});

describe("L9: checkpoint persistence failures", () => {
  it.each([0, 1, 2, 3])(
    "persisting save #%i fails: the error carries a usable checkpoint",
    async (failAt) => {
      const server = protocolServer();
      let call = 0;
      const error = await server
        .client()
        .files.create(
          { document: source() },
          {
            transfer: {
              saveCheckpoint: () => {
                if (call++ === failAt) throw new Error("disk full");
              },
            },
          },
        )
        .catch((e: unknown) => e);
      expect((error as ApiError).advancedTransfer?.reason).toBe("durability");
      const resume = checkpointOf(error)!;
      expect(resume).toBeDefined();
      const before = server.requests.length;
      await server
        .client()
        .files.create({ document: source() }, { transfer: { checkpoint: resume } });
      expect(server.sessions.size).toBe(1); // no second session
      expect(server.completions).toBe(1);
      // The server is authoritative: reconciliation, not the stale local list, decides what is skipped.
      const later = server.requests.slice(before);
      expect(later[0]!.method).toBe("GET");
      const parts = later.filter((r) => r.method === "PUT").map((r) => r.url);
      expect(new Set(parts).size).toBe(parts.length); // no part sent twice in the resumed run
    },
  );
});

describe("L17: duplicate delivery and retries", () => {
  it("a retried part reuses its stable key and an Idempotency-Key header", async () => {
    const server = protocolServer();
    const sent: { headers: Headers }[] = [];
    await clientWith(server, [
      { match: step.part(1), before: (r) => void sent.push(r), times: 5 },
      { match: step.part(1), before: lost("blip") },
    ]).files.create(
      { document: source() },
      { retry: { retries: 1, methods: ["PUT"], baseDelayMs: 0, maxDelayMs: 0, jitter: false } },
    );
    expect(sent.length).toBe(2);
    const keys = sent.map((r) => r.headers.get("idempotency-key"));
    expect(keys.every((k) => k && k === keys[0])).toBe(true);
    expect(server.completions).toBe(1);
  });

  it("two independent transfers of equal content never share a session or part key", async () => {
    const server = protocolServer();
    await Promise.all([
      server.client().files.create({ document: source() }, {}),
      server.client().files.create({ document: source() }, {}),
    ]);
    expect(server.sessions.size).toBe(2);
    const keys = server.requests
      .filter((r) => r.method === "PUT")
      .map((r) => r.headers.get("idempotency-key"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("bounded parallelism under failure", () => {
  it("after one part fails no further part starts and active requests stay within concurrency", async () => {
    const server = protocolServer();
    const limit = 3;
    const error = await clientWith(server, [{ match: step.part(1), before: lost("x") }], {
      concurrency: limit,
      chunkSize: 1,
    })
      .files.create({ document: source(40) }, {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    const settledAt = server.requests.length;
    await new Promise((r) => setTimeout(r, 10));
    expect(server.requests.length).toBe(settledAt);
    expect(server.maximum).toBeLessThanOrEqual(limit);
    expect(server.requests.filter((r) => r.method === "PUT").length).toBeLessThan(40);
  });

  it("cancel while paused settles with the cancellation and sends nothing more", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    let paused = false;
    const upload = server.client().files.create(
      { document: source(40) },
      {
        transfer: {
          control,
          onSession(snapshot) {
            if (!paused && snapshot.confirmedBytes >= 4) {
              paused = true;
              void control.pause().then(() => control.cancel("user left"));
            }
          },
        },
      },
    );
    const error = await upload.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const count = server.requests.length;
    await new Promise((r) => setTimeout(r, 10));
    expect(server.requests.length).toBe(count);
    expect(server.completions).toBe(0);
  });
});
