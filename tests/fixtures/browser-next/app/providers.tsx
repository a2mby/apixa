"use client";

import { ApixaProvider, QueryClient } from "apixa/react";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ staleTime: 60_000, retry: false }));
  if (typeof window !== "undefined") {
    (window as { __TANSTACK_QUERY_CLIENT__?: QueryClient }).__TANSTACK_QUERY_CLIENT__ = client;
  }
  return <ApixaProvider client={client}>{children}</ApixaProvider>;
}
