import { createFetchTransport } from "../transport/fetch.js";
import type { Transport } from "../types/transport.js";
import type { DefineApiConfigBag } from "./processors.js";

const RESERVED_KEYS = new Set(["baseURL", "headers", "transport", "timeout"]);

export type PeerResourceMockSpec = {
  name: string;
  path: string;
  mockConfig: {
    type: string;
    size?: number;
    pagination?: boolean;
  };
};

type ResourceBag = {
  path?: string;
  mock?: boolean;
  mockConfig?: {
    type?: string;
    size?: number;
    pagination?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function isResourceBag(value: unknown): value is ResourceBag {
  return Boolean(value && typeof value === "object" && "path" in (value as object));
}

/** True when any resource still has mock / mockConfig keys. */
export function hasUnhandledMockKeys(config: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!isResourceBag(value)) continue;
    if (value.mock === true || value.mockConfig != null) return true;
  }
  return false;
}

/**
 * Validate and extract mock specs; strip mock keys from the config bag.
 * Throws on invalid mock / mockConfig shape (no dataset resolution — that stays in mocking).
 */
export function extractAndStripMockSpecs(config: DefineApiConfigBag): {
  config: DefineApiConfigBag;
  specs: PeerResourceMockSpec[];
} {
  const specs: PeerResourceMockSpec[] = [];
  const next: DefineApiConfigBag = { ...config };

  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!isResourceBag(value)) continue;

    const { mock, mockConfig, ...rest } = value;

    if (mock === true) {
      if (!mockConfig || typeof mockConfig.type !== "string" || !mockConfig.type) {
        throw new Error(
          `Resource "${key}" has mock: true but mockConfig.type is missing. ` +
            `Set mockConfig: { type: "<dataset-id>" } (e.g. "users-sample").`,
        );
      }
      if (typeof rest.path !== "string" || !rest.path) {
        throw new Error(`Resource "${key}" has mock: true but path is missing.`);
      }
      specs.push({
        name: key,
        path: rest.path,
        mockConfig: {
          type: mockConfig.type,
          size: typeof mockConfig.size === "number" ? mockConfig.size : undefined,
          pagination: mockConfig.pagination === true,
        },
      });
    } else if (mockConfig != null) {
      throw new Error(
        `Resource "${key}" has mockConfig but mock is not true. Set mock: true to enable mocking.`,
      );
    }

    next[key] = rest;
  }

  return { config: next, specs };
}

type MockingRegisterModule = {
  createSelectiveMockTransportFromSpecs: (
    specs: PeerResourceMockSpec[],
    fallback: Transport,
  ) => Transport;
};

/** Test hook — override the dynamic import of `@apixa/mocking/register`. */
let mockingRegisterLoader: (() => Promise<MockingRegisterModule>) | undefined;

export function setMockingRegisterLoaderForTests(
  loader: (() => Promise<MockingRegisterModule>) | undefined,
): void {
  mockingRegisterLoader = loader;
}

async function loadMockingRegister(): Promise<MockingRegisterModule> {
  try {
    if (mockingRegisterLoader) {
      return await mockingRegisterLoader();
    }
    // Optional peer — left external by the bundler; ambient types live in ambient-mocking-register.d.ts.
    return (await import("@apixa/mocking/register")) as MockingRegisterModule;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Resource mocks require the optional peer "@apixa/mocking". ` +
        `Install it as a dependency (Core does not embed a mock engine). ` +
        `Original error: ${detail}`,
    );
  }
}

/**
 * Transport that lazy-loads `@apixa/mocking/register` on first request.
 * Keeps `defineApi` synchronous while avoiding a hard Core→mocking dependency.
 */
export function createDeferredPeerMockTransport(
  fallback: Transport,
  specs: PeerResourceMockSpec[],
): Transport {
  let inner: Transport | undefined;
  let loading: Promise<Transport> | undefined;

  return {
    async request(input) {
      if (!inner) {
        loading ??= loadMockingRegister().then((mod) =>
          mod.createSelectiveMockTransportFromSpecs(specs, fallback),
        );
        inner = await loading;
      }
      return inner.request(input);
    },
  };
}

/**
 * When processors left mock keys unhandled, strip them and wrap transport
 * so `@apixa/mocking` is loaded on first request if installed.
 */
export function applyPeerMockBridge(config: DefineApiConfigBag): DefineApiConfigBag {
  if (!hasUnhandledMockKeys(config)) {
    return config;
  }

  const { config: stripped, specs } = extractAndStripMockSpecs(config);
  if (specs.length === 0) {
    return stripped;
  }

  const fallback = stripped.transport ?? createFetchTransport();
  return {
    ...stripped,
    transport: createDeferredPeerMockTransport(fallback, specs),
  };
}
