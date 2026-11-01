/// <reference path="../ambient-mocking-register.d.ts" />
import { createFetchTransport } from "../transport/fetch.js";
import type { Transport } from "../types/transport.js";
import type { DefineApiConfigBag } from "./processors.js";

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

export type PeerMockSlice = number | { start: number; end: number };

export type PeerResourceMockSpec = {
  name: string;
  path: string;
  type: string;
  slice?: PeerMockSlice;
  pagination?: boolean;
};

type ResourceBag = {
  path?: string;
  mock?: unknown;
  /** Core list cap / mock seed — sibling of `path`, not nested under mock. */
  slice?: PeerMockSlice;
  pagination?: boolean;
  mockConfig?: unknown;
  [key: string]: unknown;
};

function pickSlice(value: unknown): PeerMockSlice | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "start" in value &&
    "end" in value
  ) {
    return value as { start: number; end: number };
  }
  // Let `@apixa/mocking` reject invalid shapes when the store is built.
  return value as PeerMockSlice;
}

function isResourceBag(value: unknown): value is ResourceBag {
  return Boolean(value && typeof value === "object" && "path" in (value as object));
}

const LEGACY_HINT = `Use mock: "<dataset-id>" (e.g. mock: "users-mock") and put pagination next to path / slice.`;

/** True when any resource still has mock / legacy mockConfig keys. */
export function hasUnhandledMockKeys(config: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(config)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!isResourceBag(value)) continue;
    if (typeof value.mock === "string") return true;
    if (typeof value.mock === "boolean") return true;
    if (value.mockConfig != null) return true;
  }
  return false;
}

/**
 * Validate and extract mock specs; strip mock keys from the config bag.
 * Throws on invalid / legacy mock shape (no dataset resolution — that stays in mocking).
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

    const { mock, mockConfig, pagination, ...rest } = value;

    if (mockConfig != null) {
      throw new Error(`Resource "${key}" no longer supports mockConfig. ${LEGACY_HINT}`);
    }

    if (typeof mock === "boolean") {
      throw new Error(
        `Resource "${key}": mock must be a dataset id string, not ${mock}. ${LEGACY_HINT}`,
      );
    }

    if (typeof mock === "string") {
      if (!mock) {
        throw new Error(
          `Resource "${key}" has an empty mock id. Set mock: "<dataset-id>" (e.g. "users-mock").`,
        );
      }
      if (typeof rest.path !== "string" || !rest.path) {
        throw new Error(`Resource "${key}" has mock but path is missing.`);
      }
      specs.push({
        name: key,
        path: rest.path,
        type: mock,
        slice: pickSlice(rest.slice),
        pagination: pagination === true,
      });
      // Seed uses `slice`; do not also cap getAll (creates may grow past the seed).
      const { slice: _seedSlice, ...withoutSlice } = rest;
      next[key] = withoutSlice;
    } else if (mock != null) {
      throw new Error(
        `Resource "${key}": mock must be a dataset id string (got ${typeof mock}). ${LEGACY_HINT}`,
      );
    } else {
      // Live resource: keep `slice` so Core can cap getAll array responses.
      // Drop unused `pagination` so it does not linger on the runtime bag.
      next[key] = rest;
    }
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
