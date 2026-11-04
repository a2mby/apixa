import { defineApi } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";
import { createResourceController } from "../../packages/tanstack-query/src/controller.js";
import { useResourceQuery } from "../../packages/tanstack-query/src/use-resource-query.js";
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
    resources: {
      users: { path: "/users" },
    },
  });

  it("infers list, entity, create, and update bodies from the resource", () => {
    type R = typeof api.users;
    expectTypeOf<InferListData<R>>().toEqualTypeOf<User[]>();
    expectTypeOf<InferEntity<R>>().toEqualTypeOf<User>();
    expectTypeOf<InferCreateBody<R>>().toEqualTypeOf<Omit<User, "id"> & Partial<Pick<User, "id">>>();
    expectTypeOf<InferUpdateBody<R>>().toEqualTypeOf<Partial<User>>();

    const controller = createResourceController(api.users, { queryKey: ["users"] });
    expectTypeOf(controller.listOptions().queryFn).returns.resolves.toEqualTypeOf<User[]>();
  });

  it("accepts read-only and partially disabled Core resources without exposing absent methods", () => {
    const readOnly = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", readOnly: true },
      },
    });
    const noDetail = defineApi<AppApi>()({
      baseURL: "https://api.example.com",
      resources: {
        users: { path: "/users", operations: { getById: false } },
      },
    });
    if (false) {
      const read = useResourceQuery(readOnly.users, { queryKey: ["users"] });
      expectTypeOf(read.data).toEqualTypeOf<User[] | undefined>();
      expectTypeOf(read.getById).parameter(0).toEqualTypeOf<User["id"]>();
      // @ts-expect-error read-only resource has no create mutation
      read.create({ name: "Ada" });
      // @ts-expect-error read-only resource has no create mutation entry
      read.mutations.create;
      const partial = useResourceQuery(noDetail.users, { queryKey: ["users"] });
      // @ts-expect-error disabled getById is absent
      partial.getById("1");
    }
  });
});
