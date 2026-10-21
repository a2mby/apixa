import { defineApi } from "@apixa/core";
import { defineMockApi } from "@apixa/mocking";
import { type User } from "@apixa/mocking/data";

export type { User };

export type AppApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

/**
 * Resource-level mocking: Core lazy-loads `@apixa/mocking` when `mock` / `mockConfig`
 * are present — no side-effect `import "@apixa/mocking"` required.
 *
 * Importing `@apixa/mocking/data` merges known preset ids into Core's `MockDatasetIds`,
 * so `mockConfig.type` autocompletes (e.g. `"users-sample"`).
 */
export const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  users: {
    path: "/users",
    mock: true,
    mockConfig: {
      type: "users-sample",
      size: 100,
      pagination: true,
    },
  },
});

export const mockApi = defineMockApi({
  comments: {
    type: "comments-mock",
    size: 100,
    pagination: true,
  },
});

