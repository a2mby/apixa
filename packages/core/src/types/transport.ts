import type { AdvancedTransferOptions, PresignedRequest } from "./advanced-transfer.js";
import type { HeadersInitLike, HttpMethod, PathParams, QueryParams } from "./http.js";
import type { RetryConfig } from "./retry.js";

export type ResponseType = "json" | "auto" | "text" | "blob" | "arrayBuffer" | "stream";

/** Every {@link ResponseType} that is not parsed as JSON / auto. */
export type BinaryResponseType = Exclude<ResponseType, "json" | "auto">;

/**
 * The value an operation resolves to for a non-JSON `responseType`. `stream` is `null` for an
 * empty (204/205) response. JSON is not listed: its type comes from the operation's entity or
 * `response` metadata, as before.
 */
export type ResponseTypeData<RT extends BinaryResponseType> = RT extends "text"
  ? string
  : RT extends "blob"
    ? Blob
    : RT extends "arrayBuffer"
      ? ArrayBuffer
      : ReadableStream<Uint8Array> | null;

/**
 * One logical request as request/response/error middleware sees it. Created once per call
 * (retries reuse it), so middleware runs once per call, not once per attempt.
 */
export interface ApiRequest {
  /** Isolated, explicitly authorized delegated destination. */
  delegated?: boolean;
  method: HttpMethod;
  /** Final destination. Changing it in middleware is allowed but re-checked against the API origin. */
  url: string;
  /** Interpolated path relative to `baseURL` (or an absolute same-origin operation URL). */
  path: string;
  baseURL: string;
  headers: Headers;
  params?: PathParams;
  /** Wire query (after request key transforms). */
  query?: QueryParams;
  /** Public body (request key transforms run after request middleware, at serialization). */
  body?: unknown;
  signal: AbortSignal;
  timeout?: number;
  meta: Record<string, unknown>;
  /** `resources` key that issued the call. */
  resource: string;
  /** Operation name (builtin or custom). */
  operation: string;
  /** True when the resource is mocked — the request will never reach the network. */
  mocked: boolean;
}

/** Response envelope for response middleware and `{ full: true }` calls. */
export interface ApiResponse<T> {
  /** Processed body after unwrapping, response key transforms, parsing, and validation. */
  data: T;
  /** Original parsed body from transport or mock engine, before response pipeline stages. */
  source?: unknown;
  status: number;
  headers: Headers;
  request: ApiRequest;
  /** Underlying `Response` for HTTP calls; absent for mocked calls. */
  raw?: Response;
}

/** Which body a transfer event describes: the request body or the response body. */
export type TransferDirection = "upload" | "download";

interface TransferEventBase {
  direction: TransferDirection;
  /** Zero-based attempt number; every retry starts a new attempt with `loaded` back at 0. */
  attempt: number;
  /**
   * Bytes of the body observed so far in this attempt. Upload: bytes the runtime pulled from the
   * request body to hand to the network stack (never a server acknowledgment). Download: bytes
   * read from the response body, after content decoding.
   */
  loaded: number;
  /**
   * Total body size, only when it is trustworthy: a known Blob/File/buffer size for uploads, a
   * finite `Content-Length` on an uncompressed response for downloads. Never estimated.
   */
  total?: number;
}

/**
 * One transfer lifecycle event, delivered to `onTransfer`. Per direction and attempt the order is
 * `start`, `progress`*, then `complete`, `error` or `abort`; `unsupported` replaces the whole
 * sequence when the runtime or transport cannot observe that direction (nothing is faked).
 * `complete` means the body was fully consumed, not that a server processed it.
 */
export type TransferEvent =
  | (TransferEventBase & { phase: "start" | "progress" | "complete" })
  | (TransferEventBase & {
      phase: "error";
      error: Error;
      /** True when the retry policy will start another attempt. */
      willRetry: boolean;
    })
  | (TransferEventBase & { phase: "abort"; reason?: unknown })
  | {
      phase: "unsupported";
      direction: TransferDirection;
      attempt: number;
      /** Why this direction is not observable here. */
      reason: string;
    };

export type TransferPhase = TransferEvent["phase"];

/** Called synchronously for each {@link TransferEvent}. Errors thrown here are ignored. */
export type TransferObserver = (event: TransferEvent) => void | Promise<void>;

/** Event shape a transport reports; the pipeline adds the attempt number and terminal events. */
export type TransportTransferEvent =
  | {
      phase: "start" | "progress" | "complete";
      direction: TransferDirection;
      loaded: number;
      total?: number;
    }
  | { phase: "unsupported"; direction: TransferDirection; reason: string };

export interface TransportRequest {
  security?: { credentials: "omit"; redirect: "error" };
  /**
   * Origins a redirect may lead to without request headers or credentials (see
   * `RequestOptions.redirectOrigins`). The built-in fetch transport follows redirects itself and
   * refuses every other cross-origin destination; a custom transport owns its redirect policy.
   */
  redirectOrigins?: readonly string[];
  url: string;
  method: HttpMethod;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal;
  responseType?: ResponseType;
  /**
   * Opt-in response limits (`maxResponseSize`, `responseAccept`). A transport may enforce them while
   * reading; the pipeline checks again, so one that ignores them still gets a consistent result.
   */
  limits?: { maxResponseBytes?: number; accept?: readonly string[] };
  /**
   * Present only when the caller opted into transfer events. A transport may report byte-level
   * `start` / `progress` / `complete` (or `unsupported`) per direction; one that ignores this field
   * still works, and the pipeline reports the direction as unsupported.
   */
  onTransfer?: (event: TransportTransferEvent) => void;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  raw: Response;
  /** Parsed body according to responseType / content-type. */
  body: unknown;
}

export interface Transport {
  capabilities?: { presigned?: true };
  request(input: TransportRequest): Promise<TransportResponse>;
}

/** Per-call options, always the last argument of an operation. */
export type RequestOptions<TQuery = QueryParams> = {
  transfer?: AdvancedTransferOptions;
  presigned?: PresignedRequest;
  /** Values for path placeholders on this operation. */
  params?: PathParams;
  query?: TQuery;
  /** Highest-precedence headers for this call. */
  headers?: HeadersInitLike;
  signal?: AbortSignal;
  /** Overall budget for the call, including retries and backoff. */
  timeout?: number;
  retry?: number | RetryConfig | false;
  responseType?: ResponseType;
  /** Largest accepted response body in bytes for this call; wins over the operation's. */
  maxResponseSize?: number;
  /**
   * Exact origins this call may be redirected to (for example a CDN the API answers `302` with).
   * A listed destination is followed **without** request headers, cookies, credentials or body and
   * only for `GET` / `HEAD`. Wins over the operation's list. Any other cross-origin redirect fails.
   */
  redirectOrigins?: readonly string[];
  /**
   * Opt in to transfer lifecycle events (upload and download progress, retry attempts, abort and
   * failure). Without it nothing is wrapped or observed. Overrides the operation's `onTransfer`.
   */
  onTransfer?: TransferObserver;
  meta?: Record<string, unknown>;
  /** When true, resolve to `ApiResponse<T>` instead of unwrapped `T`. */
  full?: boolean;
  /**
   * Explicit idempotency key for an operation configured with `idempotency`. Reuse the same key
   * when you retry the same logical write yourself.
   */
  idempotencyKey?: string;
};
