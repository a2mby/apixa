import { registerDefineApiProcessor } from "@apixa/core";
import { resourceMockProcessor } from "./processor.js";

let unregister: (() => void) | undefined;

/** Idempotent: wire resource `mock` / `mockConfig` into Core `defineApi`. */
export function enableResourceMocks(): void {
  unregister?.();
  unregister = registerDefineApiProcessor(resourceMockProcessor);
}

/** Test helper. */
export function disableResourceMocks(): void {
  unregister?.();
  unregister = undefined;
}
