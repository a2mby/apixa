import type { ApiErrorCode } from "../types/errors.js";
import type { ApiResponse, RequestConfig } from "../types/transport.js";

export class ApiError extends Error {
  status?: number;
  code: ApiErrorCode | (string & {});
  data?: unknown;
  request?: RequestConfig;
  response?: ApiResponse<unknown>;
  retryable: boolean;
  attempt?: number;
  override cause?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: ApiErrorCode | (string & {});
      data?: unknown;
      request?: RequestConfig;
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
    this.request = options?.request;
    this.response = options?.response;
    this.retryable = options?.retryable ?? false;
    this.attempt = options?.attempt;
    this.cause = options?.cause;
  }
}
