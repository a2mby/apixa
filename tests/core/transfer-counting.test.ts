import { describe, expect, it } from "vitest";
import {
  TransferChannel,
  bindStreamLifetime,
  countedStream,
  trustworthyTotal,
} from "../../packages/core/src/transfer/index.js";
import { AbortError, TimeoutError } from "@apixa/core";
import type { TransferEvent } from "@apixa/core";
import { bytes, drain } from "../helpers/transfer.js";

const source = (chunks: Uint8Array[], onPull?: () => void) => {
  let i = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(c) {
        onPull?.();
        if (i < chunks.length) c.enqueue(chunks[i++]!);
        else c.close();
      },
    },
    { highWaterMark: 0 },
  );
};

describe("countedStream", () => {
  it("passes bytes through unchanged and counts them", async () => {
    const seen: number[] = [];
    let done = -1;
    const out = await drain(
      countedStream(source([bytes(3, 1), bytes(2, 2)]), {
        onChunk: (n) => seen.push(n),
        onDone: (n) => (done = n),
      }),
    );
    expect(Array.from(out)).toEqual([1, 1, 1, 2, 2]);
    expect(seen).toEqual([3, 5]);
    expect(done).toBe(5);
  });

  it("handles an empty body", async () => {
    let done = -1;
    const out = await drain(countedStream(source([]), { onDone: (n) => (done = n) }));
    expect(out.byteLength).toBe(0);
    expect(done).toBe(0);
  });

  it("reads the source only when the consumer pulls (backpressure, no read-ahead)", async () => {
    let pulls = 0;
    const counted = countedStream(
      source([bytes(1), bytes(1), bytes(1), bytes(1)], () => pulls++),
      {},
    );
    const reader = counted.getReader();
    await new Promise((r) => setTimeout(r, 10));
    expect(pulls).toBe(0);
    await reader.read();
    await new Promise((r) => setTimeout(r, 10));
    expect(pulls).toBe(1);
    await reader.read();
    expect(pulls).toBe(2);
    await reader.cancel();
  });

  it("propagates cancel to the source", async () => {
    let cancelled: unknown;
    const src = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(bytes(1));
      },
      cancel(reason) {
        cancelled = reason;
      },
    });
    const reader = countedStream(src, {}).getReader();
    await reader.read();
    await reader.cancel("stop");
    expect(cancelled).toBe("stop");
  });

  it("propagates a source error and never calls onDone", async () => {
    let done = false;
    const src = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes(2));
        c.error(new TypeError("terminated"));
      },
    });
    const counted = countedStream(src, { onDone: () => (done = true) });
    await expect(drain(counted)).rejects.toThrow("terminated");
    expect(done).toBe(false);
  });

  it("a throwing hook never breaks the stream", async () => {
    const out = await drain(
      countedStream(source([bytes(4)]), {
        onChunk() {
          throw new Error("boom");
        },
        onDone() {
          throw new Error("boom");
        },
      }),
    );
    expect(out.byteLength).toBe(4);
  });
});

describe("trustworthyTotal", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("accepts a plain Content-Length on an uncompressed response", () => {
    expect(trustworthyTotal(h({ "content-length": "42" }), 200)).toBe(42);
    expect(trustworthyTotal(h({ "content-length": "0" }), 200)).toBe(0);
    expect(trustworthyTotal(h({ "content-length": " 7 " }), 200)).toBe(7);
    expect(
      trustworthyTotal(h({ "content-length": "5", "content-encoding": "identity" }), 200),
    ).toBe(5);
  });
  it("rejects missing, malformed, negative, fractional and unsafe lengths", () => {
    for (const value of ["", "abc", "-1", "1.5", "1e3", "0x10", "10, 10", "99999999999999999999"]) {
      expect(trustworthyTotal(h({ "content-length": value }), 200), value).toBeUndefined();
    }
    expect(trustworthyTotal(h({}), 200)).toBeUndefined();
  });
  it("rejects a content-encoded body (decoded size differs)", () => {
    expect(
      trustworthyTotal(h({ "content-length": "5", "content-encoding": "gzip" }), 200),
    ).toBeUndefined();
  });
  it("rejects empty-by-definition responses and HEAD", () => {
    expect(trustworthyTotal(h({ "content-length": "5" }), 204)).toBeUndefined();
    expect(trustworthyTotal(h({ "content-length": "5" }), 304)).toBeUndefined();
    expect(trustworthyTotal(h({ "content-length": "5" }), 200, "HEAD")).toBeUndefined();
  });
});

