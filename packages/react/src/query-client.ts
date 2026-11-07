import {
  QueryClient as TanStackQueryClient,
  type DefaultOptions,
  type QueryClientConfig as TanStackQueryClientConfig,
} from "@tanstack/react-query";

type QueryDefaults = NonNullable<DefaultOptions["queries"]>;

/**
 * Configuration for Apixa's {@link QueryClient}. Every native TanStack option is accepted. The
 * five shorthand fields set the matching `defaultOptions.queries` entry; an explicit
 * `defaultOptions.queries` value wins over its shorthand. Mutation defaults are never touched.
 */
export type QueryClientConfig = TanStackQueryClientConfig & {
  /** Default `staleTime` for every query (ms). */
  staleTime?: QueryDefaults["staleTime"];
  /** Default `gcTime` for every query (ms). */
  gcTime?: QueryDefaults["gcTime"];
  /** Default retry policy for every query. */
  retry?: QueryDefaults["retry"];
  /** Default `networkMode` for every query. */
  networkMode?: QueryDefaults["networkMode"];
  /** Default `meta` attached to every query. */
  meta?: QueryDefaults["meta"];
};

/**
 * The cache behind Apixa's React integration. It is TanStack Query's `QueryClient` with an
 * ergonomic config, so one instance serves the hooks, the controllers in `@apixa/react/advanced`,
 * optimistic updates and dehydration. There is no second cache.
 *
 * Safe to construct in a Server Component through `@apixa/react/advanced`. Create one per server
 * request; never keep one in module scope on the server.
 */
export class QueryClient extends TanStackQueryClient {
  constructor(config: QueryClientConfig = {}) {
    const { staleTime, gcTime, retry, networkMode, meta, defaultOptions, ...native } = config;
    const shorthand: Record<string, unknown> = { staleTime, gcTime, retry, networkMode, meta };
    for (const key of Object.keys(shorthand))
      if (shorthand[key] === undefined) delete shorthand[key];
    const hasShorthand = Object.keys(shorthand).length > 0;
    super(
      hasShorthand
        ? {
            ...native,
            defaultOptions: {
              ...defaultOptions,
              queries: { ...shorthand, ...defaultOptions?.queries },
            },
          }
        : { ...native, ...(defaultOptions ? { defaultOptions } : {}) },
    );
  }
}
