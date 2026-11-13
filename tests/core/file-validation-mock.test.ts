import { MockError, ValidationError, defineApi, mockFiles, resetMock } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { file, petApi, rejection } from "../helpers/validation.js";

type Pet = { id: number; name: string; photo?: string | null };

const config = {
  fileFields: { photo: { maxSize: 10, accept: ["image/*"] }, docs: { max: 2 } },
  fileLimits: { maxTotalSize: 25 },
};

describe("mocked and live resources share one validator", () => {
  const fixtures: Array<[string, () => unknown]> = [
    ["too large", () => ({ photo: file(50) })],
    ["wrong type", () => ({ photo: file(5, "a.pdf", "application/pdf") })],
    ["too many", () => ({ docs: [file(1), file(1), file(1)] })],
    ["total", () => ({ photo: file(10), docs: [file(10), file(10)] })],
    [
      "several at once",
      () => ({ photo: file(50, "a.pdf", "application/pdf"), docs: [file(1), file(1), file(1)] }),
    ],
  ];

  it.each(fixtures)("%s: identical violations live and mocked", async (_name, make) => {
    const live = (await rejection(
      petApi("live", { resource: config }).api.pets.create(make()),
    )) as ValidationError;
    const mocked = (await rejection(
      petApi("mock", { resource: config }).api.pets.create(make()),
    )) as ValidationError;
    expect(live).toBeInstanceOf(ValidationError);
    expect(mocked.violations).toEqual(live.violations);
    expect(mocked.message).toBe(live.message);
  });

  it("the same valid body is accepted by both", async () => {
    for (const mode of ["live", "mock"] as const) {
      await expect(
        petApi(mode, { resource: config }).api.pets.create({ photo: file(5), docs: [file(1)] }),
      ).resolves.toBeDefined();
    }
  });
});

describe("a rejected mocked write changes nothing", () => {
  const make = () =>
    defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
      baseURL: "https://api.example.com",
      resources: {
        pets: {
          path: "/pets",
          fileFields: { photo: { maxSize: 10 } },
          mock: [{ id: 1, name: "Seed", photo: null as string | null }],
        },
      },
    });

  it("create: no record, no file stored, ids not consumed", async () => {
    const api = make();
    const before = await api.pets.getAll();
    expect(
      await rejection(api.pets.create({ name: "bad", photo: file(50) } as never)),
    ).toBeInstanceOf(ValidationError);
    expect(await api.pets.getAll()).toEqual(before);
    expect(mockFiles(api).size).toBe(0);
    const ok = await api.pets.create({ name: "good", photo: file(5) } as never);
    expect(ok.id).toBe(2); // the rejected request did not burn an id
    expect(mockFiles(api).size).toBe(1);
  });

  it("update keeps the existing file reference and bytes", async () => {
    const api = make();
    const created = await api.pets.create({ name: "good", photo: file(5, "keep.png") } as never);
    const ref = created.photo as string;
    expect(
      await rejection(api.pets.update(created.id as never, { body: { photo: file(50) } as never })),
    ).toBeInstanceOf(ValidationError);
    expect((await api.pets.getById(created.id)).photo).toBe(ref);
    expect(mockFiles(api).get(ref)!.meta.name).toBe("keep.png");
    expect(mockFiles(api).size).toBe(1);
  });

  it("reset and client isolation still work; another client has its own store", async () => {
    const a = make();
    const b = make();
    await a.pets.create({ name: "a", photo: file(5) } as never);
    expect(mockFiles(a).size).toBe(1);
    expect(mockFiles(b).size).toBe(0);
    resetMock(a);
    expect(mockFiles(a).size).toBe(0);
  });
});

describe("mocked downloads respect response limits using the exact size", () => {
  const make = (extra: Record<string, unknown>) =>
    defineApi<{ pets: { path: "/pets"; entity: Pet } }>()({
      baseURL: "https://api.example.com",
      resources: {
        pets: {
          path: "/pets",
          mock: [{ id: 1, name: "Seed" }],
          operations: {
            blob: {
              kind: "read",
              method: "GET",
              path: "/blob",
              responseType: "blob",
              mock: () => new Blob([new Uint8Array(10)], { type: "image/png" }),
              ...extra,
            },
            text: {
              kind: "read",
              method: "GET",
              path: "/text",
              responseType: "text",
              mock: () => "héllo",
              ...extra,
            },
            feed: {
              kind: "read",
              method: "GET",
              path: "/feed",
              responseType: "stream",
              mock: () => "x",
            },
          },
        },
      },
    } as never) as never as { pets: Record<string, (o?: object) => Promise<unknown>> };

  it("limit at the exact size passes; one byte less fails", async () => {
    await expect(make({ maxResponseSize: 10 }).pets.blob!()).resolves.toBeInstanceOf(Blob);
    const error = (await rejection(make({ maxResponseSize: 9 }).pets.blob!())) as ValidationError;
    expect(error.violations).toEqual([
      { code: "RESPONSE_TOO_LARGE", path: "$", limit: 9, actual: 10 },
    ]);
    await expect(make({ maxResponseSize: 6 }).pets.text!()).resolves.toBe("héllo"); // 6 UTF-8 bytes
    expect(await rejection(make({ maxResponseSize: 5 }).pets.text!())).toBeInstanceOf(
      ValidationError,
    );
  });

  it("a per-call limit wins; responseAccept checks the content type", async () => {
    const api = make({ maxResponseSize: 1000 });
    expect(await rejection(api.pets.blob!({ maxResponseSize: 3 }))).toBeInstanceOf(ValidationError);
    expect(
      await rejection(make({ responseAccept: ["application/pdf"] }).pets.blob!()),
    ).toBeInstanceOf(ValidationError);
    await expect(make({ responseAccept: ["image/*"] }).pets.blob!()).resolves.toBeInstanceOf(Blob);
  });

  it("mocked stream stays MOCK_UNSUPPORTED", async () => {
    const error = await rejection(make({}).pets.feed!());
    expect(error).toBeInstanceOf(MockError);
  });
});
