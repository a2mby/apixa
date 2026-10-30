import { clearDefineApiProcessors, defineApi } from "@apixa/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * No `import "@apixa/mocking"` — Core must lazy-load the optional peer when
 * `mock` / `mockConfig` are present and mocking is installed in the workspace.
 */
describe("defineApi lazy optional mocking peer", () => {
  beforeEach(() => {
    clearDefineApiProcessors();
  });

  afterEach(() => {
    clearDefineApiProcessors();
  });

  it("serves mocked resources with only defineApi from Core", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-mock" },
      },
    });

    const users = await api.users.getAll();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });
});
