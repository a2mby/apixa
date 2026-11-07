import { describe, expect, it } from "vitest";
import { createResourceKeys } from "@apixa/internal-shared";
import { createResourceKeys as createTypedKeys } from "../../packages/react/src/keys";

describe("shared resource keys", () => {
  const keys = createResourceKeys({ scope: ["api"], queryKey: ["users"] });

  it("builds the documented hierarchy", () => {
    expect(keys.all()).toEqual(["api", "users"]);
    expect(keys.lists()).toEqual(["api", "users", "list"]);
    expect(keys.list()).toEqual(["api", "users", "list"]);
    expect(keys.list({ page: 2 })).toEqual(["api", "users", "list", { page: 2 }]);
    expect(keys.detail("7")).toEqual(["api", "users", "detail", "7"]);
    expect(keys.operation("search", ["a"])).toEqual(["api", "users", "operation", "search", "a"]);
    expect(keys.infinites()).toEqual(["api", "users", "infinite"]);
    expect(keys.infinite()).toEqual(["api", "users", "infinite", "getAll"]);
    expect(keys.infinite("feed", ["q"])).toEqual(["api", "users", "infinite", "feed", "q"]);
    expect(keys.mutation("create")).toEqual(["api", "users", "mutation", "create"]);
  });

  it("defaults the scope to empty and does not alias its inputs", () => {
    const queryKey = ["posts"];
    const unscoped = createResourceKeys({ queryKey });
    queryKey.push("mutated");
    expect(unscoped.all()).toEqual(["posts"]);
  });

  it("is what the React package's typed factory returns", () => {
    const typed = createTypedKeys({ scope: ["api"], queryKey: ["users"] });
    expect(typed.detail("7")).toEqual(keys.detail("7"));
    expect(typed.infinite()).toEqual(keys.infinite());
  });
});
