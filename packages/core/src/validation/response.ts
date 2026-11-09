import { fileValidationError, type ValidationError } from "../errors/index.js";
import { trustworthyTotal } from "../transfer/counting.js";
import { baseMime, mimeMatches } from "./rules.js";

export interface ResponseLimits {
  maxResponseBytes?: number;
  accept?: readonly string[];
}

export function responseTooLarge(limit: number, actual?: number): ValidationError {
  return fileValidationError([
    { code: "RESPONSE_TOO_LARGE", path: "$", limit, ...(actual !== undefined ? { actual } : {}) },
  ]);
}

/**
 * The head of a successful response against its limits: a trustworthy `Content-Length` over the
 * limit, or a declared `Content-Type` outside the allow-list. Both headers are server-declared, so
 * this is an early reject; counting the body remains the authoritative check.
 */
export function checkResponseHead(
  headers: Headers,
  status: number,
  method: string,
  limits: ResponseLimits | undefined,
): ValidationError | undefined {
  if (!limits) return undefined;
  if (limits.maxResponseBytes !== undefined) {
    const total = trustworthyTotal(headers, status, method);
    if (total !== undefined && total > limits.maxResponseBytes) {
      return responseTooLarge(limits.maxResponseBytes, total);
    }
  }
  if (limits.accept && limits.accept.length > 0 && status !== 204 && status !== 205) {
    const type = baseMime(headers.get("content-type") ?? "");
    if (!mimeMatches(limits.accept, type)) {
      return fileValidationError([
        {
          code: "RESPONSE_TYPE_NOT_ALLOWED",
          path: "$",
          rule: type === "" ? "unknown-type" : "accept",
        },
      ]);
    }
  }
  return undefined;
}

/** Byte size of a fully read body (`Blob`, `ArrayBuffer`, text); `undefined` when it cannot be known. */
export function bodyByteSize(body: unknown): number | undefined {
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  return undefined;
}
