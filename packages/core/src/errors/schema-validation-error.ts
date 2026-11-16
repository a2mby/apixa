import type { StandardSchemaIssue } from "../types/standard-schema.js";
import { MAX_VIOLATIONS, ValidationError } from "./validation-error.js";

type SchemaErrorOptions = NonNullable<ConstructorParameters<typeof ValidationError>[1]>;

/** Which schema of an operation rejected the value. */
export type SchemaPhase = "body" | "query" | "response";

export interface SchemaValidationErrorInit extends SchemaErrorOptions {
  phase: SchemaPhase;
  resource: string;
  operation: string;
  issues: readonly StandardSchemaIssue[];
}

/** Standard Schema issue path → `a.b[0]`; `$` for the root. */
export function formatIssuePath(path: StandardSchemaIssue["path"]): string {
  if (!path || path.length === 0) return "$";
  let out = "";
  for (const segment of path) {
    const key = typeof segment === "object" && segment !== null ? segment.key : segment;
    if (typeof key === "number") out += `[${key}]`;
    else out += out === "" ? String(key as string | symbol) : `.${String(key as string | symbol)}`;
  }
  return out;
}

/**
 * A request or response did not satisfy an operation's `schema`: `code` is `"VALIDATION_ERROR"` and
 * `phase` names the schema that rejected the value. The message lists paths and counts only; the
 * validator's own messages are on `issues` (never the validated values themselves). A thrown
 * validator keeps the original exception in `cause`.
 */
export class SchemaValidationError extends ValidationError {
  /** `"body"` / `"query"` are rejected before any transport call, `"response"` on the final result. */
  readonly phase: SchemaPhase;
  readonly resource: string;
  readonly operation: string;
  readonly issues: readonly StandardSchemaIssue[];

  constructor(init: SchemaValidationErrorInit) {
    const { phase, resource, operation, issues, ...rest } = init;
    const shown = issues.slice(0, MAX_VIOLATIONS);
    const paths = shown.map((issue) => formatIssuePath(issue.path)).join(", ");
    const count = issues.length > shown.length ? `${shown.length}+` : String(shown.length);
    super(
      `${resource}.${operation}: ${phase} schema validation failed (${count} issue${shown.length === 1 ? "" : "s"}${paths ? `: ${paths}` : ""}).`,
      { ...rest, code: "VALIDATION_ERROR" },
    );
    this.name = "SchemaValidationError";
    this.phase = phase;
    this.resource = resource;
    this.operation = operation;
    this.issues = Object.freeze(shown);
  }
}
