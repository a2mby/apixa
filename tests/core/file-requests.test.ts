import {
  AbortError,
  ConfigError,
  SerializationError,
  defineApi,
  type ApiRequest,
  type TransportRequest,
} from "@apixa/core";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = {
  id: string;
  firstName: string;
  avatar: string;
  documents: string[];
  banner?: string | null;
};
type AppApi = { users: { path: "/users"; entity: User } };

const file = (name: string, content = "x", type = "text/plain") =>
  new File([content], name, { type });

function setup(
  resource: Record<string, unknown> = {},
  root: Record<string, unknown> = {},
  respond: (n: number, request: TransportRequest) => { status?: number; body?: unknown } = (
    _n,
    request,
  ) => ({
    body:
      request.url.endsWith("/bulk") ||
      (request.method === "GET" && request.url === "https://api.example.com/users")
        ? []
        : { id: "1" },
  }),
) {
  const seen: TransportRequest[] = [];
  const transport = createFakeTransport((request) => {
    seen.push(request);
    return respond(seen.length, request);
  });
  const api = defineApi<AppApi>()({
    baseURL: "https://api.example.com",
    transport,
    ...root,
    resources: {
      users: { path: "/users", fileFields: ["avatar", "documents", "banner"], ...resource },
    },
  } as never) as never as {
    users: Record<string, (...args: unknown[]) => Promise<unknown>>;
  };
  return { api, seen };
}

const form = (request: TransportRequest) => request.body as FormData;
const entries = (data: FormData): Array<[string, string]> =>
  [...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `File(${v.name})`]);

describe("automatic multipart on builtin writes", () => {
  it("sends multipart for create with files, without any Content-Type", async () => {
    const { api, seen } = setup(
      {},
      { headers: { "Content-Type": "application/json", Accept: "a/b" } },
    );
    await api.users.create!({
      firstName: "Ada",
      avatar: file("me.png", "PNG", "image/png"),
      documents: [file("a.txt"), file("b.txt")],
    });
    const request = seen[0]!;
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.headers.has("content-type")).toBe(false);
    expect(request.headers.get("accept")).toBe("a/b");
    expect(entries(form(request))).toEqual([
      ["firstName", "Ada"],
      ["avatar", "File(me.png)"],
      ["documents", "File(a.txt)"],
      ["documents", "File(b.txt)"],
    ]);
    const sent = form(request).get("avatar") as File;
    expect(sent.type).toBe("image/png");
    expect(await sent.text()).toBe("PNG");
  });

  it.each(["update", "patch"])(
    "%s sends multipart when a file is present",
    async (op) => {
      const { api, seen } = setup();
      await api.users[op]!("7", { body: { avatar: file("a.txt") } });
      expect(seen[0]!.method).toBe(op === "patch" ? "PATCH" : "PUT");
      expect(seen[0]!.body).toBeInstanceOf(FormData);
    },
  );

  it("keeps JSON when no binary value is present", async () => {
    const { api, seen } = setup();
    await api.users.update!("7", { body: { firstName: "Ada" } });
    expect(seen[0]!.body).toBe('{"firstName":"Ada"}');
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
  });

  it("encodes createMany as items[i][field]", async () => {
    const { api, seen } = setup();
    await api.users.createMany!([{ firstName: "A", avatar: file("1.txt") }, { firstName: "B" }]);
    expect(entries(form(seen[0]!))).toEqual([
      ["items[0][firstName]", "A"],
      ["items[0][avatar]", "File(1.txt)"],
      ["items[1][firstName]", "B"],
    ]);
  });

  it("does not touch bodyless operations", async () => {
    const { api, seen } = setup();
    await api.users.getAll!();
    await api.users.delete!("1");
    expect(seen.map((r) => r.body)).toEqual([undefined, undefined]);
  });
});

