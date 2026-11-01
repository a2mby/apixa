import { defineApi } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";
import { createResourceController } from "../../packages/tanstack-query/src/controller.js";
import type {
  InferCreateBody,
  InferEntity,
  InferListData,
  InferUpdateBody,
} from "../../packages/tanstack-query/src/types.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type AppApi = {
  users: { path: "/users"; entity: User };
};

describe("tanstack-query inference from Apixa ResourceClient", () => {
  const api = defineApi<AppApi>()({
    baseURL: "https://api.example.com",
    transport: createFakeTransport(() => ({ body: [] })),
    users: { path: "/users" },
  });

  it("infers list, entity, create, and update bodies from the resource", () => {
    type R = typeof api.users;
    expectTypeOf<InferListData<R>>().toEqualTypeOf<User[]>();
    expectTypeOf<InferEntity<R>>().toEqualTypeOf<User>();
    expectTypeOf<InferCreateBody<R>>().toEqualTypeOf<Omit<User, "id">>();
    expectTypeOf<InferUpdateBody<R>>().toEqualTypeOf<Partial<User>>();

    const controller = createResourceController(api.users, { queryKey: ["users"] });
    expectTypeOf(controller.listOptions().queryFn).returns.resolves.toEqualTypeOf<User[]>();
  });
});
