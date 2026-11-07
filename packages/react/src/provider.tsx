"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import { QueryClient, type QueryClientConfig } from "./query-client.js";

export type ApixaProviderProps = {
  /** Use this client. When omitted, one is created once from `config` and kept for the lifetime of the provider. */
  client?: QueryClient;
  /** Options for the client Apixa creates. Ignored when `client` is supplied. */
  config?: QueryClientConfig;
  children?: ReactNode;
};

/**
 * Provides Apixa's cache to every Apixa hook below it. Optional: the hooks also work under
 * TanStack's own `QueryClientProvider`.
 */
export function ApixaProvider({ client, config, children }: ApixaProviderProps) {
  const owned = useRef<QueryClient | null>(null);
  if (!client && owned.current === null) owned.current = new QueryClient(config);
  const resolved = client ?? (owned.current as QueryClient);
  return <QueryClientProvider client={resolved}>{children}</QueryClientProvider>;
}
