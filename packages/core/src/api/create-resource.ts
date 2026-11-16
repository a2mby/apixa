import type { ResourceDefinition, ResourceEntityBrand } from "../types/definition.js";

/**
 * A resource definition that carries its entity type. Call it as `createResource<User>()({ path })`.
 * The returned value is that same object: paths, operations, and pagination behave exactly as they do
 * when written inline. Root settings (headers, retry, response hooks, transforms, and the resource
 * `paginationConfig`) still inherit root → resource → operation. The entity type argument lets
 * `defineApi({ resources })` infer it without `defineApi<ApiState>()`.
 *
 * The extra call is what keeps the resource's own literal types. An explicit `defineApi<ApiState>()`
 * entry for the same resource still wins.
 */
export function createResource<T>(): <const R extends ResourceDefinition>(
  definition: R,
) => R & ResourceEntityBrand<T> {
  return (definition) => definition as typeof definition & ResourceEntityBrand<T>;
}
