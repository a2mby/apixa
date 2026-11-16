import { createResource, defineApi } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };
type Other = { id: string; name: string; email: string; role: string };

describe("createResource", () => {
  it("returns the same resource object", () => {
    const users = { path: "/users", paginationConfig: "laravel" as const };
    expect(createResource<User>()(users)).toBe(users);
  });

  it("infers the entity from createResource without defineApi<ApiState>()", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        body: { id: "1", name: "Ada", email: "ada@example.com" },
      })),
      resources: {
        users: createResource<User>()({ path: "/users" }),
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf(await api.users.getById("1")).toEqualTypeOf<User>();
    expect((await api.users.getById("1")).name).toBe("Ada");
  });

  it("keeps an explicit ApiState entry ahead of the resource brand", async () => {
    const api = defineApi<{ users: Other }>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { id: "1", name: "Ada", email: "a@b.c" } })),
      resources: {
        users: createResource<User>()({ path: "/users" }),
      },
    });

    expectTypeOf(await api.users.getById("1")).toEqualTypeOf<Other>();
  });

  it("leaves a plain resource unknown", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: { id: "1" } })),
      resources: {
        users: { path: "/users" },
      },
    });

    expectTypeOf(await api.users.getById("1")).toEqualTypeOf<unknown>();
  });
});
