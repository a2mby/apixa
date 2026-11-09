import { defineApi } from "@apixa/core";
import { describe, expectTypeOf, it } from "vitest";
import type { CreateBodyOf } from "../helpers/types.js";

/**
 * v1.1.0 type-level contract for `fileFields`. Compile-time only: every client below is built
 * inside a function that is never called, so these tests assert types (checked by
 * `tsc -p tests/tsconfig.json`) and never exercise runtime behavior.
 */

type User = {
  id: string;
  name: string;
  age: number;
  avatar: string;
  documents: string[];
  banner?: string | null;
};
type AppApi = { users: { path: "/users"; entity: User } };

const baseURL = "https://api.example.com";

const simple = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: { users: { path: "/users", fileFields: ["avatar", "documents", "banner"] } },
  });

const advanced = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: { users: { path: "/users", fileFields: { avatar: { name: "profile_image" } } } },
  });

const plain = () => defineApi<AppApi>()({ baseURL, resources: { users: { path: "/users" } } });

const jsonCreate = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      users: {
        path: "/users",
        fileFields: ["avatar"],
        operations: { create: { dataFormat: "json" } },
      },
    },
  });

const snake = () =>
  defineApi<AppApi>()({
    baseURL,
    resources: {
      users: {
        path: "/users",
        fileFields: ["avatar"],
        operations: { update: { dataFormat: "multipart" } },
      },
    },
  });

type Overridden = {
  users: {
    path: "/users";
    entity: User;
    operations: { create: { body: { avatar: string; tag: number } } };
  };
};
const overridden = () =>
  defineApi<Overridden>()({
    baseURL,
    resources: {
      users: { path: "/users", fileFields: ["avatar"], operations: { create: true } },
    },
  });

type Simple = ReturnType<typeof simple>["users"];
type CreateBody = Parameters<Simple["create"]>[0];
type UpdateBody = Parameters<Simple["update"]>[1];
type PatchBody = Parameters<Simple["patch"]>[1];
type UpsertBody = Parameters<Simple["upsert"]>[1];

describe("fileFields type contract", () => {
  it("keeps read types as string / string[]", () => {
    expectTypeOf<Awaited<ReturnType<Simple["getById"]>>>().toEqualTypeOf<User>();
    expectTypeOf<Awaited<ReturnType<Simple["create"]>>>().toEqualTypeOf<User>();
    expectTypeOf<Awaited<ReturnType<Simple["getById"]>>["avatar"]>().toEqualTypeOf<string>();
    expectTypeOf<Awaited<ReturnType<Simple["getById"]>>["documents"]>().toEqualTypeOf<string[]>();
  });

  it("derives File | Blob inputs for create", () => {
    expectTypeOf<CreateBody["avatar"]>().toEqualTypeOf<File | Blob>();
    expectTypeOf<CreateBody["documents"]>().toEqualTypeOf<readonly (File | Blob)[]>();
    expectTypeOf<CreateBody["banner"]>().toEqualTypeOf<File | Blob | null | undefined>();
    expectTypeOf<CreateBody["name"]>().toEqualTypeOf<string>();
    expectTypeOf<CreateBody["age"]>().toEqualTypeOf<number>();
    expectTypeOf<CreateBody["id"]>().toEqualTypeOf<string | undefined>();
  });

  it("derives optional File | Blob inputs for update, patch and upsert", () => {
    expectTypeOf<UpdateBody["avatar"]>().toEqualTypeOf<File | Blob | undefined>();
    expectTypeOf<PatchBody["documents"]>().toEqualTypeOf<readonly (File | Blob)[] | undefined>();
    expectTypeOf<UpsertBody["avatar"]>().toEqualTypeOf<File | Blob | undefined>();
    expectTypeOf<UpdateBody["name"]>().toEqualTypeOf<string | undefined>();
  });

  it("derives file inputs for createMany elements", () => {
    type Bulk = Parameters<Simple["createMany"]>[0];
    expectTypeOf<Bulk[number]["avatar"]>().toEqualTypeOf<File | Blob>();
    expectTypeOf<Bulk[number]["name"]>().toEqualTypeOf<string>();
  });

  it("keeps explicitly declared operation body types", () => {
    type Custom = ReturnType<typeof overridden>["users"];
    expectTypeOf<Parameters<Custom["create"]>[0]>().toEqualTypeOf<{
      avatar: string;
      tag: number;
    }>();
  });

  it("accepts multipart options on resources and operations", () => {
    () =>
      defineApi<AppApi>()({
        baseURL,
        resources: {
          users: {
            path: "/users",
            fileFields: ["avatar"],
            multipart: { nulls: "omit", arrays: "indices", jsonFields: ["name"] },
            operations: { create: { multipart: { arrays: "repeat" } } },
          },
        },
      });
    () =>
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error unknown multipart option value
        resources: { users: { path: "/users", multipart: { nulls: "zero" } } },
      });
  });

  it("accepts the advanced object form with identical derived types", () => {
    type Adv = ReturnType<typeof advanced>["users"];
    expectTypeOf<Parameters<Adv["create"]>[0]["avatar"]>().toEqualTypeOf<File | Blob>();
    // Not a file field here: stays the entity type.
    expectTypeOf<Parameters<Adv["create"]>[0]["documents"]>().toEqualTypeOf<string[]>();
  });

  it("leaves resources without fileFields exactly as before", () => {
    type Plain = ReturnType<typeof plain>["users"];
    expectTypeOf<Parameters<Plain["create"]>[0]>().toEqualTypeOf<CreateBodyOf<User>>();
    expectTypeOf<Parameters<Plain["update"]>[1]>().toEqualTypeOf<Partial<User>>();
  });

  it("reverts to entity inputs when an operation forces dataFormat json", () => {
    type J = ReturnType<typeof jsonCreate>["users"];
    expectTypeOf<Parameters<J["create"]>[0]["avatar"]>().toEqualTypeOf<string>();
    // Other eligible operations keep file inputs.
    expectTypeOf<Parameters<J["update"]>[1]["avatar"]>().toEqualTypeOf<File | Blob | undefined>();
  });

  it("accepts dataFormat multipart on a write builtin", () => {
    type S = ReturnType<typeof snake>["users"];
    expectTypeOf<Parameters<S["update"]>[1]["avatar"]>().toEqualTypeOf<File | Blob | undefined>();
  });

  it("rejects invalid configuration at compile time", () => {
    // None of these run; they only have to fail type checking.
    () =>
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error "nope" is not an entity field
        resources: { users: { path: "/users", fileFields: ["nope"] } },
      });
    () =>
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error "age" is a number, not a string / string[] field
        resources: { users: { path: "/users", fileFields: ["age"] } },
      });
    () =>
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error unknown advanced option
        resources: { users: { path: "/users", fileFields: { avatar: { maxSize: 1 } } } },
      });
    () =>
      defineApi<AppApi>()({
        baseURL,
        // @ts-expect-error advanced key that is not an entity field
        resources: { users: { path: "/users", fileFields: { nope: {} } } },
      });
    () =>
      defineApi<AppApi>()({
        baseURL,
        resources: {
          // @ts-expect-error dataFormat is for write operations
          users: { path: "/users", operations: { getAll: { dataFormat: "multipart" } } },
        },
      });
  });

  it("cannot check names when the entity is not declared", () => {
    () =>
      defineApi({
        baseURL,
        resources: { files: { path: "/files", fileFields: ["anything"] } },
      });
  });
});
