/** Stable public error codes. Check `error.code` rather than message text. */
export type ApiErrorCode =
  | "NETWORK"
  | "HTTP"
  | "PARSE"
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
