import { defineApi } from "@apixa/core";
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

  it("leaves non-array getAll payloads alone", async () => {
    const page = { data: [{ id: "1" }, { id: "2" }], total: 2, page: 1, pageSize: 20 };
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: page })),
      resources: {
        users: {
          path: "/users",
          slice: 1,
        },
      },
    });

    await expect(api.users.getAll()).resolves.toEqual(page);
  });
});
