import { defineApi, type Middleware } from "@apixa/core";
import { defineMockApi } from "@apixa/mocking";
import { type User } from "@apixa/mocking/data";

export type { User };

export type AppApi = {
  users: {
    path: "/users";
    entity: User;
  };
};

/** Demo middleware: tag every Core request (runs once per call, wraps retries). */
const withTrace: Middleware = async (ctx, next) => {
  ctx.request.headers.set("X-Apixa-Example", "next");
  return next();
};

/**
 * Resource-level mocking: Core lazy-loads `@apixa/mocking` when `mock` / `mockConfig`
 * are present — no side-effect `import "@apixa/mocking"` required.
 *
 * v0.6.0 reliability: `timeout`, opt-in `retry`, and thin `middleware` on the live
 * Core path (mocks still go through `executeRequest`).
 *
 * Importing `@apixa/mocking/data` merges known preset ids into Core's `MockDatasetIds`,
 * so `mockConfig.type` autocompletes (e.g. `"users-sample"`).
 */
export const api = defineApi<AppApi>()({
  baseURL: "https://api.example.com",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  timeout: 10_000,
  retry: {
    retries: 2,
    methods: ["GET", "HEAD"],
    baseDelayMs: 150,
    jitter: false,
  },
  middleware: [withTrace],
  users: {
    path: "/users",
    mock: true,
    mockConfig: {
      type: "users-sample",
      size: 100,
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
