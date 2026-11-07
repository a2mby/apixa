"use client";

import { HydrationBoundary, type HydrateOptions } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DehydratedState } from "./hydration.js";

export type ApixaHydrationBoundaryProps = {
  /** State produced by `dehydrate(client)` on the server. */
  state?: DehydratedState | null;
  options?: HydrateOptions;
  children?: ReactNode;
};

/** Client boundary that hydrates server-prefetched queries into the surrounding cache. */
export function ApixaHydrationBoundary({ state, options, children }: ApixaHydrationBoundaryProps) {
  return (
    <HydrationBoundary state={state} options={options}>
      {children}
    </HydrationBoundary>
  );
}
