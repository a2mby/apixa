import { ApiError, ConfigError, SchemaValidationError } from "../errors/index.js";
import type { SchemaPhase } from "../errors/index.js";
import type {
  StandardSchemaIssue,
  StandardSchemaResult,
  StandardSchemaV1,
} from "../types/standard-schema.js";

/**
 * The one place Apixa calls a Standard Schema validator. Execution files (pipeline, resource
 * client) call these helpers and never touch `~standard` themselves.
 */

export interface SchemaSite {
  resource: string;
  operation: string;
  phase: SchemaPhase;
}

/** A Standard Schema V1 validator: identified by its `~standard` interface, never by `.parse()`. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const props = (value as { "~standard"?: unknown })["~standard"];
  if (props === null || typeof props !== "object") return false;
  const candidate = props as { version?: unknown; validate?: unknown };
  return candidate.version === 1 && typeof candidate.validate === "function";
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function thrown(site: SchemaSite, cause: unknown): never {
  if (cause instanceof ApiError) throw cause;
  throw new SchemaValidationError({
    ...site,
    issues: [{ message: "The validator threw instead of returning a result." }],
    cause,
  });
}

function call(schema: StandardSchemaV1, value: unknown, site: SchemaSite) {
  try {
    return schema["~standard"].validate(value);
  } catch (cause) {
    return thrown(site, cause);
  }
}

function settle(result: StandardSchemaResult<unknown>, site: SchemaSite): unknown {
  if (result === null || typeof result !== "object") {
    throw new ConfigError(
      `${site.resource}.${site.operation}.schema.${site.phase}: the validator returned an invalid Standard Schema result.`,
    );
  }
  if (result.issues !== undefined) {
    if (!Array.isArray(result.issues)) {
      throw new ConfigError(
        `${site.resource}.${site.operation}.schema.${site.phase}: the validator returned malformed issues.`,
      );
    }
    throw new SchemaValidationError({ ...site, issues: result.issues as StandardSchemaIssue[] });
  }
  return result.value;
}

/** Synchronous validation (query). A validator that answers asynchronously is a configuration error. */
export function validateSync(schema: StandardSchemaV1, value: unknown, site: SchemaSite): unknown {
  const result = call(schema, value, site);
  if (isThenable(result)) {
    // Never leave an unhandled rejection behind: the result is discarded.
    result.then(undefined, () => {});
    throw new ConfigError(
      `${site.resource}.${site.operation}.schema.${site.phase}: query schemas must validate synchronously (the validator returned a Promise).`,
    );
  }
  return settle(result, site);
}

/** Validation where an asynchronous validator is allowed (body, response). */
export async function validateAsync(
  schema: StandardSchemaV1,
  value: unknown,
  site: SchemaSite,
): Promise<unknown> {
  const result = call(schema, value, site);
  let settled: StandardSchemaResult<unknown>;
  try {
    settled = isThenable(result) ? await result : result;
  } catch (cause) {
    return thrown(site, cause);
  }
  return settle(settled, site);
}