describe("dataFormat, aliases and multipart options", () => {
  it("dataFormat json refuses binary values and never reaches the transport", async () => {
    const { api, seen } = setup({ operations: { create: { dataFormat: "json" } } });
    await expect(
      api.users.create!({ firstName: "Ada", avatar: file("SECRET-NAME.txt", "SECRET-BYTES") }),
    ).rejects.toSatisfy((error: unknown) => {
      const text = String((error as Error).message) + JSON.stringify(error);
      return (
        error instanceof SerializationError &&
        !text.includes("SECRET-NAME") &&
        !text.includes("SECRET-BYTES")
      );
    });
    expect(seen).toHaveLength(0);
  });

  it("dataFormat json still sends binary-free bodies as JSON", async () => {
    const { api, seen } = setup({ operations: { create: { dataFormat: "json" } } });
    await api.users.create!({ firstName: "Ada" });
    expect(typeof seen[0]!.body).toBe("string");
  });

  it("dataFormat multipart forces multipart without files", async () => {
    const { api, seen } = setup({ operations: { update: { dataFormat: "multipart" } } });
    await api.users.update!("1", { body: { firstName: "Ada" } });
    expect(entries(form(seen[0]!))).toEqual([["firstName", "Ada"]]);
  });

  it("applies fileFields name aliases and multipart options", async () => {
    const { api, seen } = setup({
      fileFields: { avatar: { name: "profile_image" }, documents: {} },
      multipart: { nulls: "omit", arrays: "indices", jsonFields: ["meta"] },
    });
    await api.users.create!({
      avatar: file("a.txt"),
      banner: null,
      meta: { k: 1 },
      tags: ["x", "y"],
    });
    expect(entries(form(seen[0]!))).toEqual([
      ["profile_image", "File(a.txt)"],
      ["meta", '{"k":1}'],
      ["tags[0]", "x"],
      ["tags[1]", "y"],
    ]);
  });

  it("operation multipart options override the resource's", async () => {
    const { api, seen } = setup({
      multipart: { arrays: "indices" },
      operations: { create: { multipart: { arrays: "repeat" } } },
    });
    await api.users.create!({ avatar: file("a"), tags: ["x", "y"] });
    expect(entries(form(seen[0]!)).filter(([k]) => k.startsWith("tags"))).toEqual([
      ["tags", "x"],
      ["tags", "y"],
    ]);
  });

  it("custom operations and ctx.request() choose multipart automatically", async () => {
    const { api, seen } = setup({
      operations: {
        attach: { kind: "write", method: "POST", path: "/:id/attach" },
        upload: {
          kind: "write",
          run: (ctx: { request: (init: unknown) => Promise<unknown> }, f: File) =>
            ctx.request({ method: "POST", path: "/upload", body: { file: f } }),
        },
        form: {
          kind: "write",
          run: (ctx: { request: (init: unknown) => Promise<unknown> }) =>
            ctx.request({ method: "POST", path: "/form", body: { a: 1 }, dataFormat: "multipart" }),
        },
      },
    });
    await api.users.attach!({ doc: file("d.txt") }, { params: { id: "1" } });
    await api.users.upload!(file("u.txt"));
    await api.users.form!();
    expect(seen.map((r) => r.body instanceof FormData)).toEqual([true, true, true]);
    expect(seen.every((r) => !r.headers.has("content-type"))).toBe(true);
  });
});

