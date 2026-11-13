import {
  defineApi,
  mockFiles,
  resetMock,
  mockFileFixture,
  mockFixtureRef,
  ValidationError,
  registerMockDatasetLoader,
} from "@apixa/core";
import { describe, expect, it, vi } from "vitest";
const fixtures = {
  greeting: mockFileFixture("hello", { name: "hello.txt", type: "text/plain", lastModified: 12 }),
  empty: mockFileFixture(new Uint8Array(), { name: "empty.bin" }),
};
const make = () =>
  defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file", "files"],
        mock: {
          data: [
            {
              id: 1,
              file: mockFixtureRef("greeting"),
              files: [mockFixtureRef("greeting"), mockFixtureRef("empty")],
            },
          ],
          fixtures,
        },
        operations: {
          download: {
            kind: "read",
            method: "GET",
            path: "/:id/download",
            responseType: "blob",
            mock: ({ store, params, files }) =>
              files.get(String(store.get(Number(params.id)).file)).blob(),
          },
        },
      },
    },
  });

describe("file fixtures and existing lazy datasets", () => {
  it("resolves explicit scalar and array markers to ordinary refs, then downloads", async () => {
    const api = make();
    expect(mockFiles(api).size).toBe(0);
    const row = await api.docs.getById(1);
    expect(row.file).toMatch(/^mock-file:\/\//);
    expect(row.files[0]).toBe(row.file);
    expect(mockFiles(api).size).toBe(2);
    expect(mockFiles(api).get(row.file)?.meta).toMatchObject({
      name: "hello.txt",
      type: "text/plain",
      size: 5,
      lastModified: 12,
    });
    expect(await (await api.docs.download({ params: { id: 1 } })).text()).toBe("hello");
  });
  it("keeps ordinary strings unchanged, even strings looking like proposed URI tokens", async () => {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: { data: [{ id: 1, file: "mock-fixture://greeting" }], fixtures },
        },
      },
    });
    expect((await api.docs.getById(1)).file).toBe("mock-fixture://greeting");
    expect(mockFiles(api).size).toBe(0);
  });
  it("only loads fixtures selected by seed slicing, sequentially and once per resource", async () => {
    const load = vi.fn(() => fixtures.greeting);
    const skipped = vi.fn(() => {
      throw Error("must not load");
    });
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: {
            data: [
              { id: 1, file: mockFixtureRef("keep") },
              { id: 2, file: mockFixtureRef("skip") },
            ],
            seed: { limit: 1 },
            fixtures: { keep: load, skip: skipped },
          },
        },
      },
    });
    await Promise.all([api.docs.getAll(), api.docs.getAll()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(skipped).not.toHaveBeenCalled();
  });
  it("rolls back all seed files on missing keys and retries initialization", async () => {
    let good = false;
    const provider = vi.fn(() => [
      { id: 1, files: [mockFixtureRef("greeting"), mockFixtureRef(good ? "empty" : "missing")] },
    ]);
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: { path: "/docs", fileFields: ["files"], mock: { data: provider, fixtures } },
      },
    });
    await expect(api.docs.getAll()).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
    expect(mockFiles(api).size).toBe(0);
    good = true;
    expect(await api.docs.getAll()).toHaveLength(1);
    expect(mockFiles(api).size).toBe(2);
  });
  it("rejects foreign/stale refs only for an opted-in registry", async () => {
    const ref = "mock-file://00000000-0000-4000-8000-000000000001/a";
    for (const strict of [false, true]) {
      const api = defineApi({
        baseURL: "https://example.test",
        resources: {
          docs: {
            path: "/docs",
            fileFields: ["file"],
            mock: { data: [{ id: 1, file: ref }], ...(strict ? { fixtures } : {}) },
          },
        },
      });
      if (strict)
        await expect(api.docs.getAll()).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
      else expect((await api.docs.getById(1)).file).toBe(ref);
    }
  });
  it("pins fixture baseline bytes, repairs explicit deletion on reset, and never mutates input", async () => {
    const api = make();
    const row = await api.docs.getById(1);
    await api.docs.delete(1);
    expect(mockFiles(api).has(row.file)).toBe(true);
    mockFiles(api).clear();
    expect(mockFiles(api).size).toBe(0);
    resetMock(api);
    expect(mockFiles(api).size).toBe(0);
    const reset = await api.docs.getById(1);
    expect(mockFiles(api).get(reset.file)?.text()).toBe("hello");
    for (let i = 0; i < 4; i++) {
      resetMock(api);
      await api.docs.getAll();
      expect(mockFiles(api).size).toBe(2);
    }
    expect(fixtures.greeting.content).toBe("hello");
  });
  it("validates real fixture metadata before publishing a seed", async () => {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: { file: { maxSize: 1 } },
          mock: { data: [{ id: 1, file: mockFixtureRef("greeting") }], fixtures },
        },
      },
    });
    await expect(api.docs.getAll()).rejects.toBeInstanceOf(ValidationError);
    expect(mockFiles(api).size).toBe(0);
  });
  it("supports provider/named sources while leaving module records immutable", async () => {
    const records = [{ id: "1", email: mockFixtureRef("greeting") }];
    registerMockDatasetLoader(async () => records);
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        users: { path: "/users", fileFields: ["email"], mock: { data: "users-mock", fixtures } },
      },
    });
    const row = await api.users.getById("1");
    expect(mockFiles(api).get(row.email)?.text()).toBe("hello");
    expect(records[0]!.email).toEqual(mockFixtureRef("greeting"));
  });
  it("isolates identical fixture definitions between clients and resources", async () => {
    const a = make();
    const b = make();
    const row = await a.docs.getById(1);
    expect(mockFiles(b).has(row.file)).toBe(false);
    expect((await b.docs.getById(1)).file).not.toBe(row.file);
    resetMock(a);
    expect(mockFiles(b).size).toBe(2);
  });
});

