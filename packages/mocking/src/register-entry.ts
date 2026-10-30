/**
 * Stable entry for Core’s optional peer lazy-load.
 * Registers the defineApi processor and built-in typed presets.
 */
import "./core-augmentation.js";
import { ensureBuiltinPresets } from "./presets/builtins.js";
import { enableResourceMocks } from "./register.js";

ensureBuiltinPresets();
enableResourceMocks();

export { enableResourceMocks, disableResourceMocks } from "./register.js";
export {
  applyResourceMocksToConfig,
  createSelectiveMockTransportFromSpecs,
  type ResourceMockSpec,
} from "./bridge.js";
