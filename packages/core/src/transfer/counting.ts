/** Hooks for {@link countedStream}. Callback errors never reach the stream consumer. */
export interface CountHooks {
  onChunk?(loaded: number): void;
  onDone?(loaded: number): void;
  /**
   * A byte limit. A chunk that would take the count past it is dropped: the stream errors with
   * `error(loaded)` (the count including that chunk) and the source is cancelled. Nothing is
   * buffered, so memory stays bounded by one chunk.
   */
  limit?: { bytes: number; error(seen: number): Error };
}

function safe(fn: (() => void) | undefined): void {
  try {
    fn?.();
  } catch {
    /* observers must never break a transfer */
  }
}

/**
 * Pass bytes through unchanged while counting them. Pull-based with no read-ahead
 * (`highWaterMark: 0`): the source is read only when the consumer asks, so backpressure and
 * cancellation propagate and nothing is buffered. Errors and cancellation reach the source as is.
 */
export function countedStream(
  source: ReadableStream<Uint8Array>,
  hooks: CountHooks,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let loaded = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { done, value } = await reader.read().catch((error: unknown) => {
          controller.error(error);
          return { done: undefined, value: undefined } as const;
        });
        if (done === undefined) return;
        if (done) {
          controller.close();
          safe(() => hooks.onDone?.(loaded));
          return;
        }
        loaded += value.byteLength;
        if (hooks.limit && loaded > hooks.limit.bytes) {
          const error = hooks.limit.error(loaded);
          controller.error(error);
          reader.cancel(error).catch(() => {});
          return;
        }
        controller.enqueue(value);
        safe(() => hooks.onChunk?.(loaded));
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}

/**
 * `Content-Length` as a download total, only when it can be trusted: a plain non-negative integer
 * on a response whose bytes are not content-encoded (the counted, decoded size would differ), that
 * is not an empty-by-definition status, and not a HEAD response.
 */
export function trustworthyTotal(
  headers: Headers,
  status: number,
  method?: string,
): number | undefined {
  if (status === 204 || status === 205 || status === 304 || method === "HEAD") return undefined;
  const encoding = headers.get("content-encoding");
  if (encoding && encoding.trim().toLowerCase() !== "identity") return undefined;
  const raw = headers.get("content-length");
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : undefined;
}
