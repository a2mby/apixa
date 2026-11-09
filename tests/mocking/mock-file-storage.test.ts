import {
  defineMockApi,
  mockFiles,
  mockFixtureRef,
  mockFileFixture,
  MockApiError,
} from "@apixa/mocking";
import { resetMock } from "@apixa/core";
import { describe, expect, it } from "vitest";

const make = () =>
  defineMockApi({
    resources: {
      users: {
        type: "users-mock",
        seed: { limit: 1 },
        fileFields: ["email"],
        storage: { disk: "avatars" },
        operations: {
          upload: async (ctx, id: string) =>
            ctx.defaults.patch(id, {
              email: new File(["bytes"], "photo.txt", { type: "text/plain" }),
            }),
          download: async (ctx, id: string) =>
            ctx.files.get((await ctx.defaults.getById(id)).email).blob(),
          failWrite: async (ctx) => {
            await ctx.defaults.patch("1", { email: new Blob(["bad"]) });
            throw Error("failed");
          },
          failRows: async (ctx) => {
            (await ctx.rows()).splice(0, 1);
            throw Error("failed rows");
          },
        },
      },
    },
  });

describe("defineMockApi uses the same file storage and managed lifecycle", () => {
  it("uploads/downloads and resets through existing handles", async () => {
    const api = make();
    const before = await api.users.getById("1");
    const row = await api.users.upload("1");
    expect(row.email).toMatch(/^mock-file:\/\//);
    expect(mockFiles(api).get(row.email)?.meta.disk).toBe("avatars");
    expect(mockFiles(api).get(row.email)?.meta.name).toBe("photo.txt");
    expect(await (await api.users.download("1")).text()).toBe("bytes");
    expect(mockFiles(api.users)).toBe(mockFiles(api));
    resetMock(api.users);
    expect(mockFiles(api).size).toBe(0);
    expect(await api.users.getById("1")).toEqual(before);
  });
  it("discards both default-helper writes and mutable-row changes when callbacks fail", async () => {
    const api = make();
    const before = await api.users.getAll();
    await expect(api.users.failWrite()).rejects.toThrow("failed");
    await expect(api.users.failRows()).rejects.toThrow("failed rows");
    expect(await api.users.getAll()).toEqual(before);
    expect(mockFiles(api).size).toBe(0);
  });
  it("preserves client isolation, typed builtin file inputs and MockApiError translation", async () => {
    const a = make();
    const b = make();
    const row = await a.users.patch("1", { email: new Blob(["a"]) });
    expect(mockFiles(b).has(row.email)).toBe(false);
    await expect(a.users.getById("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(a.users.getById("missing")).rejects.toBeInstanceOf(MockApiError);
    resetMock(a);
    expect(mockFiles(a).size).toBe(0);
  });
  it("provides strict fixture registry validation through the same Core loader", async () => {
    const api = defineMockApi({
      resources: {
        users: {
          type: "users-mock",
          seed: { limit: 1 },
          fileFields: ["email"],
          fixtures: { x: mockFileFixture("x", { name: "x.txt" }) },
        },
      },
    });
    // Existing catalog strings are ordinary values, never mistaken for fixture references.
    expect((await api.users.getById("1")).email).toContain("@");
    expect(mockFiles(api).size).toBe(0);
    expect(mockFixtureRef("x")).toEqual({ $apixaFixture: "x" });
  });
});
