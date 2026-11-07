"use client";

import { ApixaProvider, QueryClient } from "@apixa/react";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ staleTime: 60_000, retry: false }));
  // TanStack Query devtools hook: lets the browser extension (and the e2e check) read the cache.
  if (typeof window !== "undefined") {
    (window as { __TANSTACK_QUERY_CLIENT__?: QueryClient }).__TANSTACK_QUERY_CLIENT__ = client;
  }
  return <ApixaProvider client={client}>{children}</ApixaProvider>;
}
