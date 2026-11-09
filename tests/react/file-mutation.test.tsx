/** @vitest-environment jsdom */
import { defineApi, mockFiles } from "@apixa/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { useResource } from "../../packages/react/src/use-resource.js";
import { useResourceMutation } from "../../packages/react/src/use-resource-mutation.js";
import { newClient, wrap } from "../helpers/query.js";

type User = { id: string; name: string; avatar?: string | null; documents?: string[] };
type AppApi = { users: { path: "/users"; entity: User } };

const makeApi = () =>
  defineApi<AppApi>()({
    baseURL: "https://x.dev/v1",
    resources: {
      users: {
        path: "/users",
        mock: [{ id: "1", name: "Ada" }],
        fileFields: ["avatar", "documents"],
      },
    },
  });

describe("file-enabled mutations through the React hooks", () => {
  it("infers File | Blob inputs on useResourceMutation and runs them against the mock store", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useResourceMutation(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });

    type CreateInput = Parameters<typeof result.current.create>[0];
    expectTypeOf<CreateInput["avatar"]>().toEqualTypeOf<File | Blob | null | undefined>();
    expectTypeOf<CreateInput["documents"]>().toEqualTypeOf<readonly (File | Blob)[] | undefined>();
    expectTypeOf<CreateInput["name"]>().toEqualTypeOf<string>();

    let created: User | undefined;
    await act(async () => {
      created = await result.current.create({
        id: "2",
        name: "Grace",
        avatar: new File(["PNG"], "me.png", { type: "image/png" }),
        documents: [new File(["a"], "a.txt")],
      });
    });
    expect(created!.avatar).toMatch(/^mock-file:\/\//);
    expect(
      mockFiles(api as never)
        .get(created!.avatar!)!
        .text(),
    ).toBe("PNG");
    expect(await api.users.getById("2")).toMatchObject({ name: "Grace" });
  });

  it("works through the useResource facade and converts a FileList explicitly", async () => {
    const api = makeApi();
    const { result } = renderHook(() => useResource(api.users, { queryKey: ["users"] }), {
      wrapper: wrap(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // What a form handler (including React Hook Form) holds: a FileList. Consumers convert it.
    const input = document.createElement("input");
    input.type = "file";
    const list = {
      0: new File(["z"], "z.txt"),
      length: 1,
      item: (i: number) => (i ? null : list[0]),
    };
    const files = Array.from(list as unknown as ArrayLike<File>);
    void input;

    await act(async () => {
      await result.current.create({ id: "3", name: "Lin", documents: files });
    });
    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(mockFiles(api as never).list({ field: "documents" })).toHaveLength(1);
  });
});
