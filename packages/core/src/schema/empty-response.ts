import type { StandardSchemaV1 } from "../types/standard-schema.js";

const EMPTY_RESPONSE = Symbol.for("apixa.emptyResponse");

/** `true` for a value that carries no response body: `undefined`, `null`, `""`, an empty Blob / buffer. */
export function isEmptyBody(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size === 0;
  if (value instanceof ArrayBuffer) return value.byteLength === 0;
  return false;
}

/**
 * Declares that an operation intentionally returns **no response body**:
 * `schema: { response: emptyResponse }`. The call resolves to `void`; a `204` / `205` (or any
 * success with an empty body) is accepted, and a response that does carry a body is rejected as a
 * response-phase `VALIDATION_ERROR`. Without it, an empty response on an operation that promises
 * an entity, a list or a count fails instead of resolving to `null`.
 */
export const emptyResponse: StandardSchemaV1<unknown, void> = Object.freeze({
  [EMPTY_RESPONSE]: true,
  "~standard": Object.freeze({
    version: 1 as const,
    vendor: "apixa",
    validate: (value: unknown) =>
      isEmptyBody(value)
        ? { value: undefined }
        : { issues: [{ message: "Expected an empty response body." }] },
  }),
});

/** The `emptyResponse` marker (also recognized across duplicated bundles). */
export function isEmptyResponse(schema: unknown): boolean {
  return (
    schema !== null &&
    typeof schema === "object" &&
    (schema as Record<symbol, unknown>)[EMPTY_RESPONSE] === true
  );
}
