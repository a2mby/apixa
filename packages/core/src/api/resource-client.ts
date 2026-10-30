import { createOperationFn, expandOperations, resolveOperation } from "../operation/index.js";
import type {
  OperationDefinition,
  ResolvedApiConfig,
  ResolvedResourceConfig,
  ResourceRuntimeInput,
} from "../types/definition.js";

export function createResourceClient(api: ResolvedApiConfig, resource: ResourceRuntimeInput) {
  const client: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const resourceConfig: ResolvedResourceConfig = {
    headers: resource.headers,
    timeout: resource.timeout,
    retry: resource.retry,
  };

  const operations = expandOperations(
    resource.operations as Record<string, OperationDefinition> | undefined,
  );

  for (const [name, definition] of Object.entries(operations)) {
    const operation = resolveOperation(name, resource.path, definition);
    client[name] = createOperationFn(api, resourceConfig, operation);
  }

  return client;
}
