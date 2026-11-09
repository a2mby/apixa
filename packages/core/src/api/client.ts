import { ConfigError } from "../errors/index.js";
import { parseBaseURL } from "../http/url.js";
import { MockFileStorage, type MockStore } from "../mock/index.js";
import type { ClientRuntime } from "../request/index.js";
import { createFetchTransport } from "../transport/fetch.js";
import type { LayerOptions } from "../types/definition.js";
import type { Transport } from "../types/transport.js";
import { createResourceClient } from "./resource-client.js";
import { validateResource, validateRoot } from "./validate.js";

/** Mock state of one mocked resource: its records and the client's shared file store. */
export interface MockEntry {
  store: MockStore;
  resource: string;
  files: MockFileStorage;
}

/** Mock state per built client / resource client — scoped, garbage-collected with the client. */
export const mockEntries = new WeakMap<object, readonly MockEntry[]>();

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
    files: new MockFileStorage(),
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
  const all: MockEntry[] = [];
  for (const [name, definition] of Object.entries(config.resources)) {
    validateResource(name, definition);
    const built = createResourceClient(runtime, { name, definition, root });
    const resource = Object.freeze(built.client);
    if (built.store) {
      const entry = { store: built.store, resource: name, files: runtime.files };
      mockEntries.set(resource, [entry]);
      all.push(entry);
    }
    client[name] = resource;
  }
  const frozen = Object.freeze(client);
  mockEntries.set(frozen, all);
  return frozen;
}

function entriesOf(target: object, who: string): readonly MockEntry[] {
  const alias = (target as Record<symbol, object>)[Symbol.for("@apixa/mock-target")];
  const found = mockEntries.get(alias ?? target);
  if (!found || (found.length === 0 && !Object.isFrozen(target))) {
    throw new ConfigError(
      `${who} expects a mocked resource (api.users) or a client created by defineApi().`,
    );
  }
  return found;
}

/**
 * Reset mocked records to their seeded state and drop the files their writes stored. Pass one
 * mocked resource (`api.users`) or a whole client (`api`). Live resources are unaffected.
 */
export function resetMockState(target: object): void {
  for (const { store, files, resource } of entriesOf(target, "resetMock()")) {
    store.reset();
    // The store coordinates reference-aware cleanup through its file lifecycle hook.
    if (!store.resetFiles) files.clear(resource);
  }
}

/** The virtual file store behind a mocked resource or client (`undefined` when nothing is mocked). */
export function mockFileStorage(target: object): MockFileStorage | undefined {
  return entriesOf(target, "mockFiles()")[0]?.files;
}
