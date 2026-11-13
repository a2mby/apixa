import type { AdvancedTransferFailure } from "../types/advanced-transfer.js";
import type { ApiErrorCode } from "../types/errors.js";
import type { ApiRequest, ApiResponse } from "../types/transport.js";

export class ApiError extends Error {
  advancedTransfer?: AdvancedTransferFailure;
  status?: number;
  code: ApiErrorCode | (string & {});
  data?: unknown;
  request?: ApiRequest;
  response?: ApiResponse<unknown>;
  retryable: boolean;
  attempt?: number;
  /**
   * Set when the call opted into `onTransfer` and a started transfer ended with this error: the
   * direction and the bytes observed so far.
   */
  transfer?: { direction: "upload" | "download"; loaded: number; total?: number };
  override cause?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: ApiErrorCode | (string & {});
      data?: unknown;
      request?: ApiRequest;
      response?: ApiResponse<unknown>;
      retryable?: boolean;
      attempt?: number;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.status = options?.status;
    this.code = options?.code ?? "NETWORK";
    this.data = options?.data;
    // `request` carries the outgoing headers (Authorization, API keys) and body, and `response` the
    // request again. Both stay readable (`error.request`) for middleware and handlers, but are
    // non-enumerable so `console.log(error)`, `util.inspect`, `JSON.stringify` and error reporters
    // that copy own enumerable properties do not leak credentials or request payloads.
    Object.defineProperties(this, {
      request: { value: options?.request, enumerable: false, writable: true, configurable: true },
      response: { value: options?.response, enumerable: false, writable: true, configurable: true },
    });
    this.retryable = options?.retryable ?? false;
    this.attempt = options?.attempt;
    this.cause = options?.cause;
  }
}
