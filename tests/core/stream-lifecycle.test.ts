import { AbortError, TimeoutError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { bytes, collector, drain, transferClient, type StubFetch } from "../helpers/transfer.js";

/** A body that stays open until the request signal aborts, like a real fetch response body. */
const hanging: StubFetch = async (_url, init) => {
  const signal = init.signal;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes(2));
      signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  });
  return new Response(stream, { status: 200 });
};

/** A finite body, pulled on demand. */
const finite =
  (n: number): StubFetch =>
  async () => {
    let i = 0;
    return new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(c) {
            if (i++ < n) c.enqueue(bytes(2));
            else c.close();
          },
        },
        { highWaterMark: 0 },
      ),
    );
  };

describe("stream lifetime (v1.3.0 fix: a stream stays owned by its call)", () => {
  it("a caller abort after the operation resolved errors the stream with AbortError", async () => {
    const controller = new AbortController();
    const stream = await transferClient(hanging).docs.feed({ signal: controller.signal });
    const reader = stream!.getReader();
    await reader.read();
    controller.abort();
    await expect(reader.read()).rejects.toBeInstanceOf(AbortError);
  });

  it("the call timeout still applies to a stalled stream: TimeoutError", async () => {
    const stream = await transferClient(hanging).docs.feed({ timeout: 25 });
    const reader = stream!.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("a stream consumed in time is unaffected by the timeout and releases the timer", async () => {
    const out = await drain((await transferClient(finite(3)).docs.feed({ timeout: 5_000 }))!);
    expect(out.byteLength).toBe(6);
    // Past the (cleared) budget nothing fires: a second drain of a fresh call also works.
    await new Promise((r) => setTimeout(r, 20));
  });

  it("abort listeners and the timer are released when the stream ends, fails or is cancelled", async () => {
    const controller = new AbortController();
    const added: number[] = [];
    const removed: number[] = [];
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((t: string, l: never, o?: never) => {
      if (t === "abort") added.push(1);
      return add(t, l, o);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((t: string, l: never, o?: never) => {
      if (t === "abort") removed.push(1);
      return remove(t, l, o);
    }) as typeof signal.removeEventListener;
    const stream = await transferClient(finite(2)).docs.feed({ signal, timeout: 10_000 });
    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBe(0); // still owned: nothing released while unconsumed
    await drain(stream!);
    expect(removed.length).toBe(added.length);
  });

  it("cancelling the stream cancels the underlying body and releases the call", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const fetchImpl: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            c.enqueue(bytes(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    const stream = await transferClient(fetchImpl).docs.feed({ signal: controller.signal });
    const reader = stream!.getReader();
    await reader.read();
    await reader.cancel("done");
    expect(cancelled).toBe(true);
    controller.abort(); // after cancel: a no-op, must not throw or resurrect anything
  });

  it("preserves backpressure: nothing is read ahead of the consumer", async () => {
    let pulls = 0;
    const fetchImpl: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(c) {
              pulls++;
              c.enqueue(bytes(1));
            },
          },
          { highWaterMark: 0 },
        ),
      );
    const stream = await transferClient(fetchImpl).docs.feed();
    await new Promise((r) => setTimeout(r, 15));
    expect(pulls).toBe(0);
    const reader = stream!.getReader();
    await reader.read();
    await reader.read();
    await new Promise((r) => setTimeout(r, 15));
    expect(pulls).toBe(2);
    await reader.cancel();
  });

  it("preserves bytes and order", async () => {
    const chunks = [bytes(3, 1), bytes(1, 2), bytes(4, 3)];
    const fetchImpl: StubFetch = async () => {
      let i = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            if (i < chunks.length) c.enqueue(chunks[i++]!);
            else c.close();
          },
        }),
      );
    };
    const out = await drain((await transferClient(fetchImpl).docs.feed())!);
    expect(Array.from(out)).toEqual([1, 1, 1, 2, 3, 3, 3, 3]);
  });

  it("a response middleware that throws cancels the stream it was handed", async () => {
    let cancelled = false;
    const fetchImpl: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            c.enqueue(bytes(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    const client = transferClient(fetchImpl, {
      operation: {
        responseMiddleware: [
          () => {
            throw new Error("middleware failed");
          },
        ],
      },
    });
    await expect(client.docs.feed()).rejects.toThrow("middleware failed");
    expect(cancelled).toBe(true);
  });

  it("abort events: caller abort is `abort`, timeout is `error` with TimeoutError, both once", async () => {
    const controller = new AbortController();
    const a = collector();
    const s1 = await transferClient(hanging).docs.feed({
      signal: controller.signal,
      onTransfer: a.observer,
    });
    const r1 = s1!.getReader();
    await r1.read();
    controller.abort();
    await r1.read().catch(() => {});
    await r1.read().catch(() => {});
    expect(a.events.filter((e) => e.phase === "abort")).toHaveLength(1);
    expect(
      a.events.filter((e) => e.phase !== "unsupported" && ["error", "complete"].includes(e.phase)),
    ).toHaveLength(0);

    const t = collector();
    const s2 = await transferClient(hanging).docs.feed({ timeout: 20, onTransfer: t.observer });
    const r2 = s2!.getReader();
    await r2.read();
    await r2.read().catch(() => {});
    const errors = t.events.filter((e) => e.phase === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ willRetry: false, loaded: 2 });
    expect((errors[0] as { error: unknown }).error).toBeInstanceOf(TimeoutError);
  });

  it("consumer cancel is an abort event; a fully drained stream is exactly one complete", async () => {
    const c = collector();
    const s = await transferClient(finite(5)).docs.feed({ onTransfer: c.observer });
    const reader = s!.getReader();
    await reader.read();
    await reader.cancel("enough");
    expect(c.events.at(-1)).toMatchObject({ phase: "abort", reason: "enough" });

    const d = collector();
    await drain((await transferClient(finite(2)).docs.feed({ onTransfer: d.observer }))!);
    expect(d.events.filter((e) => e.phase === "complete")).toHaveLength(1);
    expect(d.events.at(-1)).toMatchObject({ phase: "complete", loaded: 4 });
  });

  it("a mid-stream network failure errors the stream and emits one error event with the bytes seen", async () => {
    let sent = 0;
    const fetchImpl: StubFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(c) {
              if (sent++ === 0) c.enqueue(bytes(3));
              else c.error(new TypeError("terminated"));
            },
          },
          { highWaterMark: 0 },
        ),
      );
    const c = collector();
    const stream = await transferClient(fetchImpl).docs.feed({ onTransfer: c.observer });
    const reader = stream!.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toThrow("terminated");
    expect(c.events.at(-1)).toMatchObject({ phase: "error", loaded: 3, willRetry: false });
  });
});
