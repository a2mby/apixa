import {
  createBuiltinStrategy,
  createFunctionOperationFn,
  createOperationFn,
  expandOperations,
  isStrategyBuiltin,
  resolveOperation,
} from "../operation/index.js";
import type { OperationInput } from "../operation/index.js";
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
      defaultOperations: resource.defaultOperations,
      readOnly: resource.readOnly,
      writeOnly: resource.writeOnly,
      operationGroups: resource.operationGroups,
    },
  );

  for (const [name, definition] of Object.entries(operations)) {
    const run =
      typeof definition === "function"
        ? createFunctionOperationFn(api, resourceConfig, resource.path, definition)
        : isStrategyBuiltin(name)
          ? createBuiltinStrategy(
              name,
              api,
              resourceConfig,
              resolveOperation(name, resource.path, definition),
              resource.path,
            )
          : createOperationFn(
              api,
              resourceConfig,
              resolveOperation(name, resource.path, definition),
            );

    client[name] =
      name === "getAll" && resource.slice !== undefined
        ? async (...args: unknown[]) =>
            applyResourceSliceToListResult(await run(...args), resource.slice)
        : run;
  }

  return client;
}
