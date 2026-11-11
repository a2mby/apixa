import { AbortError, NetworkError, TimeoutError } from "../errors/index.js";
import type { Transport, TransportRequest, TransportResponse } from "../types/transport.js";
import { countedStream, trustworthyTotal } from "../transfer/counting.js";
import { detectTransferSupport } from "../transfer/support.js";
import { checkResponseHead, responseTooLarge } from "../validation/response.js";
import { readBody } from "./read-body.js";

const isStream = (body: unknown): body is ReadableStream<Uint8Array> =>
  typeof ReadableStream !== "undefined" && body instanceof ReadableStream;

interface PreparedBody {
  body: BodyInit | null | undefined;
  headers: Headers;
  duplex: boolean;
}

/**
 * Observe request-body bytes without changing what goes on the wire. A caller stream is counted
 * as is. A body of known size becomes a counted stream **only** when the runtime allows the
 * original `Content-Length` (and the `Content-Type` fetch would have derived) to be kept;
 * otherwise upload is reported unsupported and the body is sent untouched.
 */
async function prepareBody(input: TransportRequest): Promise<PreparedBody> {
  const { body, onTransfer } = input;
  const untouched: PreparedBody = { body, headers: input.headers, duplex: isStream(body) };
  if (body === null || body === undefined) return untouched;
  const report = onTransfer;
  if (isStream(body)) {
    if (!report) return untouched;
    if (!detectTransferSupport().streamingUpload) {
      report({
        phase: "unsupported",
        direction: "upload",
        reason: "this runtime does not support streaming request bodies",
      });
      return untouched;
    }
    report({ phase: "start", direction: "upload", loaded: 0 });
    return {
      body: countedStream(body, {
        onChunk: (loaded) => report({ phase: "progress", direction: "upload", loaded }),
        onDone: (loaded) => report({ phase: "complete", direction: "upload", loaded }),
      }),
      headers: input.headers,
      duplex: true,
    };
  }
  if (!report) return untouched;
  const support = detectTransferSupport();
  if (!support.uploadProgress) {
    report({
      phase: "unsupported",
      direction: "upload",
      reason:
        "this runtime cannot report upload progress without changing how the body is sent (it does not allow setting Content-Length on a streamed body)",
    });
    return untouched;
  }
  let blob: Blob;
  let contentType: string | null;
  if (body instanceof Blob) {
    blob = body;
    contentType = body.type || null;
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    blob = new Blob([body as BlobPart]);
    contentType = null;
  } else {
    // string, URLSearchParams, FormData: let the runtime serialize it exactly as fetch would.
    const serialized = new Response(body);
    contentType = serialized.headers.get("content-type");
    blob = await serialized.blob();
  }
  const headers = new Headers(input.headers);
  if (contentType && !headers.has("content-type")) headers.set("content-type", contentType);
  headers.set("content-length", String(blob.size));
  const total = blob.size;
  report({ phase: "start", direction: "upload", loaded: 0, total });
  return {
    body: countedStream(blob.stream(), {
      onChunk: (loaded) => report({ phase: "progress", direction: "upload", loaded, total }),
      onDone: (loaded) => report({ phase: "complete", direction: "upload", loaded, total }),
    }),
    headers,
    duplex: true,
  };
}

export function createFetchTransport(fetchImpl: typeof fetch = fetch): Transport {
  return {
    capabilities: { presigned: true },
    async request(input: TransportRequest): Promise<TransportResponse> {
      let response: Response;

      try {
        const prepared = await prepareBody(input);
        response = await fetchImpl(input.url, {
          method: input.method,
          headers: prepared.headers,
          body: prepared.body,
          signal: input.signal,
          ...(input.security
            ? { credentials: input.security.credentials, redirect: input.security.redirect }
            : {}),
          // A stream body (caller's or counted) must declare half-duplex or fetch rejects it.
          ...(prepared.duplex ? ({ duplex: "half" } as RequestInit) : {}),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new AbortError("Request was aborted", { cause: error });
        }

        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.message.includes("timed out"))
        ) {
          throw new TimeoutError("Request timed out", { cause: error });
        }

        if (error instanceof Error && error.name === "AbortError") {
          const reason = (error as { cause?: unknown }).cause;
          if (
            reason instanceof DOMException &&
            (reason.name === "TimeoutError" || reason.message.includes("timed out"))
          ) {
            throw new TimeoutError("Request timed out", { cause: error });
          }
          throw new AbortError("Request was aborted", { cause: error });
        }

        throw new NetworkError(error instanceof Error ? error.message : "Network request failed", {
          cause: error,
        });
      }

      const responseType = input.responseType ?? "json";
      const report = input.onTransfer;
      const limits = input.limits;
      if (limits && response.ok) {
        // Early reject from the response head (trustworthy Content-Length, declared Content-Type).
        const head = checkResponseHead(response.headers, response.status, input.method, limits);
        if (head) {
          response.body?.cancel(head).catch(() => {});
          throw head;
        }
      }
      // A stream result is bounded by the pipeline; every other type is buffered here, so count it.
      const cap = response.ok && responseType !== "stream" ? limits?.maxResponseBytes : undefined;
      let source = response;
      const total = report
        ? trustworthyTotal(response.headers, response.status, input.method)
        : undefined;
      const sized = total !== undefined ? { total } : {};
      if (report) report({ phase: "start", direction: "download", loaded: 0, ...sized });
      if (
        response.ok &&
        response.body &&
        response.status !== 204 &&
        response.status !== 205 &&
        (report || cap !== undefined)
      ) {
        const counted = countedStream(response.body, {
          onChunk: report
            ? (loaded) => report({ phase: "progress", direction: "download", loaded, ...sized })
            : undefined,
          onDone: report
            ? (loaded) => report({ phase: "complete", direction: "download", loaded, ...sized })
            : undefined,
          limit:
            cap !== undefined
              ? { bytes: cap, error: (seen) => responseTooLarge(cap, seen) }
              : undefined,
        });
        // Same bytes, same headers: the existing body reader decodes them exactly as before.
        source = new Response(counted, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } else if (report && response.ok) {
        report({ phase: "complete", direction: "download", loaded: 0 });
      }
      let body: unknown;
      const errorCap = !response.ok ? limits?.maxResponseBytes : undefined;
      if (errorCap !== undefined && response.body) {
        // A failed response keeps its status and `HttpError`; only its body is bounded. Over the
        // limit (declared or counted) the body is dropped (`data` is `null`), never buffered whole.
        const declared = trustworthyTotal(response.headers, response.status, input.method);
        if (declared !== undefined && declared > errorCap) {
          response.body.cancel().catch(() => {});
          body = null;
        } else {
          const overflow = new Error("error body over limit");
          const bounded = new Response(
            countedStream(response.body, { limit: { bytes: errorCap, error: () => overflow } }),
            { status: response.status, statusText: response.statusText, headers: response.headers },
          );
          body = await readBody(bounded, responseType).catch((error: unknown) => {
            if (error === overflow) return null;
            throw error;
          });
        }
      } else {
        body = await readBody(source, responseType);
      }

      return {
        status: response.status,
        headers: response.headers,
        raw: response,
        body,
      };
    },
  };
}
