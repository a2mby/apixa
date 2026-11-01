import { describe, expect, it } from "vitest";
import { createResourceKeys } from "../../packages/tanstack-query/src/keys.js";

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
    expect(keys.mutation("create")).toEqual(["tenant", "acme", "users", "mutation", "create"]);
  });
});
