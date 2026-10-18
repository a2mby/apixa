import { defineApi } from "@apixa/core";
import type { User } from "@apixa/mocking/data/users";

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
