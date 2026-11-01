import type { DefineApiConfigBag, DefineApiProcessor } from "@apixa/core";
import { applyResourceMocksToConfig } from "./bridge.js";

/**
 * Core defineApi processor: resource `mock: "<dataset-id>"` → selective Transport.
 * Strips mock keys so Core never treats them as HTTP options.
 */
export const resourceMockProcessor: DefineApiProcessor = (config: DefineApiConfigBag) =>
  applyResourceMocksToConfig(config);
