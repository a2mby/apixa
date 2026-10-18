import { createFetchTransport } from "../transport/fetch.js";
import type {
  ApiRootConfig,
  ApiState,
  ResourceDefinition,
  ResolvedApiConfig,
} from "../types/definition.js";
import type { ApiClient, ApiInput } from "../types/inference.js";
import { createResourceClient } from "./resource-client.js";

const RESERVED_KEYS = new Set(["baseURL", "headers", "transport", "timeout"]);

function buildClient<T>(config: ApiRootConfig & Record<string, unknown>): ApiClient<T> {
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

/**
 * Zustand-style explicit state: `defineApi<AppApi>()({ … })`.
 * Types live on `AppApi`; the runtime object is `ApiInput<AppApi>`.
 */
export function defineApi<T extends ApiState>(): (config: ApiInput<T>) => ApiClient<T>;

/**
 * Infer the client from the runtime config alone (payload types stay `unknown`
 * unless you use the explicit-state overload above).
 */
export function defineApi<const T extends ApiRootConfig>(config: T): ApiClient<T>;

export function defineApi(configOrNothing?: ApiRootConfig & Record<string, unknown>): unknown {
  if (configOrNothing === undefined) {
    return (config: ApiRootConfig & Record<string, unknown>) => buildClient(config);
  }
  return buildClient(configOrNothing);
}
