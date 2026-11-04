import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("operation origin boundary", () => {
  it("rejects a caller-controlled cross-origin getBy path before forwarding inherited authorization", async () => {
    const calls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { Authorization: "Bearer secret" },
      transport: createFakeTransport((request) => {
        calls.push(request.url);
        return { body: {} };
      }),
      users: { path: "/users" },
    });
    await expect(api.users.getBy("https://other.example/steal", "1")).rejects.toThrow(
      /outside the API origin/,
    );
    expect(calls).toEqual([]);
  });

  it("rejects absolute cross-origin operation overrides, while allowing same-origin paths", async () => {
    const calls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { Authorization: "Bearer secret" },
      transport: createFakeTransport((request) => {
        calls.push(request.url);
        return { body: {} };
      }),
      users: {
        path: "/users",
        operations: {
          count: { path: "https://other.example/count" },
          search: { path: "https://api.example.com/search" },
        },
      },
    });
    await expect(api.users.count()).rejects.toThrow(/outside the API origin/);
    await api.users.search();
    expect(calls).toEqual(["https://api.example.com/search"]);
  });
});
