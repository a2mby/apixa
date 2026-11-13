import {
  ApiError,
  ConfigError,
  SecurityError,
  createFetchTransport,
  defineApi,
  type Transport,
} from "apixa/core";
import { describe, expect, it } from "vitest";

const url = "https://storage.example.com/key?X-Signature=a%2Fb&x=1&x=2";
const policy = {
  origins: ["https://storage.example.com"],
  headers: ["content-type", "x-checksum"],
};
function setup() {
  let inheritedHeaders = 0;
  let inheritedMiddleware = 0;
  const sent: { url: string; init: RequestInit }[] = [];
  const transport = createFetchTransport(async (input, init) => {
    sent.push({ url: String(input), init: init! });
    return new Response("binary", { headers: { "content-type": "application/octet-stream" } });
  });
  const api = defineApi({
    baseURL: "https://api.example.com",
    headers: () => {
      inheritedHeaders++;
      return { Authorization: "Bearer private", "x-secret": "private" };
    },
    middleware: {
      onRequest: [
        (request) => {
          inheritedMiddleware++;
          request.headers.set("x-custom-secret", "private");
        },
      ],
    },
    transport,
    resources: {
      files: {
        path: "/files",
        operations: {
          download: { kind: "read", method: "GET", responseType: "blob", presigned: policy },
          custom: {
            kind: "read",
            presigned: policy,
            run: (ctx) => ctx.request({ responseType: "blob", presigned: { url } }),
          },
        },
      },
    },
  });
  return {
    api,
    sent,
    get inheritedHeaders() {
      return inheritedHeaders;
    },
    get inheritedMiddleware() {
      return inheritedMiddleware;
    },
  };
}
describe("explicit presigned destinations", () => {
  it("isolates inherited credentials/providers/middleware and preserves the exact query", async () => {
    const test = setup();
    const response = await test.api.files.download({ presigned: { url }, full: true });
    expect(await response.data.text()).toBe("binary");
    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]!.url).toBe(url);
    expect(test.sent[0]!.init.credentials).toBe("omit");
    expect(test.sent[0]!.init.redirect).toBe("error");
    expect([...new Headers(test.sent[0]!.init.headers)]).toEqual([]);
    expect(test.inheritedHeaders).toBe(0);
    expect(test.inheritedMiddleware).toBe(0);
    expect(response.request.url).not.toContain("Signature");
    expect(response.raw!.url).not.toContain("Signature");
  });
  it("supports ctx.request without changing its read/write restriction", async () => {
    const test = setup();
    expect(await (await test.api.files.custom()).text()).toBe("binary");
    expect(test.inheritedHeaders).toBe(0);
  });
  it.each([
    "https://evil.example/key",
    "http://storage.example.com/key",
    "//storage.example.com/key",
    "https://user:secret@storage.example.com/key",
    "https://storage.example.com/key#fragment",
    "not a URL",
  ])("rejects %s without sending", async (destination) => {
    const test = setup();
    await expect(
      test.api.files.download({ presigned: { url: destination } }),
    ).rejects.toBeInstanceOf(SecurityError);
    expect(test.sent).toHaveLength(0);
  });
  it("rejects headers outside the signed policy", async () => {
    const test = setup();
    await expect(
      test.api.files.download({ presigned: { url, headers: { Authorization: "private" } } }),
    ).rejects.toBeInstanceOf(SecurityError);
    expect(test.sent).toHaveLength(0);
  });
  it("fails closed when a custom transport cannot enforce the policy", async () => {
    let sends = 0;
    const transport: Transport = {
      async request() {
        sends++;
        throw new Error("must not send");
      },
    };
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      resources: {
        files: {
          path: "/files",
          operations: { get: { kind: "read", method: "GET", presigned: policy } },
        },
      },
    });
    await expect(api.files.get({ presigned: { url } })).rejects.toBeInstanceOf(ConfigError);
    expect(sends).toBe(0);
  });
  it("checks explicitly trusted middleware headers after execution", async () => {
    let sends = 0;
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFetchTransport(async () => {
        sends++;
        return new Response("x");
      }),
      resources: {
        files: {
          path: "/files",
          operations: {
            get: {
              kind: "read",
              method: "GET",
              presigned: {
                ...policy,
                requestMiddleware: [
                  (request) => {
                    request.headers.set("x-secret", "private");
                  },
                ],
              },
            },
          },
        },
      },
    });
    await expect(api.files.get({ presigned: { url } })).rejects.toBeInstanceOf(SecurityError);
    expect(sends).toBe(0);
  });
  it("redacts errors, nested causes, request metadata and disables signed replay", async () => {
    let replay: unknown;
    const api = defineApi({
      baseURL: "https://api.example.com",
      middleware: {
        onError: [
          (error, context) => {
            replay = context.replay;
          },
        ],
      },
      transport: createFetchTransport(async () => {
        throw new Error(url);
      }),
      resources: {
        files: {
          path: "/files",
          operations: { get: { kind: "read", method: "GET", presigned: policy } },
        },
      },
    });
    const error = await api.files.get({ presigned: { url } }).catch((e) => e);
    if (!(error instanceof ApiError)) throw new Error("Expected ApiError");
    expect(error.message).toBe("Presigned request failed.");
    expect(error.cause).toBeUndefined();
    expect(error.request!.url).toBe("[presigned destination]");
    expect(replay).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("Signature");
  });
});

it("redacts an already materialized signed-error stack before observers receive it", async () => {
  const { NetworkError } = await import("apixa/core");
  const transport: Transport = {
    capabilities: { presigned: true },
    async request() {
      const error = new NetworkError(url);
      void error.stack;
      throw error;
    },
  };
  const api = defineApi({
    baseURL: "https://api.example",
    transport,
    resources: {
      files: {
        path: "/files",
        operations: { get: { kind: "read", method: "GET", presigned: policy } },
      },
    },
  });
  const error = await api.files.get({ presigned: { url } }).catch((e) => e);
  if (!(error instanceof Error)) throw new Error("Expected signed request failure");
  expect(error.stack).not.toMatch(/Signature|temporary|a%2Fb/);
});

it("presigned download body limits remain enforced", async () => {
  const test = setup();
  await expect(
    test.api.files.download({ presigned: { url }, maxResponseSize: 2 }),
  ).rejects.toBeInstanceOf((await import("apixa/core")).ValidationError);
});
