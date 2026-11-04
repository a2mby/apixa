import { ConfigError } from "../errors/index.js";
import { parseBaseURL } from "../http/url.js";
import type { MockStore } from "../mock/index.js";
import type { ClientRuntime } from "../request/index.js";
import { createFetchTransport } from "../transport/fetch.js";
import type { LayerOptions } from "../types/definition.js";
import type { Transport } from "../types/transport.js";
import { createResourceClient } from "./resource-client.js";
import { validateResource, validateRoot } from "./validate.js";

/** Mock stores per built client / resource client — scoped, garbage-collected with the client. */
const stores = new WeakMap<object, readonly MockStore[]>();

/**
 * The single client-construction engine behind `defineApi()` and `defineApis()`. Validates
 * everything, resolves every operation once, and returns a frozen client. No network calls and
 * no dataset loading happen here.
 */
export function buildClient(config: unknown): Record<string, Record<string, unknown>> {
  validateRoot(config);
  const base = parseBaseURL(config.baseURL);
  const runtime: ClientRuntime = {
    base,
    transport: (config.transport as Transport | undefined) ?? createFetchTransport(),
    queryArrayFormat:
      (config.queryArrayFormat as ClientRuntime["queryArrayFormat"] | undefined) ?? "repeat",
    querySerializer: config.querySerializer as ClientRuntime["querySerializer"],
  };
  const root: LayerOptions = {
    headers: config.headers as LayerOptions["headers"],
    timeout: config.timeout as number | undefined,
    retry: config.retry as LayerOptions["retry"],
    middleware: config.middleware as LayerOptions["middleware"],
    requestMiddleware: config.requestMiddleware as LayerOptions["requestMiddleware"],
    responseMiddleware: config.responseMiddleware as LayerOptions["responseMiddleware"],
    transforms: config.transforms as LayerOptions["transforms"],
  };

  const client: Record<string, Record<string, unknown>> = {};
  const all: MockStore[] = [];
  for (const [name, definition] of Object.entries(config.resources)) {
    validateResource(name, definition);
    const built = createResourceClient(runtime, { name, definition, root });
    const resource = Object.freeze(built.client);
    if (built.store) {
      stores.set(resource, [built.store]);
      all.push(built.store);
    }
    client[name] = resource;
  }
  const frozen = Object.freeze(client);
  stores.set(frozen, all);
  return frozen;
}

/**
 * Reset mocked records to their seeded state. Pass one mocked resource (`api.users`) or a whole
 * client (`api`) to reset every mocked resource on it. Live resources are unaffected.
 */
export function resetMockState(target: object): void {
  const found = stores.get(target);
  if (!found || (found.length === 0 && !Object.isFrozen(target))) {
    throw new ConfigError(
      "resetMock() expects a mocked resource (api.users) or a client created by defineApi().",
    );
  }
  for (const store of found) store.reset();
}
