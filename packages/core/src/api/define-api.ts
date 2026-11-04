import { createFetchTransport } from "../transport/fetch.js";
import type {
  ApiRootConfig,
  ApiStateOf,
  ResolvedApiConfig,
  ResourceRuntimeInput,
} from "../types/definition.js";
import type { ApiClient, ApiInput, ValidationArgs } from "../types/inference.js";
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

function toHttpResource(key: string, value: Record<string, unknown>): ResourceRuntimeInput {
  if (typeof value.path !== "string" || value.path === "") {
    throw new Error(
      `defineApi: resource "${key}" is missing a string "path". Every top-level resource needs ` +
        `a path (e.g. "/${key}") so Apixa can generate its operations.`,
    );
  }

  const resource: ResourceRuntimeInput = {
    path: value.path,
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
  if (value.slice !== undefined) {
    resource.slice = value.slice as ResourceRuntimeInput["slice"];
  }
  if (value.readOnly !== undefined) {
    resource.readOnly = value.readOnly as boolean;
  }
  if (value.writeOnly !== undefined) resource.writeOnly = value.writeOnly as boolean;
  if (value.defaultOperations !== undefined)
    resource.defaultOperations = value.defaultOperations as boolean;
  if (value.operationGroups !== undefined)
    resource.operationGroups = value.operationGroups as ResourceRuntimeInput["operationGroups"];
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
        `Install "@apixa/mocking" or remove mock from the resource definition.`,
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
      toHttpResource(key, value as Record<string, unknown>),
    );
  }

  return client;
}

/**
 * Zustand-style explicit state: `defineApi<AppApi>()({ … })`.
 * Types live on `AppApi`; the runtime object is `ApiInput<AppApi>`.
 */
export function defineApi<T extends ApiStateOf<T>>(): <const Config extends ApiInput<T>>(
  config: Config,
  ...validation: ValidationArgs<T, NoInfer<Config>>
) => ApiClient<T, Config>;

/**
 * Infer the client from the runtime config alone (payload types stay `unknown`
 * unless you use the explicit-state overload above).
 */
export function defineApi<const Config extends ApiRootConfig>(
  config: Config,
  ...validation: ValidationArgs<NoInfer<Config>, NoInfer<Config>>
): ApiClient<Config, Config>;

export function defineApi(
  configOrNothing?: ApiRootConfig & Record<string, unknown>,
  ..._validation: unknown[]
): unknown {
  if (configOrNothing === undefined) {
    return (config: ApiRootConfig & Record<string, unknown>) => buildClient(config);
  }
  return buildClient(configOrNothing);
}
