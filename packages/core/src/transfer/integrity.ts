import { ConfigError } from "../errors/index.js";
/** Hash one bounded slice; callers schedule at most one additional hash buffer. */
export async function digestPart(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new ConfigError("SHA-256 requires crypto.subtle in this runtime.");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