describe("pipeline behavior", () => {
  it("snake_case request transforms rename parts but keep file values and aliases", async () => {
    const { api, seen } = setup(
      { fileFields: { avatar: { name: "AvatarFile" } }, multipart: { jsonFields: ["firstName"] } },
      { transforms: { request: { keys: "snake_case" } } },
    );
    await api.users.create!({
      firstName: { given: "Ada" },
      avatar: file("a.txt", "BYTES"),
      documents: [file("d.txt")],
    });
    expect(entries(form(seen[0]!))).toEqual([
      ["first_name", '{"given":"Ada"}'],
      ["AvatarFile", "File(a.txt)"],
      ["documents", "File(d.txt)"],
    ]);
    expect(await (form(seen[0]!).get("AvatarFile") as File).text()).toBe("BYTES");
  });

  it("middleware sees the caller's File instances and the body is never mutated", async () => {
    const avatar = file("a.txt");
    const body = { firstName: "Ada", avatar, documents: [file("d.txt")] };
    const original = { ...body, documents: [...body.documents] };
    let seenBody: Record<string, unknown> | undefined;
    const { api } = setup(
      {},
      {
        middleware: [
          {
            onRequest: (request: ApiRequest) => {
              seenBody = request.body as Record<string, unknown>;
              return request;
            },
          },
        ],
        transforms: { request: { keys: "snake_case" } },
      },
    );
    await api.users.create!(body);
    expect(seenBody!.avatar).toBe(avatar);
    expect(body).toEqual(original);
    expect(body.avatar).toBe(avatar);
    expect(Object.keys(body)).toEqual(["firstName", "avatar", "documents"]);
  });

  it("retries resend an equivalent multipart body", async () => {
    const { api, seen } = setup(
      { operations: { update: { retry: { retries: 2, baseDelayMs: 0, methods: ["PUT"] } } } },
      {},
      (n) => (n < 3 ? { status: 503, body: { error: "x" } } : { body: { id: "1" } }),
    );
    await api.users.update!("1", { body: { avatar: file("a.txt", "AAA") } });
    expect(seen).toHaveLength(3);
    for (const request of seen) {
      expect(request.body).toBe(seen[0]!.body);
      expect(await (form(request).get("avatar") as File).text()).toBe("AAA");
    }
  });

  it("does not retry stream bodies", async () => {
    const { api, seen } = setup(
      { operations: { create: { retry: { retries: 2, baseDelayMs: 0, methods: ["POST"] } } } },
      {},
      () => ({ status: 503, body: {} }),
    );
    const stream = new ReadableStream();
    await expect(api.users.create!(stream)).rejects.toBeTruthy();
    expect(seen).toHaveLength(1);
  });

  it("an aborted signal cancels a multipart request", async () => {
    const { api } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.users.create!({ avatar: file("a") }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
  });

  it("times out a slow multipart request", async () => {
    const seen: TransportRequest[] = [];
    const transport = createFakeTransport(async (request) => {
      seen.push(request);
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { body: {} };
    });
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport,
      resources: { users: { path: "/users", fileFields: ["avatar"] } },
    }) as never as { users: Record<string, (...args: unknown[]) => Promise<unknown>> };
    await expect(api.users.create!({ avatar: file("a") }, { timeout: 20 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(seen[0]!.body).toBeInstanceOf(FormData);
  });
});

describe("configuration validation", () => {
  const build = (resource: Record<string, unknown>) => () =>
    defineApi({
      baseURL: "https://api.example.com",
      resources: { users: { path: "/users", ...resource } },
    } as never);

  it.each([
    ["non-array/object fileFields", { fileFields: "avatar" }],
    ["empty fileFields", { fileFields: [] }],
    ["duplicate fields", { fileFields: ["a", "a"] }],
    ["non-string field", { fileFields: [1] }],
    ["unsafe field", { fileFields: ["__proto__"] }],
    ["unknown field option", { fileFields: { a: { bogus: 1 } } }],
    ["empty alias", { fileFields: { a: { name: "" } } }],
    ["unknown multipart option", { multipart: { nope: 1 } }],
    ["bad nulls", { multipart: { nulls: "zero" } }],
    ["bad arrays", { multipart: { arrays: "csv" } }],
    ["bad jsonFields", { multipart: { jsonFields: [1] } }],
    ["bad dataFormat", { operations: { create: { dataFormat: "xml" } } }],
    ["dataFormat on a read operation", { operations: { getAll: { dataFormat: "json" } } }],
    [
      "dataFormat on a custom read",
      { operations: { x: { kind: "read", method: "GET", dataFormat: "json" } } },
    ],
  ])("rejects %s with ConfigError", (_name, resource) => {
    expect(build(resource)).toThrow(ConfigError);
  });

  it("accepts valid declarations and disabled operations", () => {
    expect(
      build({
        fileFields: { avatar: { name: "x" } },
        operations: { create: false, update: { dataFormat: "multipart" } },
      }),
    ).not.toThrow();
  });
});
