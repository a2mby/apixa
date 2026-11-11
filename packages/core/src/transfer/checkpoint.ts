import { ConfigError, ValidationError } from "../errors/index.js";
import type { TransferCheckpoint, TransferPartAck } from "../types/advanced-transfer.js";

export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
function keys(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    throw new ConfigError("Invalid transfer checkpoint metadata.");
  }
}
export function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
export function validateAck(
  value: unknown,
  size: number,
  chunkSize: number,
  count: number,
): asserts value is TransferPartAck {
  keys(value, ["index", "offset", "size", "etag", "checksum", "verification"]);
  if (
    !integer(value.index) ||
    value.index >= count ||
    value.offset !== value.index * chunkSize ||
    value.size !== Math.min(chunkSize, size - value.offset) ||
    !["unverified", "local", "server"].includes(String(value.verification)) ||
    (value.etag !== undefined && (typeof value.etag !== "string" || value.etag.length > 2048)) ||
    (value.checksum !== undefined &&
      (typeof value.checksum !== "string" || !/^[a-f0-9]{64}$/.test(value.checksum)))
  ) {
    throw new ValidationError("Invalid or conflicting transfer part acknowledgment.");
  }
}
export function validateCheckpoint(
  value: unknown,
  maxParts: number,
): asserts value is TransferCheckpoint {
  keys(value, [
    "version",
    "revision",
    "protocol",
    "resource",
    "operation",
    "session",
    "source",
    "chunkSize",
    "parts",
  ]);
  if (
    value.version !== 1 ||
    !integer(value.revision) ||
    !integer(value.chunkSize, 1) ||
    typeof value.resource !== "string" ||
    typeof value.operation !== "string"
  )
    throw new ConfigError("Incompatible transfer checkpoint.");
  keys(value.protocol, ["id", "version"]);
  keys(value.session, ["id", "expiresAt"]);
  keys(value.source, ["size", "type", "name", "lastModified", "manifest"]);
  if (
    typeof value.protocol.id !== "string" ||
    !integer(value.protocol.version, 1) ||
    typeof value.session.id !== "string" ||
    !value.session.id ||
    value.session.id.length > 2048 ||
    (value.session.expiresAt !== undefined && !integer(value.session.expiresAt)) ||
    !integer(value.source.size) ||
    typeof value.source.type !== "string" ||
    (value.source.name !== undefined && typeof value.source.name !== "string") ||
    (value.source.lastModified !== undefined && !integer(value.source.lastModified)) ||
    !Array.isArray(value.source.manifest) ||
    value.source.manifest.length > maxParts ||
    value.source.manifest.some(
      (hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash),
    ) ||
    !Array.isArray(value.parts) ||
    value.parts.length > maxParts
  )
    throw new ConfigError("Invalid transfer checkpoint fields.");
  const count = Math.max(1, Math.ceil(value.source.size / value.chunkSize));
  if (
    count > maxParts ||
    value.source.manifest.length !== count ||
    JSON.stringify(value).length > 4 * 1024 * 1024
  )
    throw new ConfigError("Transfer checkpoint exceeds its limits.");
  const indices = new Set<number>();
  for (const part of value.parts) {
    validateAck(part, value.source.size, value.chunkSize, count);
    if (indices.has(part.index)) throw new ConfigError("Duplicate checkpoint part.");
    indices.add(part.index);
  }
}
