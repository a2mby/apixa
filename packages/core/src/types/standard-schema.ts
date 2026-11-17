/**
 * Standard Schema V1 (https://standardschema.dev), declared here as types only so Apixa has no
 * runtime or type dependency on any validation library. Structurally identical to
 * `@standard-schema/spec`: Zod, Valibot, ArkType and other compliant validators satisfy it.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
    options?: { readonly libraryOptions?: Record<string, unknown> | undefined } | undefined,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

export type StandardSchemaResult<Output> = StandardSchemaSuccess<Output> | StandardSchemaFailure;

export interface StandardSchemaSuccess<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

export interface StandardSchemaFailure {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

/** One reported problem. `path` is the standardized location inside the validated value. */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaPathSegment> | undefined;
}

export interface StandardSchemaPathSegment {
  readonly key: PropertyKey;
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** What callers supply (`schema.body`, `schema.query`). */
export type InferSchemaInput<S extends StandardSchemaV1> = NonNullable<
  S["~standard"]["types"]
>["input"];

/** What the validator produces (`schema.response`, and the value the pipeline continues with). */
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<
  S["~standard"]["types"]
>["output"];

/** Per-operation schemas (explicit object form only). Path parameters stay outside schemas. */
export interface OperationSchema {
  /** Validates the request body before any transformation, serialization or dispatch (async allowed). */
  body?: StandardSchemaV1;
  /** Validates caller query values before defaults and pagination are composed (must be synchronous). */
  query?: StandardSchemaV1;
  /** Validates the normalized response payload (async allowed); its output is the result type. */
  response?: StandardSchemaV1;
  /**
   * Validates a non-success HTTP body. `false` turns off an inherited resource error schema.
   * A failure here is an error-phase schema error, not a successful result and not a request
   * `ValidationError`.
   */
  error?: StandardSchemaV1 | false;
  /** `false` skips the resource entity schema for this operation. */
  entity?: false;
}

/**
 * Resource-level schemas. `response` is the entity validator, not an operation result schema.
 * `body` and `query` are rejected here: they differ per operation.
 */
export interface ResourceSchema {
  response?: StandardSchemaV1;
  error?: StandardSchemaV1;
}
