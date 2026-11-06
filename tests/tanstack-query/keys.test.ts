import { describe, expect, it } from "vitest";
import { createResourceKeys } from "../../packages/tanstack-query/src/keys.js";
import { defineApi } from "@apixa/core";
import { createResourceQueryOptions } from "../../packages/tanstack-query/src/query-options.js";

describe("createResourceKeys", () => {
  it("builds hierarchical keys with optional scope and list query", () => {
    const keys = createResourceKeys({
      queryKey: ["users"],
      scope: ["tenant", "acme"],
    });

    expect(keys.all()).toEqual(["tenant", "acme", "users"]);
    expect(keys.lists()).toEqual(["tenant", "acme", "users", "list"]);
    expect(keys.list()).toEqual(["tenant", "acme", "users", "list"]);
    expect(keys.list({ active: true })).toEqual([
      "tenant",
      "acme",
      "users",
      "list",
      { active: true },
    ]);
    expect(keys.detail("42")).toEqual(["tenant", "acme", "users", "detail", "42"]);
    expect(keys.operation("search", [{ active: true }])).toEqual([
      "tenant",
      "acme",
      "users",
      "operation",
      "search",
      { active: true },
    ]);
    expect(keys.mutation("create")).toEqual(["tenant", "acme", "users", "mutation", "create"]);
  });

  it("copies caller key arrays and keeps scopes isolated", () => {
    const root = ["users"];
    const scope = ["tenant", "a"];
    const a = createResourceKeys({ queryKey: root, scope });
    const b = createResourceKeys({ queryKey: root, scope: ["tenant", "b"] });
    root.push("changed");
    scope.push("changed");
    expect(a.list()).toEqual(["tenant", "a", "users", "list"]);
    expect(b.list()).toEqual(["tenant", "b", "users", "list"]);
  });

  it("keeps transport controls out of Core read cache identity", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: { users: { path: "/users" } },
    });
    const base = createResourceQueryOptions(api.users, {
      queryKey: ["users"],
      operation: "getById",
      args: ["42"],
    });
    const controlled = createResourceQueryOptions(api.users, {
      queryKey: ["users"],
      operation: "getById",
      args: ["42", { signal: new AbortController().signal, timeout: 500, retry: { retries: 2 } }],
    });
    expect(controlled.queryKey).toEqual(base.queryKey);
  });
});
