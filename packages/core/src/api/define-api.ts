import { createFetchTransport } from "../transport/fetch.js";
import type {
  ApiRootConfig,
  ApiState,
  ResolvedApiConfig,
  ResourceRuntimeInput,
} from "../types/definition.js";
import type { ApiClient, ApiInput } from "../types/inference.js";
import { applyPeerMockBridge, hasUnhandledMockKeys } from "./peer-mocking.js";
import { applyDefineApiProcessors } from "./processors.js";
import { createResourceClient } from "./resource-client.js";

const RESERVED_KEYS = new Set([
  "baseURL",
  "headers",
  "transport",
  "timeout",
  "retry",
  "middleware",
  "queryArrayFormat",
  "querySerializer",
]);

function toHttpResource(value: Record<string, unknown>): ResourceRuntimeInput {
  const resource: ResourceRuntimeInput = {
    path: value.path as string,
  };
  if (value.operations !== undefined) {
    resource.operations = value.operations as ResourceRuntimeInput["operations"];
  }
  if (value.headers !== undefined) {
    resource.headers = value.headers as ResourceRuntimeInput["headers"];
  }
  if (value.timeout !== undefined) {
    resource.timeout = value.timeout as number;
  }
  if (value.retry !== undefined) {
    resource.retry = value.retry as ResourceRuntimeInput["retry"];
  }
  return resource;
}

function buildClient<T>(raw: ApiRootConfig & Record<string, unknown>): ApiClient<T> {
  let config = applyDefineApiProcessors({ ...raw });

  if (hasUnhandledMockKeys(config)) {
    config = applyPeerMockBridge(config);
  }

  if (hasUnhandledMockKeys(config)) {
    throw new Error(
      `Resource mock keys remain unhandled after the optional @apixa/mocking peer bridge. ` +
        `Install "@apixa/mocking" or remove mock / mockConfig from the resource definition.`,
    );
  }

  const resolved: ResolvedApiConfig = {
    baseURL: config.baseURL,
    headers: config.headers,
    transport: config.transport ?? createFetchTransport(),
    timeout: config.timeout,
    retry: config.retry,
    middleware: config.middleware,
    queryArrayFormat: config.queryArrayFormat,
    querySerializer: config.querySerializer,
  };

  const client = {} as ApiClient<T>;

  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!value || typeof value !== "object") continue;

    (client as Record<string, unknown>)[key] = createResourceClient(
      resolved,
      toHttpResource(value as Record<string, unknown>),
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
