import { ConfigError, defineApi } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";

/** Runtime validation for configs TypeScript cannot see (dynamic spreads, untyped JS). */
const build = (config: unknown) => () => defineApi(config as never);
const base = { baseURL: "https://api.example.com" };

describe("configuration fails early with descriptive errors", () => {
  it.each<[string, unknown, RegExp]>([
    ["non-object config", 42, /expects a config object/],
    ["unknown root key", { ...base, timeuot: 5000, resources: {} }, /unknown option "timeuot"/],
    [
      "flat resources",
      { ...base, users: { path: "/users" } },
      /"users" looks like a resource.*resources: \{ users/,
    ],
    ["missing resources", { ...base }, /needs a "resources" object/],
    ["invalid URL", { baseURL: "not a url", resources: {} }, /baseURL "not a url"/],
    [
      "unknown resource key",
      { ...base, resources: { users: { path: "/users", entity: {} } } },
      /resources\.users has unknown option "entity"/,
    ],
    [
      "missing resource path",
      { ...base, resources: { users: {} } },
      /resources\.users\.path must be a string/,
    ],
    [
      "relative resource path",
      { ...base, resources: { users: { path: "users" } } },
      /starting with "\/"/,
    ],
    [
      "unknown operation key",
      {
        ...base,
        resources: { users: { path: "/users", operations: { getById: { methd: "GET" } } } },
      },
      /operations\.getById has unknown option "methd"/,
    ],
    [
      "invalid operation value",
      { ...base, resources: { users: { path: "/users", operations: { getById: 1 } } } },
      /must be true, false, a config object, or a function/,
    ],
    [
      "invalid method",
      {
        ...base,
        resources: { users: { path: "/users", operations: { getById: { method: "FETCH" } } } },
      },
      /method must be one of/,
    ],
    [
      "custom op without method",
      {
        ...base,
        resources: { users: { path: "/users", operations: { archive: { path: "/x" } } } },
      },
      /custom operation "archive" needs a method/,
    ],
    [
      "custom true",
      { ...base, resources: { users: { path: "/users", operations: { archive: true } } } },
      /true cannot create/,
    ],
    [
      "invalid middleware shape",
      { ...base, middleware: { onRequset: () => undefined }, resources: {} },
      /unknown option "onRequset"/,
    ],
    [
      "non-function hook",
      { ...base, responseMiddleware: [1], resources: {} },
      /responseMiddleware\[0\] must be a function/,
    ],
    [
      "invalid transform name",
      { ...base, transforms: { response: { keys: "camel" } }, resources: {} },
      /keys must be one of camelCase/,
    ],
    [
      "unknown transform direction",
      { ...base, transforms: { both: { keys: "camelCase" } }, resources: {} },
      /unknown option "both"/,
    ],
    [
      "invalid pagination mode",
      { ...base, resources: { u: { path: "/u", pagination: true } } },
      /pagination must be "page" or "cursor".*replaced/,
    ],
    [
      "invalid mock dataset id",
      { ...base, resources: { u: { path: "/u", mock: "nope-mock" } } },
      /unknown dataset "nope-mock".*users-mock/,
    ],
    [
      "legacy mock: true",
      { ...base, resources: { u: { path: "/u", mock: true } } },
      /mock: true was removed/,
    ],
    [
      "mock.operations",
      { ...base, resources: { u: { path: "/u", mock: { data: [], operations: {} } } } },
      /belongs in resources\.u\.operations/,
    ],
    [
      "invalid identity key",
      { ...base, resources: { u: { path: "/u", mock: { data: [{ id: 1 }], idKey: "" } } } },
      /idKey must be a non-empty string/,
    ],
    [
      "identity missing in data",
      { ...base, resources: { u: { path: "/u", mock: { data: [{ id: 1 }], idKey: "uuid" } } } },
      /missing identity field "uuid"/,
    ],
    [
      "malformed seed",
      { ...base, resources: { u: { path: "/u", mock: { data: [], seed: { limit: -1 } } } } },
      /seed\.limit must be a non-negative integer/,
    ],
    [
      "unknown seed key",
      { ...base, resources: { u: { path: "/u", mock: { data: [], seed: { take: 1 } } } } },
      /seed has unknown option "take"/,
    ],
    [
      "conflicting flags",
      { ...base, resources: { u: { path: "/u", readOnly: true, writeOnly: true } } },
      /both readOnly and writeOnly/,
    ],
    [
      "unknown group",
      { ...base, resources: { u: { path: "/u", operationGroups: { reads: false } } } },
      /unknown option "reads"/,
    ],
    [
      "invalid timeout",
      { ...base, timeout: -1, resources: {} },
      /timeout must be a non-negative number/,
    ],
    [
      "invalid retry",
      { ...base, retry: { retries: 1.5 }, resources: {} },
      /retry\.retries must be a non-negative integer/,
    ],
    [
      "invalid transport",
      { ...base, transport: {}, resources: {} },
      /transport must be an object with a request/,
    ],
    ["invalid slice", { ...base, resources: { u: { path: "/u", slice: -2 } } }, /slice/],
  ])("%s", (_label, config, message) => {
    expect(build(config)).toThrow(ConfigError);
    expect(build(config)).toThrow(message);
  });

  it("validates inherited operation retry at construction, not on the first request", () => {
    expect(
      build({
        ...base,
        resources: { u: { path: "/u", operations: { getAll: { retry: { retries: -1 } } } } },
      }),
    ).toThrow(/resources\.u\.operations\.getAll\.retry/);
  });

  it("construction is lightweight: no network, no dataset or provider loading", () => {
    const fetchSpy = vi.fn();
    const provider = vi.fn(async () => []);
    defineApi({
      ...base,
      transport: { request: fetchSpy },
      resources: {
        a: { path: "/a", mock: "users-mock" },
        b: { path: "/b", mock: provider },
        c: { path: "/c" },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not mutate the caller's config and returns a frozen client", () => {
    const config = {
      ...base,
      headers: { A: "1" },
      resources: { users: { path: "/users", operations: { getById: false as const } } },
    };
    const snapshot = JSON.stringify(config);
    const api = defineApi(config);
    expect(JSON.stringify(config)).toBe(snapshot);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.users)).toBe(true);
    expect(() => {
      (api as unknown as Record<string, unknown>).users = {};
    }).toThrow();
  });
});
