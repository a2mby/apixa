/**
 * Plugin seam: resource-level mock keys live here, not in Core's base types.
 * Side-effect import from `@apixa/mocking` / `/register` / `/data` applies this merge.
 */
export {};

declare module "@apixa/core" {
  interface ResourceExtensions {
    /**
     * When true, `@apixa/mocking` must handle this resource (processor or lazy peer).
     * Core never sends mocked resources to the network itself.
     */
    mock?: boolean;
    mockConfig?: {
      type: keyof import("@apixa/core").MockDatasetIds | (string & {});
      /** First N rows, or half-open `{ start, end }`. Overshoot returns all rows. */
      slice?: number | { start: number; end: number };
      pagination?: boolean;
      [key: string]: unknown;
    };
  }
}
