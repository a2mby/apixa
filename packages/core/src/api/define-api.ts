import { createFetchTransport } from "../transport/fetch.js";
import type { ApiRootConfig, ResourceDefinition, ResolvedApiConfig } from "../types/definition.js";
import type { ApiClient, ValidateApiConfig } from "../types/inference.js";
import { createResourceClient } from "./resource-client.js";

const RESERVED_KEYS = new Set(["baseURL", "headers", "transport", "timeout"]);

export function defineApi<const T extends ValidateApiConfig<T> & ApiRootConfig>(
  config: T,
): ApiClient<T> {
  const resolved: ResolvedApiConfig = {
    baseURL: config.baseURL,
    headers: config.headers,
    transport: config.transport ?? createFetchTransport(),
    timeout: config.timeout,
  };

  const client = {} as ApiClient<T>;

  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue;

    (client as Record<string, unknown>)[key] = createResourceClient(
      resolved,
      value as ResourceDefinition,
    );
  }

  return client;
}
