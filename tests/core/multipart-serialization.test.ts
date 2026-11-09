import { SerializationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import {
  containsBinary,
  serializeBody,
  serializeMultipart,
  type MultipartRuntime,
} from "../../packages/core/src/http/index.js";

const file = (name: string, content = "x", type = "text/plain") =>
  new File([content], name, { type });

/** Flatten FormData for assertions; files render as `File(name)`. */
const parts = (form: FormData): Array<[string, string]> =>
  [...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `File(${v.name})`]);

const runtime = (
  partial: Partial<MultipartRuntime> & { arrays?: never } = {},
): MultipartRuntime => ({
  options: { nulls: "empty", arrays: "brackets" },
  aliases: new Map(),
  jsonFields: new Set(),
  ...partial,
});

describe("containsBinary", () => {
  it("finds Blob and File at any depth, ignores everything else", () => {
    expect(containsBinary({ a: file("a") })).toBe(true);
    expect(containsBinary({ a: { b: [new Blob(["x"])] } })).toBe(true);
    expect(containsBinary({ a: "x", b: [1, { c: null }], d: new Date() })).toBe(false);
    expect(containsBinary("text")).toBe(false);
    expect(containsBinary(null)).toBe(false);
  });

  it("terminates on cycles", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(containsBinary(loop)).toBe(false);
  });
});

describe("serializeMultipart rules", () => {
  it("encodes scalars and omits undefined", () => {
    const form = serializeMultipart({
      name: "Ada",
      age: 36,
      admin: true,
      big: 10n,
      born: new Date("2020-01-02T03:04:05.000Z"),
      skip: undefined,
    });
    expect(parts(form)).toEqual([
      ["name", "Ada"],
      ["age", "36"],
      ["admin", "true"],
      ["big", "10"],
      ["born", "2020-01-02T03:04:05.000Z"],
    ]);
  });

  it("sends null as an empty part by default and omits it on request", () => {
    expect(parts(serializeMultipart({ a: null }))).toEqual([["a", ""]]);
    const omit = runtime({ options: { nulls: "omit", arrays: "brackets" } });
    expect(parts(serializeMultipart({ a: null, b: "x" }, omit))).toEqual([["b", "x"]]);
  });

  it("uses bracket notation for nested objects", () => {
    const form = serializeMultipart({ address: { city: "Oslo", geo: { lat: 1 } } });
    expect(parts(form)).toEqual([
      ["address[city]", "Oslo"],
      ["address[geo][lat]", "1"],
    ]);
  });

  it("uses key[] for scalar arrays and indices for object arrays", () => {
    const form = serializeMultipart({ tags: ["a", "b"], items: [{ n: 1 }, { n: 2 }] });
    expect(parts(form)).toEqual([
      ["tags[]", "a"],
      ["tags[]", "b"],
      ["items[0][n]", "1"],
      ["items[1][n]", "2"],
    ]);
  });

  it("supports indexed and repeated scalar-array notation", () => {
    const indices = runtime({ options: { nulls: "empty", arrays: "indices" } });
    const repeat = runtime({ options: { nulls: "empty", arrays: "repeat" } });
    expect(parts(serializeMultipart({ t: ["a", "b"] }, indices))).toEqual([
      ["t[0]", "a"],
      ["t[1]", "b"],
    ]);
    expect(parts(serializeMultipart({ t: ["a", "b"] }, repeat))).toEqual([
      ["t", "a"],
      ["t", "b"],
    ]);
  });

  it("repeats the field name for file lists and keeps names, types and bytes", async () => {
    const a = file("a.txt", "AAA", "text/plain");
    const b = file("b.png", "BBB", "image/png");
    const form = serializeMultipart({ avatar: a, documents: [a, b] });
    expect(parts(form)).toEqual([
      ["avatar", "File(a.txt)"],
      ["documents", "File(a.txt)"],
      ["documents", "File(b.png)"],
    ]);
    const sent = form.getAll("documents") as File[];
    expect(sent[1]!.type).toBe("image/png");
    expect(await sent[1]!.text()).toBe("BBB");
  });

  it("names a bare Blob 'blob' and keeps its type", () => {
    const form = serializeMultipart({ data: new Blob(["z"], { type: "application/zip" }) });
    const sent = form.get("data") as File;
    expect(sent.name).toBe("blob");
    expect(sent.type).toBe("application/zip");
  });

  it("encodes a top-level array body as items[i][field]", () => {
    const form = serializeMultipart([{ name: "a", avatar: file("1.txt") }, { name: "b" }]);
    expect(parts(form)).toEqual([
      ["items[0][name]", "a"],
      ["items[0][avatar]", "File(1.txt)"],
      ["items[1][name]", "b"],
    ]);
  });

  it("applies verbatim aliases and JSON-encoded fields to top-level names", () => {
    const form = serializeMultipart(
      { avatar: file("a.txt"), meta: { k: [1, 2] } },
      runtime({ aliases: new Map([["avatar", "profile_image[]"]]), jsonFields: new Set(["meta"]) }),
    );
    expect(parts(form)).toEqual([
      ["profile_image[]", "File(a.txt)"],
      ["meta", '{"k":[1,2]}'],
    ]);
  });

  it("does not mutate the caller's body", () => {
    const body = { avatar: file("a"), nested: { list: ["x"] } };
    const snapshot = structuredClone({ nested: body.nested });
    serializeMultipart(body);
    expect(body.nested).toEqual(snapshot.nested);
    expect(Object.keys(body)).toEqual(["avatar", "nested"]);
  });

  it("rejects unsupported values with the path only", () => {
    const cases: Array<[unknown, string]> = [
      [{ fn: () => 1 }, "$.fn"],
      [{ sym: Symbol("s") }, "$.sym"],
      [{ deep: { m: new Map() } }, "$.deep.m"],
      [{ list: [new Set()] }, "$.list[0]"],
      [{ d: new Date("nope") }, "$.d"],
    ];
    for (const [body, path] of cases) {
      let error: unknown;
      try {
        serializeMultipart(body);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SerializationError);
      expect((error as SerializationError).path).toBe(path);
      expect((error as SerializationError).code).toBe("SERIALIZATION");
    }
  });

  it("rejects cycles, over-deep values and binary inside JSON fields without leaking contents", () => {
    const loop: Record<string, unknown> = { secret: "TOP-SECRET" };
    loop.self = loop;
    expect(() => serializeMultipart({ loop })).toThrow(SerializationError);
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 40; i++) deep = { n: deep };
    expect(() => serializeMultipart({ deep })).toThrow(SerializationError);
    try {
      serializeMultipart(
        { meta: { f: file("secret-name.txt", "TOP-SECRET") } },
        runtime({ jsonFields: new Set(["meta"]) }),
      );
      expect.unreachable();
    } catch (error) {
      const text = String((error as Error).message) + JSON.stringify(error);
      expect(text).not.toContain("TOP-SECRET");
      expect(text).not.toContain("secret-name");
    }
  });
});