it("uses Blob metadata without File or copying stored bytes for validation", async () => {
  const saved = globalThis.File;
  try {
    vi.stubGlobal("File", undefined);
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: { file: { accept: [".txt"], maxSize: 5 } },
          mock: { data: [{ id: 1, file: mockFixtureRef("greeting") }], fixtures },
        },
      },
    });
    const row = await api.docs.getById(1);
    expect(mockFiles(api).get(row.file)?.blob()).toBeInstanceOf(Blob);
    expect(mockFiles(api).get(row.file)?.meta.name).toBe("hello.txt");
  } finally {
    vi.stubGlobal("File", saved);
  }
});

it("rejects a missing registry and unreadable/failing lazy fixtures without publishing files", async () => {
  const bad = new Blob(["x"]);
  bad.arrayBuffer = async () => {
    throw Error("unreadable");
  };
  for (const registry of [
    undefined,
    {
      x: () => {
        throw Error("factory");
      },
    },
    { x: mockFileFixture(bad, { name: "x" }) },
  ]) {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: { data: [{ id: 1, file: mockFixtureRef("x") }], fixtures: registry },
        },
      },
    });
    await expect(api.docs.getAll()).rejects.toThrow();
    expect(mockFiles(api).size).toBe(0);
  }
});

it("counts repeated fixture occurrences against per-field limits", async () => {
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: { files: { min: 2, max: 2 } },
        mock: {
          data: [{ id: 1, files: [mockFixtureRef("greeting"), mockFixtureRef("greeting")] }],
          fixtures,
        },
      },
    },
  });
  expect((await api.docs.getById(1)).files).toHaveLength(2);
  expect(mockFiles(api).size).toBe(1);
});

it("aborts fixture initialization without late publication and can retry", async () => {
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>((r) => {
    began = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let first = true;
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: {
          data: [{ id: 1, file: mockFixtureRef("x") }],
          fixtures: {
            x: async () => {
              if (first) {
                first = false;
                began();
                await gate;
              }
              return fixtures.greeting;
            },
          },
        },
      },
    },
  });
  const controller = new AbortController();
  const pending = api.docs.getAll({ signal: controller.signal });
  await started;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "ABORT" });
  expect(mockFiles(api).size).toBe(0);
  release();
  const row = await api.docs.getById(1);
  expect(mockFiles(api).get(row.file)?.text()).toBe("hello");
  expect(mockFiles(api).size).toBe(1);
});

it("accepts local stored references in strict seeds without taking manual ownership", async () => {
  let ref = "";
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: { data: () => [{ id: 1, file: ref }], fixtures: {} },
      },
    },
  });
  ref = (await mockFiles(api).put(new Blob(["manual"]), { resource: "docs", field: "file" })).ref;
  expect((await api.docs.getById(1)).file).toBe(ref);
  await api.docs.delete(1);
  expect(mockFiles(api).has(ref)).toBe(true);
  expect(mockFiles(api).delete(ref)).toBe(true);
  expect(mockFiles(api).get(ref)).toBeUndefined();
});

it("invalidates pending provider generations and preserves field absence", async () => {
  let began!: () => void;
  let release!: () => void;
  let first = true;
  const started = new Promise<void>((r) => {
    began = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const api = defineApi<{ docs: { entity: { id: number; file?: string } } }>()({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: async () => {
          if (first) {
            first = false;
            began();
            await gate;
          }
          return [{ id: 1 }];
        },
      },
    },
  });
  const pending = api.docs.getAll();
  await started;
  resetMock(api);
  release();
  await expect(pending).rejects.toThrow();
  expect(await api.docs.getAll()).toStrictEqual([{ id: 1 }]);
});
