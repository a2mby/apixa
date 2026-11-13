import { applyResourceSliceToListResult, defineApi, ResponseShapeError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("resource slice", () => {
  it("is typed on the resource bag without importing @apixa/mocking", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      resources: {
        users: {
          path: "/users",
          slice: 2,
        },
      },
    });
    expect(api.users.getAll).toBeTypeOf("function");
  });

  it("caps getAll array responses", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        body: [{ id: "1" }, { id: "2" }, { id: "3" }],
      })),
      resources: {
        users: {
          path: "/users",
          slice: 2,
        },
      },
    });

    await expect(api.users.getAll()).resolves.toEqual([{ id: "1" }, { id: "2" }]);
  });

  it.each([
    [{ start: 5, end: 20 }, [5, 6, 7, 8, 9]],
    [{ start: 0, end: 20 }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    [{ start: 20, end: 30 }, []],
    [{ start: -3, end: -1 }, [7, 8]],
    [{ start: 7, end: 3 }, []],
    [{ start: 1.8, end: 3.9 }, [1, 2]],
  ])("uses Array.slice semantics for %o", async (slice, expected) => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: Array.from({ length: 10 }, (_, i) => i) })),
      resources: { users: { path: "/users", slice } },
    });

    await expect(api.users.getAll()).resolves.toEqual(expected);
  });

  it("rejects combining client-side slice with server pagination", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        resources: { users: { path: "/users", slice: 3, pagination: "page" } },
      }),
    ).toThrow(/slice.*pagination|pagination.*slice/i);
  });

  it("leaves non-array getAll object payloads alone and rejects primitives", async () => {
    const page = { data: [{ id: "1" }, { id: "2" }], total: 2, page: 1, pageSize: 20 };
    expect(applyResourceSliceToListResult(page, 1)).toEqual(page);

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((req) => ({
        body: req.url.includes("primitive=1") ? 42 : page,
      })),
      resources: {
        users: {
          path: "/users",
          slice: 1,
        },
      },
    });

    await expect(api.users.getAll()).resolves.toEqual(page);
    await expect(api.users.getAll({ query: { primitive: "1" } })).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
  });
});
