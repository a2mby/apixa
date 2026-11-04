import {
  COMPOSED_BUILTINS,
  createComposedBuiltins,
  createFunctionOperationFn,
  createOperationFn,
  expandOperations,
  resolveOperation,
} from "../operation/index.js";
import type { ExpandedOperation, OperationInput } from "../operation/index.js";
import type {
  ResolvedApiConfig,
  ResolvedResourceConfig,
  ResourceRuntimeInput,
} from "../types/definition.js";
import { applyResourceSliceToListResult } from "../utils/slice.js";

export function createResourceClient(api: ResolvedApiConfig, resource: ResourceRuntimeInput) {
  const client: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const resourceConfig: ResolvedResourceConfig = {
    headers: resource.headers,
    timeout: resource.timeout,
    retry: resource.retry,
  };

  const operations = expandOperations(
    resource.operations as Record<string, OperationInput> | undefined,
    {
      readOnly: resource.readOnly === true,
    },
  );

  const buildOne = (name: string, definition: ExpandedOperation) =>
    typeof definition === "function"
      ? createFunctionOperationFn(api, resourceConfig, resource.path, definition)
      : createOperationFn(api, resourceConfig, resolveOperation(name, resource.path, definition));

  // Build every non-composed operation first — in particular `getById` / `getAll` — so the
  // composed builtins below can delegate to the resource's actually-resolved functions instead
  // of hardcoding a convention wire shape, and therefore honor any override of either.
  const composedNames = new Set(Object.keys(COMPOSED_BUILTINS));
  for (const [name, definition] of Object.entries(operations)) {
    if (composedNames.has(name)) continue;

    const run = buildOne(name, definition);
    if (name === "getAll" && resource.slice !== undefined) {
      client[name] = async (...args: unknown[]) => {
        const data = await run(...args);
        return applyResourceSliceToListResult(data, resource.slice);
      };
    } else {
      client[name] = run;
    }
  }

  const resolvedComposed = createComposedBuiltins({
    getById: client.getById,
    getAll: client.getAll,
  });

  for (const name of composedNames) {
    const definition = operations[name];
    if (definition === undefined) continue; // removed via `false`

    const isUnoverriddenDefault = definition === COMPOSED_BUILTINS[name];
    const fn = isUnoverriddenDefault ? resolvedComposed[name]! : definition;
    client[name] =
      typeof fn === "function"
        ? createFunctionOperationFn(api, resourceConfig, resource.path, fn)
        : createOperationFn(api, resourceConfig, resolveOperation(name, resource.path, fn));
  }

  return client;
}
