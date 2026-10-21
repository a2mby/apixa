import { AbortError, ApiError, TimeoutError } from "../errors/index.js";
import type { RequestConfig } from "../types/transport.js";

export function isTimeoutLike(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") {
    const reason = getAbortReason(error);
    if (reason instanceof TimeoutError) {
      return true;
    }
    if (reason instanceof DOMException && reason.name === "TimeoutError") {
      return true;
    }
    if (typeof reason === "string" && reason.toLowerCase().includes("timed out")) {
      return true;
    }
  }
  return false;
}

export function isAbortLike(error: unknown): boolean {
  if (error instanceof AbortError) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return false;
}

function getAbortReason(error: Error): unknown {
  if ("cause" in error) {
    return (error as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Normalize transport / abort failures into Core error types. */
export function classifyRequestError(error: unknown, request: RequestConfig): never {
  if (error instanceof ApiError) {
    error.request ??= request;
    throw error;
  }

  if (isTimeoutLike(error)) {
    throw new TimeoutError("Request timed out", { request, cause: error });
  }

  if (isAbortLike(error)) {
    throw new AbortError("Request was aborted", { request, cause: error });
  }

  throw new ApiError(error instanceof Error ? error.message : "Unknown error", {
    request,
    cause: error,
  });
}
