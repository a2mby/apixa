/** Stable public error codes. Check `error.code` rather than message text. */
export type ApiErrorCode =
  | "NETWORK"
  | "HTTP"
  | "PARSE"
  /** Parsed data failed the operation's expected response structure. */
  | "RESPONSE_SHAPE"
  | "VALIDATION"
  | "TIMEOUT"
  | "ABORT"
  /** Invalid client configuration (thrown by `defineApi()` / `defineApis()`). */
  | "CONFIG"
  /** A header provider threw or rejected. */
  | "HEADERS"
  /** Request blocked before transport: destination outside the API origin. */
  | "SECURITY"
  /** Key transformation failed (for example two keys collapse into one). */
  | "TRANSFORM"
  /** A request body could not be encoded (unsupported value, or binary under `dataFormat: "json"`). */
  | "SERIALIZATION"
  /** Mock record missing (`status: 404`). */
  | "MOCK_NOT_FOUND"
  /** Mock record id already exists (`status: 409`). */
  | "MOCK_DUPLICATE_ID"
  /** Mock input or stored data is invalid (`status: 400`). */
  | "MOCK_INVALID_INPUT"
  /** The mock engine cannot simulate this request (`status: 501`). Never falls back to HTTP. */
  | "MOCK_UNSUPPORTED"
  /** Loading mock data (dataset, provider) failed. The next call retries the load. */
  | "MOCK_LOAD";

/** Stable codes of a {@link FileViolation}. */
export type FileViolationCode =
  | "FILE_TOO_LARGE"
  | "FILE_TOO_SMALL"
  | "TOO_MANY_FILES"
  | "TOO_FEW_FILES"
  | "TOTAL_TOO_LARGE"
  | "BODY_TOO_LARGE"
  | "TYPE_NOT_ALLOWED"
  | "EXTENSION_NOT_ALLOWED"
  | "UNSAFE_FILENAME"
  | "RESPONSE_TOO_LARGE"
  | "RESPONSE_TYPE_NOT_ALLOWED";

/**
 * One broken file rule. It names a location and numbers only: never file contents, and not file
 * names (`path` is built from body keys and array indices, like `$.gallery[2]`).
 */
export interface FileViolation {
  code: FileViolationCode;
  /** Location in the request body (`$` for the whole body or response). */
  path: string;
  /** The configured limit, when the rule is numeric. */
  limit?: number;
  /** The observed value (for a cut-off stream: bytes seen when it was stopped, at least `limit + 1`). */
  actual?: number;
  /** Which sub-rule failed, for example `"separator"` or `"double-extension"` for `UNSAFE_FILENAME`. */
  rule?: string;
}
