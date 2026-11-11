import { ConfigError, createTransferControl, defineApi, type Transport } from "apixa/core";
import { describe, expect, it } from "vitest";
import {
  captureCheckpoint,
  protocolServer,
  source,
} from "../helpers/advanced-transfer-protocol.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Client over the shared protocol server whose transport is wrapped by the test. */
function wrapped(
  server: ReturnType<typeof protocolServer>,
  wrap: (inner: Transport) => Transport,
  override: object = {},
) {
  return defineApi<{ files: { entity: { id: string; size?: number; document: string } } }>()({
    baseURL: "https://api.example.com",
    transport: wrap(server.transport),
    resources: {
      files: {
        path: "/files",
        fileFields: ["document"],
        operations: { create: { transfer: { ...server.config, ...override } } },
      },
    },
  });
}

describe("abort versus completion (L2)", () => {
  it("never aborts a session whose completion the server already processed", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const processed = deferred();
    const release = deferred();
    const client = wrapped(server, (inner) => ({
      capabilities: inner.capabilities,
      async request(input) {
        const response = await inner.request(input);
        if (input.method === "POST" && input.url.endsWith("/complete")) {
          processed.resolve();
          await release.promise;
        }
        return response;
      },
    }));
    const upload = client.files.create({ document: source(8) }, { transfer: { control } });
    const settled = upload.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await processed.promise;
    const abort = control.abort().then(
      () => "aborted" as const,
      (error: unknown) => error,
    );
    release.resolve();
    const outcome = await settled;
    const abortOutcome = await abort;
    // The server completed the upload: it must stay completed and must not receive DELETE.
    expect(server.sessions.get("1")!.state).toBe("completed");
    expect(server.requests.some((r) => r.method === "DELETE")).toBe(false);
    expect(abortOutcome).toBeInstanceOf(ConfigError);
    expect("value" in outcome).toBe(true);
    expect(server.completions).toBe(1);
  });

  it("still aborts remotely while parts are uploading", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const started = deferred();
    server.faults.latency = async () => {
      started.resolve();
      await new Promise((r) => setTimeout(r, 5));
    };
    const upload = server
      .client({}, {})
      .files.create({ document: source(20) }, { transfer: { control } });
    const settled = upload.catch((error: unknown) => error);
    await started.promise;
    await control.abort();
    await settled;
    expect(server.sessions.get("1")!.state).toBe("aborted");
  });
});

describe("renew and reconcile with parallel parts (L3)", () => {
  it("keeps a sibling part acknowledged while another part renews and reconciles", async () => {
    const server = protocolServer();
    const sibling = deferred();
    let inspected = false;
    let renewed = 0;
    server.faults.failStatus = 401;
    const client = wrapped(
      server,
      (inner) => ({
        capabilities: inner.capabilities,
        async request(input) {
          const response = await inner.request(input);
          const isInspect = input.method === "GET" && /\/sessions\/\d+$/.test(input.url);
          if (isInspect && !inspected) {
            // The snapshot above predates the sibling's commit: hold the response until the
            // sibling's acknowledgment has reached the client.
            inspected = true;
            await sibling.promise;
          }
          if (input.method === "PUT" && input.url.endsWith("/parts/1")) {
            queueMicrotask(() => setTimeout(sibling.resolve, 0));
          }
          return response;
        },
      }),
      {
        concurrency: 2,
        protocol: {
          ...server.config.protocol,
          renew: async () => {
            renewed++;
          },
        },
      },
    );
    // Part 0 gets 401; part 1 commits after the first inspect snapshot.
    server.faults.latency = async () => {
      await new Promise((r) => setTimeout(r, 10));
    };
    await client.files.create({ document: source(8) }, {});
    expect(renewed).toBeGreaterThanOrEqual(1);
    expect(server.sessions.get("1")!.state).toBe("completed");
    const puts = server.requests.filter((r) => r.method === "PUT" && r.url.endsWith("/parts/1"));
    expect(puts).toHaveLength(1);
  });
});

describe("failed remote abort keeps the way back (L8)", () => {
  it("retains the checkpoint when the server abort itself fails", async () => {
    const server = protocolServer();
    const control = createTransferControl();
    const cp = captureCheckpoint();
    const started = deferred();
    server.faults.latency = async () => {
      started.resolve();
      await new Promise((r) => setTimeout(r, 5));
    };
    const client = wrapped(server, (inner) => ({
      capabilities: inner.capabilities,
      async request(input) {
        if (input.method === "DELETE") throw new Error("abort unreachable");
        return inner.request(input);
      },
    }));
    const upload = client.files.create(
      { document: source(20) },
      { transfer: { control, saveCheckpoint: cp.save } },
    );
    const failure = upload.catch(
      (error: unknown) => error as { advancedTransfer?: { checkpoint?: unknown } },
    );
    await started.promise;
    await control.abort().catch(() => {});
    const error = await failure;
    expect(
      (error as { advancedTransfer?: { checkpoint?: unknown } }).advancedTransfer?.checkpoint,
    ).toBeDefined();
  });
});
