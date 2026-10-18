import type { ApiRootConfig } from "../types/definition.js";

/** Mutable defineApi config bag (root + resources) before Core builds the client. */
export type DefineApiConfigBag = ApiRootConfig & Record<string, unknown>;

/**
 * Integration hook: transform config before Core builds resource clients.
 * Used by `@apixa/mocking` to honor resource `mock` / `mockConfig` without Core implementing mocks.
 */
export type DefineApiProcessor = (config: DefineApiConfigBag) => DefineApiConfigBag;

const processors: DefineApiProcessor[] = [];

export function registerDefineApiProcessor(processor: DefineApiProcessor): () => void {
  processors.push(processor);
  return () => {
    const index = processors.indexOf(processor);
    if (index >= 0) processors.splice(index, 1);
  };
}

/** Test helper — clears all processors. */
export function clearDefineApiProcessors(): void {
  processors.length = 0;
}

export function applyDefineApiProcessors(config: DefineApiConfigBag): DefineApiConfigBag {
  let next = config;
  for (const processor of processors) {
    next = processor(next);
  }
  return next;
}
