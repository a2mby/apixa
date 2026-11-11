import { AbortError, ConfigError, TimeoutError, createTransferControl } from "apixa/core";
import { describe, expect, it } from "vitest";
import {
  captureCheckpoint,
  protocolServer,
  source,
} from "../helpers/advanced-transfer-protocol.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("caller-owned transfer controls", () => {
  it("pauses at a quiescent checkpoint and resumes the same native Promise", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const paused = deferred();
    let requested = false;
    const cp = captureCheckpoint();
    const upload = server.client().files.create(
      { document: source(20) },
      {
        transfer: {
          control,
          saveCheckpoint: cp.save,
          onSession(snapshot) {
            if (!requested && snapshot.confirmedBytes >= 4 && snapshot.phase === "uploading") {
              requested = true;
              void control.pause().then(paused.resolve);
            }
          },
        },
      },
    );
    await paused.promise;
    const before = server.requests.length;
    await Promise.resolve();
    expect(server.requests).toHaveLength(before);
    expect(cp.value.parts).toHaveLength(1);
    control.resume();
    await expect(upload).resolves.toMatchObject({ size: 20 });
  });
  it("cancel preserves server state and exposes a safe recovery checkpoint", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    let cancelled = false;
    const error = await server
      .client()
      .files.create(
        { document: source() },
        {
          transfer: {
            control,
            onSession(s) {
              if (!cancelled && s.confirmedBytes >= 4) {
                cancelled = true;
                control.cancel();
              }
            },
          },
        },
      )
      .catch((e) => e);
    expect(error).toBeInstanceOf(AbortError);
    expect(error.advancedTransfer.checkpoint.parts.length).toBe(1);
    expect(server.sessions.get("1")!.state).toBe("active");
    expect(server.completions).toBe(0);
    await server
      .client()
      .files.create(
        { document: source() },
        { transfer: { checkpoint: error.advancedTransfer.checkpoint } },
      );
    expect(server.completions).toBe(1);
  });
  it("remote abort waits for backend acknowledgment and never completes", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    let remote: Promise<void> | undefined;
    const upload = server.client().files.create(
      { document: source() },
      {
        transfer: {
          control,
          onSession(s) {
            if (!remote && s.confirmedBytes >= 4) remote = control.abort();
          },
        },
      },
    );
    await expect(upload).rejects.toBeInstanceOf(AbortError);
    await remote;
    expect(server.sessions.get("1")!.state).toBe("aborted");
    expect(server.completions).toBe(0);
  });
  it("caller signal cancellation aborts stalled steps without a server delete", async () => {
    const server = protocolServer();
    const started = deferred();
    const stalled = deferred();
    server.faults.latency = async () => {
      started.resolve();
      await stalled.promise;
    };
    const controller = new AbortController();
    const upload = server
      .client()
      .files.create({ document: source() }, { signal: controller.signal });
    const assertion = expect(upload).rejects.toBeInstanceOf(AbortError);
    await started.promise;
    controller.abort();
    await assertion;
    stalled.resolve();
    await Promise.resolve();
    expect(server.requests.some((r) => r.method === "DELETE")).toBe(false);
  });
  it("the overall timeout includes paused time", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const upload = server.client().files.create(
      { document: source() },
      {
        timeout: 30,
        transfer: {
          control,
          onSession(s) {
            if (s.phase === "starting") void control.pause();
          },
        },
      },
    );
    await expect(upload).rejects.toBeInstanceOf(TimeoutError);
    expect(server.requests.filter((r) => r.method === "PUT")).toHaveLength(0);
  });
  it("a control cannot bind to two active transfers", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const started = deferred();
    const upload = server.client().files.create(
      { document: source() },
      {
        transfer: {
          control,
          onSession(s) {
            if (s.phase === "starting") {
              void control.pause();
              started.resolve();
            }
          },
        },
      },
    );
    const assertion = expect(upload).rejects.toBeInstanceOf(AbortError);
    await started.promise;
    await expect(
      server.client().files.create({ document: source() }, { transfer: { control } }),
    ).rejects.toBeInstanceOf(ConfigError);
    control.cancel();
    await assertion;
  });
});

it("overall deadline also bounds stalled outer operation middleware", async () => {
  const server = protocolServer();
  const api = server.client({}, { middleware: { onRequest: () => new Promise<never>(() => {}) } });
  await expect(api.files.create({ document: source() }, { timeout: 20 })).rejects.toBeInstanceOf(
    TimeoutError,
  );
  expect(server.requests).toHaveLength(0);
});
