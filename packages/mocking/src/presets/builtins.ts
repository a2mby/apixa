import { dataset as usersMock } from "../data/users-mock.js";
import { dataset as usersSample } from "../data/users.js";
import { registerDatasetPreset } from "./registry.js";

/** Idempotent — safe after `clearDatasetPresets()` in tests. */
export function ensureBuiltinPresets(): void {
  registerDatasetPreset("users-sample", usersSample);
  registerDatasetPreset("users-mock", usersMock);
}
