import { ValidationError } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

describe.each(["live", "mock"] as const)("MIME rules (%s)", (mode) => {
  const make = (rules: Record<string, unknown>) =>
    petApi(mode, { resource: { fileFields: { photo: rules, docs: {} } } });
  const pass = async (rules: Record<string, unknown>, f: File) =>
    make(rules)
      .api.pets.create({ photo: f })
      .then(
        () => true,
        (e) => (e instanceof ValidationError ? false : Promise.reject(e)),
      );

  it("accepts exact types and wildcards, case-insensitively, ignoring parameters", async () => {
    expect(await pass({ accept: ["application/pdf"] }, file(1, "a.pdf", "application/pdf"))).toBe(
      true,
    );
    expect(await pass({ accept: ["Application/PDF"] }, file(1, "a.pdf", "application/pdf"))).toBe(
      true,
    );
    expect(await pass({ accept: ["image/*"] }, file(1, "a.png", "image/webp"))).toBe(true);
    expect(
      await pass({ accept: ["text/plain"] }, file(1, "a.txt", "Text/Plain; charset=UTF-8")),
    ).toBe(true);
    expect(await pass({ accept: ["*/*"] }, file(1, "a.bin", "application/x-anything"))).toBe(true);
    expect(await pass({ accept: ["image/*"] }, file(1, "a.pdf", "application/pdf"))).toBe(false);
    expect(await pass({ accept: ["image/png"] }, file(1, "a.jpg", "image/jpeg"))).toBe(false);
  });

  it("an allow-list rejects an unknown type by default and can allow it", async () => {
    expect(await pass({ accept: ["image/*"] }, file(1, "a.heic", ""))).toBe(false);
    expect(await pass({ accept: ["image/*"], unknownType: "allow" }, file(1, "a.heic", ""))).toBe(
      true,
    );
    // Without accept, an unknown type has nothing to be checked against.
    expect(await pass({ maxSize: 10 }, file(1, "a.heic", ""))).toBe(true);
    expect(await pass({ reject: ["image/*"] }, file(1, "a.heic", ""))).toBe(true);
  });

  it("an extension entry in accept rescues an unknown type, and a MIME entry rescues a wrong extension", async () => {
    expect(await pass({ accept: ["image/*", ".heic"] }, file(1, "IMG_1.HEIC", ""))).toBe(true);
    expect(await pass({ accept: ["image/*"] }, file(1, "photo.exe", "image/png"))).toBe(true);
  });

  it("reject wins over accept", async () => {
    const rules = { accept: ["image/*"], reject: ["image/svg+xml"] };
    expect(await pass(rules, file(1, "a.svg", "image/svg+xml"))).toBe(false);
    expect(await pass(rules, file(1, "a.png", "image/png"))).toBe(true);
  });

  it("violations carry codes, never the type or name", async () => {
    const secret = file(1, "secret-payroll-2024.exe", "application/x-msdownload");
    const error = (await rejection(
      make({ accept: ["image/*"] }).api.pets.create({ photo: secret }),
    )) as ValidationError;
    expect(error.violations).toEqual([
      { code: "TYPE_NOT_ALLOWED", path: "$.photo", rule: "accept" },
    ]);
    const text = JSON.stringify(error.violations) + error.message;
    expect(text).not.toMatch(/secret|payroll|msdownload/);
  });
});
