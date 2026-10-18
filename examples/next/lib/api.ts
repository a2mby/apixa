import "@apixa/mocking";
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
 * Resource-level mocking: `mock` / `mockConfig` are handled by `@apixa/mocking`
 * via Core's defineApi processor — not a second defineApi.
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
