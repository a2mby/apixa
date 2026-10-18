import { defineApi, HttpError, NetworkError, isApiError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string; email: string };

type HttpApi = {
  users: {
    path: string;
    entity: User;
    operations: {
      getAll: { query: { limit?: number; active?: boolean }; response: User[] };
      getPost: {
        method: "GET";
        path: "/:userId/posts/:postId";
        response: { id: string };
      };
    };
  };
};

describe("request execution", () => {
  it("applies path parameters and query strings to the final URL", async () => {
    const seen: string[] = [];

    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport((request) => {
        seen.push(request.url);
        return { body: { id: "123", name: "Ada", email: "ada@example.com" } };
      }),
      users: {
        path: "/users",
        operations: {
          getAll: { method: "GET" },
          getByID: { method: "GET", path: "/:id" },
          getPost: {
            method: "GET",
            path: "/:userId/posts/:postId",
          },
        },
      },
    });

    await api.users.getByID("123");
    await api.users.getAll({ query: { limit: 5, active: true } });
    await api.users.getPost({ userId: "u1", postId: "p9" });

    expect(seen).toEqual([
      "https://api.example.com/users/123",
      "https://api.example.com/users?limit=5&active=true",
      "https://api.example.com/users/u1/posts/p9",
    ]);
  });

  it("sends JSON bodies and shared headers", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      headers: { Accept: "application/json", "X-Client": "apixa" },
      transport: createFakeTransport((request) => {
        expect(request.headers.get("accept")).toBe("application/json");
        expect(request.headers.get("x-client")).toBe("apixa");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.body).toBe(JSON.stringify({ name: "Ada", email: "ada@example.com" }));
        return {
          status: 201,
          body: { id: "3", name: "Ada", email: "ada@example.com" } satisfies User,
        };
      }),
      users: {
        path: "/users",
        operations: {
          create: { method: "POST" },
        },
      },
    });

    const created = await api.users.create({ name: "Ada", email: "ada@example.com" });
    expect(created).toEqual({ id: "3", name: "Ada", email: "ada@example.com" });
  });

  it("returns unwrapped JSON data on success", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        body: { id: "1", name: "Ada", email: "ada@example.com" } satisfies User,
      })),
      users: {
        path: "/users",
        operations: {
          getByID: { method: "GET", path: "/:id" },
        },
      },
    });

    const result = api.users.getByID("1");
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ id: "1", name: "Ada", email: "ada@example.com" });
  });

  it("throws HttpError for non-OK responses", async () => {
    const api = defineApi<HttpApi>()({
      baseURL: "https://api.example.com",
      transport: createFakeTransport(() => ({
        status: 404,
        body: { detail: "User not found" },
      })),
      users: {
        path: "/users",
        operations: {
          getByID: { method: "GET", path: "/:id" },
        },
      },
    });

    await expect(api.users.getByID("missing")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpError);
      expect(isApiError(error)).toBe(true);
      if (error instanceof HttpError) {
        expect(error.status).toBe(404);
        expect(error.data).toEqual({ detail: "User not found" });
        expect(error.name).toBe("HttpError");
      }
      return true;
    });
  });

  it("surfaces NetworkError from the transport", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: {
        async request() {
          throw new NetworkError("failed to fetch");
        },
      },
      users: {
        path: "/users",
        operations: {
          getAll: { method: "GET" },
        },
      },
    });

    await expect(api.users.getAll()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(NetworkError);
      expect(isApiError(error)).toBe(true);
      if (error instanceof NetworkError) {
        expect(error.message).toBe("failed to fetch");
        expect(error.code).toBe("NETWORK_ERROR");
      }
      return true;
    });
  });
});