describe("serializeBody format selection", () => {
  it("keeps JSON for bodies without binary values", () => {
    const headers = new Headers();
    expect(serializeBody({ a: 1 }, headers)).toBe('{"a":1}');
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("switches to multipart automatically and removes Content-Type", () => {
    const headers = new Headers({ "content-type": "application/json", accept: "x" });
    const body = serializeBody({ a: file("a") }, headers);
    expect(body).toBeInstanceOf(FormData);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("accept")).toBe("x");
  });

  it("forces multipart for binary-free bodies with dataFormat multipart", () => {
    expect(serializeBody({ a: 1 }, new Headers(), { dataFormat: "multipart" })).toBeInstanceOf(
      FormData,
    );
  });

  it("refuses to JSON-stringify binary values", () => {
    expect(() => serializeBody({ a: file("a") }, new Headers(), { dataFormat: "json" })).toThrow(
      SerializationError,
    );
  });

  it("removes Content-Type for a caller-built FormData and passes other raw bodies through", () => {
    const headers = new Headers({ "content-type": "application/json" });
    const form = new FormData();
    expect(serializeBody(form, headers)).toBe(form);
    expect(headers.has("content-type")).toBe(false);
    const blob = new Blob(["x"]);
    expect(serializeBody(blob, new Headers())).toBe(blob);
    expect(serializeBody("raw", new Headers())).toBe("raw");
  });

  it("lets a real fetch Request generate the boundary", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    const body = serializeBody({ a: file("a") }, headers)!;
    const request = new Request("https://example.test/x", { method: "POST", headers, body });
    expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
  });
});
