import { ConfigError, defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

const build = (resource: Record<string, unknown>) => () =>
  defineApi<{ pets: { path: "/pets"; entity: { id: string; photo?: string | null } } }>()({
    baseURL: "https://api.example.com",
    resources: { pets: { path: "/pets", ...resource } },
  } as never);

describe("file rule configuration", () => {
  it.each([
    [
      "negative size",
      { fileFields: { photo: { maxSize: -1 } } },
      /maxSize must be a non-negative integer/,
    ],
    [
      "fractional size",
      { fileFields: { photo: { minSize: 1.5 } } },
      /minSize must be a non-negative integer/,
    ],
    [
      "NaN count",
      { fileFields: { photo: { max: Number.NaN } } },
      /max must be a non-negative integer/,
    ],
    [
      "string size",
      { fileFields: { photo: { maxSize: "5MB" } } },
      /maxSize must be a non-negative integer/,
    ],
    ["min > max", { fileFields: { photo: { min: 3, max: 2 } } }, /min \(3\) must not exceed/],
    [
      "minSize > maxSize",
      { fileFields: { photo: { minSize: 9, maxSize: 2 } } },
      /minSize \(9\) must not exceed/,
    ],
    ["empty accept", { fileFields: { photo: { accept: [] } } }, /accept must be a non-empty array/],
    ["bad accept entry", { fileFields: { photo: { accept: ["png"] } } }, /invalid entry/],
    ["bad extension entry", { fileFields: { photo: { reject: [".a/b"] } } }, /invalid entry/],
    ["bad unknownType", { fileFields: { photo: { unknownType: "maybe" } } }, /unknownType must be/],
    [
      "bad filename mode",
      { fileFields: { photo: { filename: "loose" } } },
      /filename must be "strict"/,
    ],
    [
      "unknown fileLimits key",
      { fileLimits: { maxEverything: 1 } },
      /unknown option "maxEverything"/,
    ],
    [
      "bad fileLimits value",
      { fileLimits: { maxFiles: -2 } },
      /maxFiles must be a non-negative integer/,
    ],
    ["fileLimits not an object", { fileLimits: 5 }, /fileLimits must be/],
    [
      "op fileFields array",
      { operations: { create: { fileFields: ["photo"] } } },
      /must be an object of file rule overrides/,
    ],
    [
      "op rule for an undeclared field",
      {
        fileFields: { photo: {} },
        operations: { create: { fileFields: { nope: { maxSize: 1 } } } },
      },
      /"nope" is not declared/,
    ],
    [
      "op rule with alias",
      {
        fileFields: { photo: {} },
        operations: { create: { fileFields: { photo: { name: "x" } } } },
      },
      /unknown option "name"/,
    ],
    [
      "bad maxResponseSize",
      { operations: { x: { kind: "read", method: "GET", path: "/x", maxResponseSize: -1 } } },
      /maxResponseSize must be a non-negative integer/,
    ],
    [
      "bad responseAccept",
      { operations: { x: { kind: "read", method: "GET", path: "/x", responseAccept: [".pdf"] } } },
      /not an extension/,
    ],
  ])("rejects %s with ConfigError", (_name, resource, message) => {
    expect(build(resource)).toThrow(ConfigError);
    expect(build(resource)).toThrow(message);
  });

  it("accepts the documented forms and keeps the shorthand and { name } forms", () => {
    expect(
      build({
        fileFields: {
          photo: {
            name: "avatar",
            maxSize: 10,
            min: 0,
            max: 1,
            accept: ["image/*", ".HEIC"],
            reject: [".exe"],
            unknownType: "allow",
            noExtension: "reject",
            filename: "strict",
          },
        },
        fileLimits: { maxTotalSize: 0, maxFiles: 1, maxBodySize: 5 },
      }),
    ).not.toThrow();
    expect(build({ fileFields: ["photo"] })).not.toThrow();
    expect(build({ fileFields: { photo: { name: "avatar" } } })).not.toThrow();
  });

  it("a per-call maxResponseSize must be a non-negative integer", async () => {
    const { api } = petApi("live");
    const error = await rejection(api.pets.getAll({ maxResponseSize: -1 }));
    expect(error).toBeInstanceOf(ConfigError);
  });
});

describe("precedence: resource → operation, key-wise", () => {
  const sizes = async (
    resource: Record<string, unknown>,
    op: Record<string, unknown> | undefined,
  ) => {
    const { api } = petApi("live", {
      resource: {
        ...resource,
        operations: {
          create: op ?? {},
          upload: { kind: "write", method: "POST", path: "/upload" },
        },
      },
    });
    const out: number[] = [];
    for (const size of [5, 15, 25]) {
      const e = await rejection(api.pets.create({ photo: file(size) }));
      if (!e) out.push(size);
    }
    return out;
  };

  it("resource rules apply when the operation says nothing", async () => {
    expect(await sizes({ fileFields: { photo: { maxSize: 10 } } }, undefined)).toEqual([5]);
  });
  it("an operation override replaces only the keys it defines", async () => {
    expect(
      await sizes(
        { fileFields: { photo: { maxSize: 10, accept: ["image/*"] } } },
        { fileFields: { photo: { maxSize: 20 } } },
      ),
    ).toEqual([5, 15]);
    // accept (resource) still applies to the overriding operation:
    const { api } = petApi("live", {
      resource: {
        fileFields: { photo: { maxSize: 10, accept: ["image/*"] } },
        operations: { create: { fileFields: { photo: { maxSize: 20 } } } },
      },
    });
    expect(
      await rejection(api.pets.create({ photo: file(5, "a.pdf", "application/pdf") })),
    ).toBeDefined();
  });
  it("fileLimits merge key-wise too", async () => {
    const { api } = petApi("live", {
      resource: {
        fileLimits: { maxFiles: 1, maxTotalSize: 100 },
        operations: { create: { fileLimits: { maxFiles: 2 } } },
      },
    });
    await expect(api.pets.create({ docs: [file(1), file(1)] })).resolves.toBeDefined(); // maxFiles 2 from the op
    expect(await rejection(api.pets.create({ docs: [file(60), file(60)] }))).toBeDefined(); // total 100 from the resource
  });
  it("rules reach custom operations through the resource declaration", async () => {
    const { api } = petApi("live", { resource: { fileFields: { photo: { maxSize: 10 } } } });
    expect(await rejection(api.pets.upload({ photo: file(50) }))).toBeDefined();
  });
});

describe("zero cost when unconfigured", () => {
  it("nothing is walked, wrapped or rejected without rules", async () => {
    const { api, calls } = petApi("live", { resource: { fileFields: ["photo", "docs"] } });
    const huge = file(3 * 1024 * 1024, "../../etc/passwd", "");
    await expect(api.pets.create({ photo: huge })).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.limits).toBeUndefined();
    expect(calls[0]!.body).toBeInstanceOf(FormData);
  });
});
