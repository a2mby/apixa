import { defineApi, type, type Infer, type Type } from "@apixa/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };
type CreateUser = Omit<User, "id">;

describe("type markers", () => {
  it("type<T>() returns Type<T> and Infer unwraps it", () => {
    const marker = type<User[]>();
    expect(marker).toEqual({});
    expectTypeOf(marker).toEqualTypeOf<Type<User[]>>();
    expectTypeOf<Infer<Type<User[]>>>().toEqualTypeOf<User[]>();
    expectTypeOf<Infer<typeof marker>>().toEqualTypeOf<User[]>();
  });

  it("infers Promise<User[]> from response: type<User[]>()", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: [] })),
      users: {
        path: "/users",
        operations: {
          getAll: { response: type<User[]>() },
        },
      },
    });

    expectTypeOf(api.users.getAll).returns.toEqualTypeOf<Promise<User[]>>();
  });

  it("infers body argument from body: type<Create>()", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        status: 201,
        body: { id: "1", name: "Ada", email: "ada@example.com" },
      })),
      users: {
        path: "/users",
        operations: {
          create: { body: type<CreateUser>(), response: type<User>() },
        },
      },
    });

    expectTypeOf(api.users.create).parameter(0).toEqualTypeOf<CreateUser>();
    expectTypeOf(api.users.create).returns.toEqualTypeOf<Promise<User>>();
  });

  it("missing response marker yields unknown", () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          getAll: { method: "GET" },
        },
      },
    });

    expectTypeOf(api.users.getAll).returns.toEqualTypeOf<Promise<unknown>>();
  });

  it("rejects non-Type values on body and response", () => {
    defineApi({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({ body: null })),
      users: {
        path: "/users",
        operations: {
          // @ts-expect-error — {} as User is not Type<User>
          getAll: { response: {} as User[] },
          // @ts-expect-error — plain object is not Type<CreateUser>
          create: { body: {} as CreateUser, response: type<User>() },
        },
      },
    });
  });
});
