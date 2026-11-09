import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

/** Batch 0: behavior of the v1.3.0 tree that v1.4.0 must keep when nothing is configured. */
describe("v1.3.0 behavior without rules (preserved)", () => {
  it("sends any file, of any size, name or type, in a plain multipart body", async () => {
    const { api, calls } = petApi("live", { resource: { fileFields: ["photo", "docs"] } });
    await api.pets.create({
      photo: file(4 * 1024 * 1024, "../weird\u0000name", ""),
      docs: [file(0), file(1), file(2)],
    });
    expect(calls).toHaveLength(1);
    const form = calls[0]!.body as FormData;
    expect(form.getAll("docs[]").length + form.getAll("docs").length).toBe(3);
  });

  it("the mock store accepts any file", async () => {
    const { api } = petApi("mock", { resource: { fileFields: ["photo", "docs"] } });
    await expect(api.pets.create({ photo: file(4 * 1024 * 1024) })).resolves.toBeDefined();
  });

  it("ValidationError has its response-flavored default and an empty violations list", () => {
    const error = new ValidationError();
    expect(error.message).toBe("Response validation failed");
    expect(error.code).toBe("VALIDATION");
    expect(error.violations).toEqual([]);
  });

  it("middleware runs before serialization: a body replaced by middleware is what is sent", async () => {
    const { api, calls } = petApi("live", {
      resource: {
        requestMiddleware: [
          (request: { body: unknown }) => ({ ...request, body: { photo: file(1, "mw.png") } }),
        ],
      },
    });
    await api.pets.create({ name: "x" });
    expect(((calls[0]!.body as FormData).get("photo") as File).name).toBe("mw.png");
  });

  it("an unconfigured call has no `limits` on the transport request", async () => {
    const { api, calls } = petApi("live");
    await api.pets.getAll();
    expect(calls[0]!.limits).toBeUndefined();
  });

  it("no error for a stream body without any rule", async () => {
    const { api } = petApi("live");
    const stream = new ReadableStream({ start: (c) => (c.enqueue(new Uint8Array(3)), c.close()) });
    expect(await rejection(api.pets.upload(stream))).toBeUndefined();
  });
});
