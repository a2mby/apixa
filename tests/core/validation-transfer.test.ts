import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import {
  bytes,
  chunkedResponse,
  collector,
  transferClient,
  type StubFetch,
} from "../helpers/transfer.js";

const RETRY = { retries: 2, baseDelayMs: 0, maxDelayMs: 0, methods: ["GET", "PUT", "POST"] };

describe("validation and onTransfer", () => {
  it("a pre-send rejection emits no event and never reaches the transport", async () => {
    let calls = 0;
    const client = transferClient(
      async () => {
        calls++;
        return new Response("ok");
      },
      { operation: { fileFields: undefined, fileLimits: { maxBodySize: 3 } } },
    );
    const c = collector();
    const error = await client.docs
      .push(new Blob([bytes(10)]), { onTransfer: c.observer })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(calls).toBe(0);
    expect(c.events).toEqual([]);
  });

  it("attempt isolation: a retried download that stays within the limit completes normally", async () => {
    let n = 0;
    const fetchImpl: StubFetch = async () =>
      ++n === 1
        ? new Response("busy", { status: 503 })
        : chunkedResponse([bytes(4)], { headers: { "content-length": "4" } });
    const c = collector();
    const blob = await transferClient(fetchImpl, {
      operation: { maxResponseSize: 10 },
    }).docs.download("1", { retry: RETRY, onTransfer: c.observer });
    expect(blob.size).toBe(4);
    expect(c.events.map((e) => `${e.attempt}:${e.phase}`)).toEqual([
      "0:start",
      "0:error",
      "1:start",
      "1:progress",
      "1:complete",
    ]);
  });

  it("a limit violation after a retry is the terminal event of that attempt and is not retried again", async () => {
    let n = 0;
    const fetchImpl: StubFetch = async () => {
      n++;
      return n === 1 ? new Response("busy", { status: 503 }) : chunkedResponse([bytes(20)]);
    };
    const c = collector();
    const error = await transferClient(fetchImpl, { operation: { maxResponseSize: 10 } })
      .docs.download("1", { retry: RETRY, onTransfer: c.observer })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(n).toBe(2);
    expect(c.events.at(-1)).toMatchObject({ phase: "error", attempt: 1, willRetry: false });
  });

  it("no fabricated completion when a download is cut by its limit", async () => {
    const c = collector();
    await transferClient(async () => chunkedResponse([bytes(6), bytes(6)]), {
      operation: { maxResponseSize: 8 },
    })
      .docs.download("1", { onTransfer: c.observer })
      .catch(() => {});
    expect(c.events.some((e) => e.phase === "complete")).toBe(false);
    expect(c.events.at(-1)).toMatchObject({ phase: "error" });
  });
});
