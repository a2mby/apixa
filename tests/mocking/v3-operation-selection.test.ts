import "../../packages/mocking/src/register.js";
import { defineMockApi } from "@apixa/mocking";
import { describe, expect, it } from "vitest";

describe("mock operation selection", () => {
  it("uses the same presets, explicit lists and named overrides as Core", async () => {
    const api = defineMockApi({
      resources: {
        read: { type: "users-mock", operations: "read" },
        selected: { type: "users-mock", operations: ["getAll", "getById"] },
        overridden: { type: "users-mock", operations: { preset: "crud", delete: false } },
      },
    });
    expect(api.read).toHaveProperty("getAll");
    expect(api.read).not.toHaveProperty("create");
    expect(Object.keys(api.selected).sort()).toEqual(["getAll", "getById"]);
    expect(api.overridden).toHaveProperty("create");
    expect(api.overridden).not.toHaveProperty("delete");
    expect(await api.selected.getAll()).not.toHaveLength(0);
    if (false as boolean) {
      // @ts-expect-error the read preset removes writes
      api.read.create({});
      // @ts-expect-error only the two listed operations are selected
      api.selected.delete("1");
    }
  });

  it("inherits a root preset and permits a resource override", () => {
    const api = defineMockApi({
      operations: "read",
      resources: {
        users: { type: "users-mock", operations: { getById: false } },
        products: { type: "products-mock", operations: "crud" },
      },
    });
    expect(api.users).not.toHaveProperty("create");
    expect(api.users).not.toHaveProperty("getById");
    expect(api.products).toHaveProperty("create");
    if (false as boolean) {
      // @ts-expect-error root read selection excludes writes
      api.users.create({});
      // @ts-expect-error the resource override removes this operation
      api.users.getById("1");
    }
  });
});
