import { ConfigError } from "../errors/index.js";

/** Explicit seed marker, never interpreted from an ordinary string. JSON-safe. */
export interface MockFixtureRef<K extends string = string> {
  readonly $apixaFixture: K;
}
export function mockFixtureRef<const K extends string>(key: K): MockFixtureRef<K> {
  if (typeof key !== "string" || !key)
    throw new ConfigError("Mock fixture key must be a non-empty string.");
  return Object.freeze({ $apixaFixture: key });
}
export interface MockFileFixture {
  readonly content: string | Uint8Array | Blob;
  readonly name: string;
  readonly type?: string;
  readonly lastModified?: number;
}
export type MockFileFixtures = Readonly<
  Record<string, MockFileFixture | (() => MockFileFixture | Promise<MockFileFixture>)>
>;
export function mockFileFixture(
  content: MockFileFixture["content"],
  options: Omit<MockFileFixture, "content">,
): MockFileFixture {
  const fixture = {
    ...options,
    content: content instanceof Uint8Array ? content.slice() : content,
  };
  validateFixture(fixture);
  return Object.freeze(fixture);
}
export function isFixtureRef(value: unknown): value is MockFixtureRef {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "$apixaFixture");
}
export function validateFixture(value: unknown): asserts value is MockFileFixture {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConfigError("Mock file fixture must be a descriptor.");
  const f = value as MockFileFixture;
  if (
    Object.keys(value).some((k) => !["content", "name", "type", "lastModified"].includes(k)) ||
    typeof f.name !== "string" ||
    !f.name ||
    (f.type !== undefined && typeof f.type !== "string") ||
    (f.lastModified !== undefined && (!Number.isFinite(f.lastModified) || f.lastModified < 0)) ||
    !(
      typeof f.content === "string" ||
      f.content instanceof Uint8Array ||
      (typeof Blob !== "undefined" && f.content instanceof Blob)
    )
  )
    throw new ConfigError("Invalid mock file fixture content or metadata.");
}
/** Normalize only marker-bearing seed fields; ordinary entity types are unchanged. */
type ResolveFixtureValue<V> = V extends MockFixtureRef
  ? string
  : V extends readonly unknown[]
    ? Extract<V[number], MockFixtureRef> extends never
      ? V
      : ResolveFixtureValue<V[number]>[]
    : V;
export type ResolveMockFixtures<T> = T extends MockFixtureRef
  ? string
  : T extends object
    ? { [K in keyof T]: ResolveFixtureValue<T[K]> }
    : T;
