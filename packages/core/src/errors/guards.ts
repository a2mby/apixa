import { ApiError } from "./api-error.js";
import { HttpError } from "./http-error.js";
import { MockError } from "./mock-error.js";
import { TimeoutError } from "./timeout-error.js";

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isMockError(error: unknown): error is MockError {
  return error instanceof MockError;
}
