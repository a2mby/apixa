import { ApiError, defineApi, HttpError, NetworkError } from "@apixa/core";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

const SECRETS = ["Bearer SECRET-TOKEN", "KEY-123", "pw-123"];
const headers = { authorization: "Bearer SECRET-TOKEN", "x-api-key": "KEY-123" };
const body = { name: "ada", password: "pw-123" };

function failing(transport: Parameters<typeof defineApi>[0]["transport"]) {
  return defineApi({
    baseURL: "https://api.example.com",
    headers,
    transport,
    resources: { users: { path: "/users" } },
  });
}

function expectNoSecrets(error: unknown) {
  const shown = [inspect(error, { depth: 8 }), String(JSON.stringify(error))].join("\n");
  for (const secret of SECRETS) expect(shown, secret).not.toContain(secret);
}

describe("errors do not leak credentials or request payloads", () => {
  it("HttpError", async () => {
    const api = failing(createFakeTransport(() => ({ status: 500, body: { message: "boom" } })));
    const error = await api.users.create(body).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expectNoSecrets(error);
  });

  it("NetworkError", async () => {
    const api = failing({
      request: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const error = await api.users.create(body, { retry: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expectNoSecrets(error);
  });

  it("keeps request and response readable for handlers and middleware", async () => {
    const api = failing(createFakeTransport(() => ({ status: 500, body: { message: "boom" } })));
    const error = (await api.users.create(body).catch((e: unknown) => e)) as ApiError;
    expect(error.request?.headers.get("authorization")).toBe("Bearer SECRET-TOKEN");
    expect(error.request?.body).toEqual(body);
    expect(error.request?.operation).toBe("create");
    expect(Object.keys(error)).not.toContain("request");
    expect(Object.keys(error)).not.toContain("response");
    expect(error).toMatchObject({ status: 500, code: "HTTP" });
  });

  it("lets an error middleware replace the request or response on the error", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      headers,
      transport: createFakeTransport(() => ({ status: 500, body: {} })),
      middleware: [
        {
          onError: (error) => {
            (error as ApiError).request = undefined;
          },
        },
      ],
      resources: { users: { path: "/users" } },
    });
    const error = (await api.users.getAll().catch((e: unknown) => e)) as ApiError;
    expect(error.request).toBeUndefined();
  });
});
