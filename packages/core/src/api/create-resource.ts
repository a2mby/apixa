import type { ResourceDefinition, ResourceEntityBrand } from "../types/definition.js";
import type { InferSchemaOutput, StandardSchemaV1 } from "../types/standard-schema.js";

type SchemaEntity<R> = R extends { schema: { response: infer S extends StandardSchemaV1 } }
  ? InferSchemaOutput<S>
  : unknown;

/**
 * A resource definition that carries its entity type.
 *
 * `createResource<User>()({ path })` attaches an explicit entity. `createResource({ path, schema })`
 * attaches the `schema.response` output when that schema is present. The returned value is the same
 * object. An explicit `defineApi<ApiState>()` entry for the same resource still wins.
 */
export function createResource<const R extends ResourceDefinition>(
  definition: R,
): R & ResourceEntityBrand<SchemaEntity<R>>;
export function createResource<T>(): <const R extends ResourceDefinition>(
  definition: R,
) => R & ResourceEntityBrand<T>;
export function createResource(definition?: ResourceDefinition) {
  if (definition === undefined) return (inner: ResourceDefinition) => inner;
  return definition;
}
