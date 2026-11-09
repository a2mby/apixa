import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

const MB = 1024 * 1024;

describe.each(["live", "mock"] as const)("file size rules (%s)", (mode) => {
  const make = (rules: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    petApi(mode, { resource: { fileFields: { photo: rules, docs: {} }, ...extra } });

  it("maxSize: accepts the exact limit, rejects one byte over", async () => {
    const { api } = make({ maxSize: 100 });
    await expect(api.pets.create({ name: "a", photo: file(100) })).resolves.toBeDefined();
    const error = await rejection(api.pets.create({ name: "a", photo: file(101) }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations).toEqual([
      { code: "FILE_TOO_LARGE", path: "$.photo", limit: 100, actual: 101 },
    ]);
  });

  it("minSize: refuses empty files only when asked", async () => {
    await expect(make({}).api.pets.create({ name: "a", photo: file(0) })).resolves.toBeDefined();
    const { api } = make({ minSize: 1 });
    const error = (await rejection(
      api.pets.create({ name: "a", photo: file(0) }),
    )) as ValidationError;
    expect(error.violations[0]).toMatchObject({
      code: "FILE_TOO_SMALL",
      path: "$.photo",
      limit: 1,
      actual: 0,
    });
  });

  it("a size of 0 is a real limit (defined operation values win, even 0)", async () => {
    const { api } = make(
      { maxSize: 10 },
      { operations: { create: { fileFields: { photo: { maxSize: 0 } } } } },
    );
    await expect(api.pets.create({ name: "a", photo: file(0) })).resolves.toBeDefined();
    const error = (await rejection(
      api.pets.create({ name: "a", photo: file(1) }),
    )) as ValidationError;
    expect(error.violations[0]).toMatchObject({ code: "FILE_TOO_LARGE", limit: 0 });
  });

  it("applies to every file of an array field, with indexed paths", async () => {
    const { api } = petApi(mode, {
      resource: { fileFields: { photo: {}, docs: { maxSize: 10 } } },
    });
    const error = (await rejection(
      api.pets.create({ name: "a", docs: [file(5), file(20), file(30)] }),
    )) as ValidationError;
    expect(error.violations.map((v) => v.path)).toEqual(["$.docs[1]", "$.docs[2]"]);
  });

  it("maxTotalSize counts every file, including undeclared fields and nested ones", async () => {
    const { api } = make({}, { fileLimits: { maxTotalSize: 25 } });
    await expect(
      api.pets.create({ name: "a", photo: file(10), docs: [file(10)] }),
    ).resolves.toBeDefined();
    const error = (await rejection(
      api.pets.upload({ name: "a", nested: { deep: [file(10), file(10), file(10)] } }),
    )) as ValidationError;
    expect(error.violations).toEqual([
      { code: "TOTAL_TOO_LARGE", path: "$", limit: 25, actual: 30 },
    ]);
  });

  it("maxBodySize bounds a raw Blob, buffer or string body; JSON bodies are not files", async () => {
    const { api } = petApi(mode, { upload: { fileLimits: { maxBodySize: 8 } } });
    await expect(api.pets.upload(new Blob([new Uint8Array(8)]))).resolves.toBeDefined();
    for (const body of [
      new Blob([new Uint8Array(9)]),
      new Uint8Array(9),
      new ArrayBuffer(9),
      "123456789",
    ]) {
      const error = (await rejection(api.pets.upload(body))) as ValidationError;
      expect(error.violations[0]).toMatchObject({
        code: "BODY_TOO_LARGE",
        path: "$",
        limit: 8,
        actual: 9,
      });
    }
    // A big JSON object is not a raw body.
    await expect(api.pets.upload({ text: "x".repeat(1000) })).resolves.toBeDefined();
  });

  it("collects every violation in one error", async () => {
    const { api } = make({ maxSize: 5 });
    const error = (await rejection(
      api.pets.create({ name: "a", photo: file(50), docs: [file(1)] }),
    )) as ValidationError;
    expect(error.violations).toHaveLength(1);
    const { api: strict } = petApi(mode, {
      resource: { fileFields: { photo: { maxSize: 5, accept: ["application/pdf"] }, docs: {} } },
    });
    const both = (await rejection(strict.pets.create({ photo: file(50) }))) as ValidationError;
    expect(both.violations.map((v) => v.code).sort()).toEqual([
      "FILE_TOO_LARGE",
      "TYPE_NOT_ALLOWED",
    ]);
  });

  it("reads metadata only, never file bytes", async () => {
    const spy = file(50);
    for (const method of ["arrayBuffer", "text", "stream", "slice", "bytes"] as const) {
      Object.defineProperty(spy, method, {
        value: () => {
          throw new Error(`validation read ${method}`);
        },
      });
    }
    const { api } = make({ maxSize: 5 });
    const error = await rejection(api.pets.create({ photo: spy }));
    expect(error).toBeInstanceOf(ValidationError);
  });

  it("large limits pass real-sized files without configuration changes", async () => {
    const { api } = make({ maxSize: 5 * MB });
    await expect(api.pets.create({ photo: file(2 * MB) })).resolves.toBeDefined();
  });
});
