export interface StreamLifetime {
  /** The call's signal (caller abort + overall timeout). */
  signal: AbortSignal;
  /** The error a consumer sees when the signal ends the stream (`AbortError` / `TimeoutError`). */
  abortError(): unknown;
  /** Called exactly once when the stream ends, fails, is aborted or is cancelled. */
  settled(
    outcome:
      | { kind: "complete" }
      | { kind: "error"; error: unknown }
      | { kind: "abort"; error: unknown }
      | { kind: "cancel"; reason: unknown },
  ): void;
}

/**
 * Bind a response body stream to the call that produced it. The returned stream keeps the call's
 * signal and timeout in force until it is consumed, fails or is cancelled (so a stream escaping its
 * operation Promise is no longer unowned), and reports how it ended. Pull-based with no read-ahead:
 * bytes, order and backpressure are exactly the source's.
 */
export function bindStreamLifetime(
  source: ReadableStream<Uint8Array>,
  lifetime: StreamLifetime,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let ended = false;
  let onAbort: (() => void) | undefined;
  const end = (outcome: Parameters<StreamLifetime["settled"]>[0]) => {
    if (ended) return false;
    ended = true;
    if (onAbort) lifetime.signal.removeEventListener("abort", onAbort);
    try {
      lifetime.settled(outcome);
    } catch {
      /* lifecycle bookkeeping must not break the stream */
    }
    return true;
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        onAbort = () => {
          const error = lifetime.abortError();
          if (end({ kind: "abort", error })) {
            controller.error(error);
            reader.cancel(lifetime.signal.reason).catch(() => {});
          }
        };
        if (lifetime.signal.aborted) onAbort();
        else lifetime.signal.addEventListener("abort", onAbort, { once: true });
      },
      async pull(controller) {
        if (ended) return;
        try {
          const { done, value } = await reader.read();
          if (ended) return;
          if (done) {
            if (end({ kind: "complete" })) controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          if (ended) return;
          const surfaced = lifetime.signal.aborted ? lifetime.abortError() : error;
          end(
            lifetime.signal.aborted ? { kind: "abort", error: surfaced } : { kind: "error", error },
          );
          controller.error(surfaced);
        }
      },
      cancel(reason) {
        end({ kind: "cancel", reason });
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}
