import {
  clearDefineApiProcessors,
  defineApi,
  registerDefineApiProcessor,
  setMockingRegisterLoaderForTests,
  type Transport,
} from "@apixa/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("defineApi processors and optional mocking peer", () => {
  beforeEach(() => {
    clearDefineApiProcessors();
    setMockingRegisterLoaderForTests(undefined);
  });

  afterEach(() => {
    clearDefineApiProcessors();
    setMockingRegisterLoaderForTests(undefined);
  });

  it("still runs registered processors before the peer bridge", () => {
    let seen = false;
    registerDefineApiProcessor((config) => {
      seen = true;
      const users = config.users as Record<string, unknown>;
      const { mock: _m, mockConfig: _c, ...rest } = users;
      return { ...config, users: rest };
    });

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        async request() {
          return {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            raw: new Response("[]"),
            body: [],
          };
        },
      } satisfies Transport,
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-mock" },
      },
    });

    expect(seen).toBe(true);
    expect(api.users).toBeDefined();
  });

  it("fails at defineApi when mock:true lacks mockConfig.type (peer bridge validation)", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        users: {
          path: "/users",
          mock: true,
        },
      }),
    ).toThrow(/mockConfig.type/);
  });

  it("yields a clear error when the mocking peer cannot be resolved", async () => {
    setMockingRegisterLoaderForTests(async () => {
      throw new Error("Cannot find module '@apixa/mocking/register'");
    });

    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-mock" },
      },
    });

    await expect(api.users.getAll()).rejects.toThrow(/optional peer "@apixa\/mocking"/);
  });
});
