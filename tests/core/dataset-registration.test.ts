import { defineApi, registerMockDatasetLoader } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";

describe("optional dataset registration", () => {
  it("fails clearly without registration and loads a registered dataset only on request", async () => {
    const makeApi = () =>
      defineApi({
        baseURL: "https://example.test",
        resources: { users: { path: "/users", mock: "users-mock" } },
      });
    await expect(makeApi().users.getAll()).rejects.toThrow("@apixa/mocking/register");
    const loader = vi.fn(async () => [{ id: "one" }]);
    registerMockDatasetLoader(loader);
    const api = makeApi();
    expect(loader).not.toHaveBeenCalled();
    expect(await api.users.getAll()).toEqual([{ id: "one" }]);
    expect(loader).toHaveBeenCalledExactlyOnceWith("users-mock");
  });
});
