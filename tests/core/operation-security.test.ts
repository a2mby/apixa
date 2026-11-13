import { defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

describe("operation origin boundary", () => {
  it("encodes caller-supplied getBy fields on the API origin and blocks cross-origin getBy templates", async () => {
    const calls: string[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers: { Authorization: "Bearer secret" },
      transport: createFakeTransport((request) => {
        calls.push(request.url);
        return { body: { id: "1" } };
      }),
      resources: {
        users: { path: "/users" },
        templated: {
          path: "/templated",
          operations: { getBy: { path: "https://other.example/:field/:value" } },
        },
      },
    });
    await api.users.getBy("https://other.example/steal", "1");
    expect(calls).toEqual(["https://api.example.com/users?https%3A%2F%2Fother.example%2Fsteal=1"]);
    await expect(api.templated.getBy("email", "a@b.c")).rejects.toThrow(/outside the API origin/);
    expect(calls).toHaveLength(1);
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
      resources: {
        users: {
          path: "/users",
          operations: {
            count: { path: "https://other.example/count" },
            search: { method: "GET", path: "https://api.example.com/search" },
          },
        },
      },
    });
    await expect(api.users.count()).rejects.toThrow(/outside the API origin/);
    await api.users.search();
    expect(calls).toEqual(["https://api.example.com/search"]);
  });
});