describe("TransferChannel", () => {
  const make = () => {
    const events: TransferEvent[] = [];
    const channel = new TransferChannel((e) => void events.push(e), 2);
    return { events, channel };
  };

  it("orders start, progress, one terminal event and stamps the attempt", () => {
    const { events, channel } = make();
    channel.sink({ phase: "progress", direction: "download", loaded: 1 }); // before start: ignored
    channel.sink({ phase: "start", direction: "download", loaded: 0, total: 10 });
    channel.sink({ phase: "start", direction: "download", loaded: 0 }); // duplicate: ignored
    channel.sink({ phase: "progress", direction: "download", loaded: 4, total: 10 });
    channel.sink({ phase: "complete", direction: "download", loaded: 10, total: 10 });
    channel.sink({ phase: "progress", direction: "download", loaded: 11 }); // after terminal
    channel.fail({ kind: "abort" }); // already terminal
    expect(events.map((e) => e.phase)).toEqual(["start", "progress", "complete"]);
    expect(events.every((e) => e.attempt === 2)).toBe(true);
  });

  it("drops a total the body outgrew instead of reporting it", () => {
    const { events, channel } = make();
    channel.sink({ phase: "start", direction: "download", loaded: 0, total: 3 });
    channel.sink({ phase: "progress", direction: "download", loaded: 5, total: 3 });
    const last = events.at(-1)!;
    expect(last.phase === "progress" && last.total).toBeUndefined();
  });

  it("fail ends only started directions, with the bytes seen so far", () => {
    const { events, channel } = make();
    channel.sink({ phase: "start", direction: "upload", loaded: 0, total: 9 });
    channel.sink({ phase: "progress", direction: "upload", loaded: 4, total: 9 });
    const error = new TimeoutError("t");
    channel.fail({ kind: "error", error, willRetry: true });
    expect(events.at(-1)).toMatchObject({
      phase: "error",
      direction: "upload",
      loaded: 4,
      total: 9,
      willRetry: true,
    });
    expect(error.transfer).toEqual({ direction: "upload", loaded: 4, total: 9 });
    expect(events.filter((e) => e.direction === "download")).toEqual([]);
  });

  it("finishRequest marks unobserved directions unsupported, once", () => {
    const { events, channel } = make();
    channel.finishRequest(true);
    channel.finishRequest(true);
    expect(events).toEqual([
      expect.objectContaining({ phase: "unsupported", direction: "upload", attempt: 2 }),
      expect.objectContaining({ phase: "unsupported", direction: "download", attempt: 2 }),
    ]);
    const { events: none, channel: c2 } = make();
    c2.finishRequest(false);
    expect(none.map((e) => e.direction)).toEqual(["download"]);
  });

  it("swallows a throwing or rejecting observer", async () => {
    const throwing = new TransferChannel(() => {
      throw new Error("x");
    }, 0);
    expect(() => throwing.sink({ phase: "start", direction: "download", loaded: 0 })).not.toThrow();
    const rejecting = new TransferChannel(() => Promise.reject(new Error("y")), 0);
    rejecting.sink({ phase: "start", direction: "download", loaded: 0 });
    await new Promise((r) => setTimeout(r, 5)); // no unhandled rejection
  });
});

describe("bindStreamLifetime", () => {
  it("ends with the signal's error and cancels the source", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const src = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(bytes(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const outcomes: string[] = [];
    const bound = bindStreamLifetime(src, {
      signal: controller.signal,
      abortError: () => new AbortError(),
      settled: (o) => void outcomes.push(o.kind),
    });
    const reader = bound.getReader();
    await reader.read();
    controller.abort();
    await expect(reader.read()).rejects.toBeInstanceOf(AbortError);
    expect(outcomes).toEqual(["abort"]);
    expect(cancelled).toBe(true);
  });

  it("settles exactly once on complete and on consumer cancel", async () => {
    const outcomes: string[] = [];
    const lifetime = (signal: AbortSignal) => ({
      signal,
      abortError: () => new AbortError(),
      settled: (o: { kind: string }) => void outcomes.push(o.kind),
    });
    await drain(bindStreamLifetime(source([bytes(2)]), lifetime(new AbortController().signal)));
    const reader = bindStreamLifetime(
      source([bytes(2), bytes(2)]),
      lifetime(new AbortController().signal),
    ).getReader();
    await reader.read();
    await reader.cancel();
    await reader.cancel();
    expect(outcomes).toEqual(["complete", "cancel"]);
  });
});
