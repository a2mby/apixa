import { defineApi, getOperationMetadata, type OperationKindsOf } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("v3 operation selection", () => {
  const base = {
    baseURL: "https://api.example.com",
    transport: createFakeTransport(() => ({ body: [] })),
  };

  it("selects presets and explicit builtins", () => {
    const api = defineApi({
      ...base,
      resources: {
        crud: { path: "/a", operations: "crud" },
        read: { path: "/b", operations: "read" },
        explicit: { path: "/c", operations: ["getAll", "getById"] },
      },
    });
    expect(Object.keys(api.crud).sort()).toEqual([
      "create",
      "delete",
      "getAll",
      "getById",
      "update",
    ]);
    expect(Object.keys(api.read)).toContain("getAll");
    expect(Object.keys(api.read)).not.toContain("create");
    expect(Object.keys(api.explicit).sort()).toEqual(["getAll", "getById"]);
    if (false as boolean) {
      api.explicit.getAll();
      // @ts-expect-error only explicitly selected operations are present
      api.explicit.create({});
      // @ts-expect-error the read preset excludes writes
      api.read.delete(1);
    }
  });

  it("applies named overrides after the preset", () => {
    const api = defineApi({
      ...base,
      resources: {
        users: {
          path: "/users",
          operations: {
            preset: "crud",
            delete: false,
            report: { method: "GET", path: "/report" },
          },
        },
      },
    });
    expect(Object.keys(api.users)).not.toContain("delete");
    expect(Object.keys(api.users)).toContain("report");
    expect(getOperationMetadata(api.users)?.report?.kind).toBe("read");
    type Kinds = OperationKindsOf<typeof api.users>;
    expectTypeOf<Kinds["report"]>().toEqualTypeOf<"read">();
    if (false as boolean) {
      api.users.report();
      // @ts-expect-error the named override removes delete
      api.users.delete(1);
      defineApi({
        ...base,
        resources: {
          users: {
            path: "/users",
            operations: {
              preset: "crud",
              // @ts-expect-error operation overrides must be declarations, not presets
              report: "read",
            },
          },
        },
      });
    }
  });

  it("rejects unknown presets and builtin names at construction", () => {
    for (const operations of ["everything", ["getAll", "missing"], { preset: "missing" }]) {
      expect(() =>
        defineApi({
          ...base,
          resources: { users: { path: "/users", operations: operations as never } },
        }),
      ).toThrow(/operations.*expected/i);
    }
  });

  it("retains typed mock handlers inside overrides", () => {
    type State = {
      users: { entity: { id: string }; operations: { stats: { response: { total: number } } } };
    };
    const api = defineApi<State>()({
      ...base,
      resources: {
        users: {
          path: "/users",
          mock: [{ id: "1" }],
          operations: {
            preset: "crud",
            stats: {
              method: "GET",
              path: "/stats",
              mock: ({ records }) => ({ total: records.length }),
            },
          },
        },
      },
    });
    expectTypeOf(api.users.stats).returns.resolves.toEqualTypeOf<{ total: number }>();
    if (false as boolean) {
      defineApi<State>()({
        ...base,
        resources: {
          users: {
            path: "/users",
            mock: [{ id: "1" }],
            // @ts-expect-error the declared response requires total
            operations: {
              preset: "crud",
              stats: { method: "GET", path: "/stats", mock: () => ({ count: 1 }) },
            },
          },
        },
      });
    }
  });
});
