"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: false } },
  }));
  // TanStack Query devtools hook: lets the browser extension (and the e2e check) read the cache.
  if (typeof window !== "undefined") {
    (window as { __TANSTACK_QUERY_CLIENT__?: QueryClient }).__TANSTACK_QUERY_CLIENT__ = client;
  }
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
