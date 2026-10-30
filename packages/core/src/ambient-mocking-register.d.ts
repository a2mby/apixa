/**
 * Ambient types for the optional `@apixa/mocking` peer.
 * Avoids a typed package dependency (mocking already depends on Core).
 */
declare module "@apixa/mocking/register" {
  import type { Transport } from "./types/transport.js";

  export type ResourceMockSpec = {
    name: string;
    path: string;
    mockConfig: {
      type: string;
      slice?: number | { start: number; end: number };
      pagination?: boolean;
    };
  };

  export function createSelectiveMockTransportFromSpecs(
    specs: ResourceMockSpec[],
    fallback: Transport,
  ): Transport;

  export function enableResourceMocks(): void;
  export function disableResourceMocks(): void;
}
