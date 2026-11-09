import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

describe.each(["live", "mock"] as const)("file count rules (%s)", (mode) => {
  const make = (docs: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    petApi(mode, { resource: { fileFields: { photo: { max: 1 }, docs }, ...extra } });
  const codes = (e: unknown) => (e as ValidationError).violations.map((v) => `${v.code}@${v.path}`);

  it("max: at the limit passes, one over fails", async () => {
    const { api } = make({ max: 2 });
    await expect(api.pets.create({ docs: [file(1), file(1)] })).resolves.toBeDefined();
    expect(codes(await rejection(api.pets.create({ docs: [file(1), file(1), file(1)] })))).toEqual([
      "TOO_MANY_FILES@$.docs",
    ]);
  });

  it("a single-file field with max: 1 rejects an array of two", async () => {
    const { api } = make({});
    expect(codes(await rejection(api.pets.create({ photo: [file(1), file(1)] })))).toEqual([
      "TOO_MANY_FILES@$.photo",
    ]);
  });

  it("min applies only when the field is present", async () => {
    const { api } = make({ min: 2 });
    await expect(api.pets.create({ name: "no docs at all" })).resolves.toBeDefined();
    await expect(api.pets.create({ name: "cleared", docs: null })).resolves.toBeDefined();
    expect(codes(await rejection(api.pets.create({ docs: [file(1)] })))).toEqual([
      "TOO_FEW_FILES@$.docs",
    ]);
    expect(codes(await rejection(api.pets.create({ docs: [] })))).toEqual(["TOO_FEW_FILES@$.docs"]);
    await expect(api.pets.create({ docs: [file(1), file(1)] })).resolves.toBeDefined();
  });

  it("fileLimits.maxFiles counts all files in the request", async () => {
    const { api } = make({}, { fileLimits: { maxFiles: 2 } });
    await expect(api.pets.create({ photo: file(1), docs: [file(1)] })).resolves.toBeDefined();
    expect(
      codes(await rejection(api.pets.create({ photo: file(1), docs: [file(1), file(1)] }))),
    ).toEqual(["TOO_MANY_FILES@$"]);
  });

  it("nested objects and arrays are walked; JSON values are not files", async () => {
    const { api } = petApi(mode, { upload: { fileLimits: { maxFiles: 1 } } });
    await expect(
      api.pets.upload({ meta: { a: 1, b: ["x", null, 3] }, one: { deep: [file(1)] } }),
    ).resolves.toBeDefined();
    expect(
      codes(await rejection(api.pets.upload({ a: { b: [file(1), { c: file(1) }] } }))),
    ).toEqual(["TOO_MANY_FILES@$"]);
  });

  it("a wire alias does not change which field a file belongs to", async () => {
    const { api } = petApi(mode, {
      resource: { fileFields: { photo: { name: "avatar_file", max: 1 }, docs: {} } },
    });
    expect(codes(await rejection(api.pets.create({ photo: [file(1), file(1)] })))).toEqual([
      "TOO_MANY_FILES@$.photo",
    ]);
  });

  it("caller-built FormData is validated by part name (alias respected)", async () => {
    if (mode === "mock") return; // a mocked body is the plain object, not a FormData
    const { api } = petApi(mode, {
      resource: { fileFields: { photo: { name: "avatar_file", max: 1 }, docs: {} } },
    });
    const form = new FormData();
    form.append("avatar_file", file(1));
    form.append("avatar_file", file(1));
    expect(codes(await rejection(api.pets.upload(form)))).toEqual(["TOO_MANY_FILES@$.photo"]);
    const ok = new FormData();
    ok.append("avatar_file", file(1));
    ok.append("name", "x");
    await expect(api.pets.upload(ok)).resolves.toBeDefined();
  });

  it("a cyclic body cannot hang validation", async () => {
    const { api } = make({ max: 1 });
    const body: Record<string, unknown> = { docs: [file(1)] };
    body.self = body;
    await rejection(api.pets.upload(body)); // settles (error or not); the walk is cycle-safe
    expect(true).toBe(true);
  });
});
