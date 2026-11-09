import { defineApi, mockFiles, resetMock, MockStore, normalizeMockSource } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";

const setup = () =>
  defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: { path: "/docs", fileFields: ["file"], mock: [{ id: 1, file: "" }] },
    },
  });

describe("managed storage commit boundaries", () => {
  it("a shared ref survives removing one of its owners", async () => {
    const api = setup();
    const first = await api.docs.create({ file: new Blob(["bytes"]) } as never);
    const ref = first.file;
    const second = await api.docs.create({ file: ref } as never);
    await api.docs.delete(first.id);
    expect(mockFiles(api).get(ref)?.text()).toBe("bytes");
    await api.docs.delete(second.id);
    expect(mockFiles(api).has(ref)).toBe(false);
  });

  it("a late bulk generated-ID collision never commits an earlier row", async () => {
    const store = new MockStore(normalizeMockSource("docs", [{ id: 1 }]));
    await store.ready();
    await expect(Promise.resolve().then(() => store.createMany([{}, { id: 2 }]))).rejects.toThrow();
    expect(store.list()).toEqual([{ id: 1 }]);
    expect(store.create({}).id).toBe(2);
  });

  it("reset invalidates an upload paused while reading bytes", async () => {
    const api = setup();
    let release!: (buffer: ArrayBuffer) => void;
    let began!: () => void;
    const started = new Promise<void>((r) => {
      began = r;
    });
    const blob = new Blob(["bytes"]);
    blob.arrayBuffer = () => {
      began();
      return new Promise((r) => {
        release = r;
      });
    };
    const pending = api.docs.create({ file: blob } as never);
    await started;
    expect(mockFiles(api).size).toBe(0);
    resetMock(api);
    release(new Uint8Array([1]).buffer);
    await expect(pending).rejects.toThrow();
    expect(mockFiles(api).size).toBe(0);
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
  });
});

describe("handler transactions and concurrency", () => {
  it("discards a managed record/file write on handler throw or response validation failure", async () => {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: [{ id: 1, file: "" }],
          operations: {
            fail: {
              kind: "write",
              method: "POST",
              path: "/fail",
              mock: ({ store }) => {
                store.create({ id: 2, file: "value" });
                throw Error("failed");
              },
            },
            limited: {
              kind: "write",
              method: "POST",
              path: "/limited",
              responseType: "blob",
              maxResponseSize: 1,
              mock: ({ store }) => {
                store.create({ id: 2, file: "value" });
                return new Blob(["large"]);
              },
            },
          },
        },
      },
    });
    await expect(api.docs.fail({})).rejects.toThrow("failed");
    await expect(api.docs.limited({})).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
    expect(mockFiles(api).size).toBe(0);
  });
  it("revokes late handler writes after abort without claiming external-side-effect rollback", async () => {
    let started!: () => void;
    let release!: () => void;
    let late!: Promise<unknown>;
    const began = new Promise<void>((r) => {
      started = r;
    });
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const external: string[] = [];
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          mock: [{ id: 1 }],
          operations: {
            slow: {
              kind: "write",
              method: "POST",
              path: "/slow",
              mock: async ({ store }) => {
                store.create({ id: 2 });
                started();
                late = gate.then(() => {
                  external.push("external");
                  try {
                    store.create({ id: 3 });
                  } catch (e) {
                    return e;
                  }
                });
                await gate;
                return null;
              },
            },
          },
        },
      },
    });
    const controller = new AbortController();
    const pending = api.docs.slow({}, { signal: controller.signal });
    await began;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORT" });
    release();
    expect(await late).toMatchObject({ code: "MOCK_INVALID_INPUT" });
    expect(external).toEqual(["external"]);
    expect(await api.docs.getAll()).toEqual([{ id: 1 }]);
  });
  it("serializes concurrent writes and preserves shared refs across resources and reset", async () => {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        a: { path: "/a", fileFields: ["file"], mock: [{ id: 1, file: "" }] },
        b: { path: "/b", fileFields: ["file"], mock: [{ id: 1, file: "" }] },
      },
    });
    const row = await api.a.create({ file: new Blob(["shared"]) });
    await api.b.patch(1, { file: row.file } as never);
    resetMock(api.a);
    expect(mockFiles(api).get(row.file)?.text()).toBe("shared");
    await Promise.all([
      api.b.create({ file: new Blob(["x"]) }),
      api.b.create({ file: new Blob(["y"]) }),
    ]);
    expect(await api.b.count()).toBe(3);
    expect(mockFiles(api).size).toBe(3);
    resetMock(api.b);
    expect(mockFiles(api).size).toBe(0);
  });
  it("private staging stays invisible during the second file read; failures release paths/IDs", async () => {
    let started!: () => void;
    let reject!: (reason: Error) => void;
    const began = new Promise<void>((r) => {
      started = r;
    });
    const bad = new Blob(["bad"]);
    bad.arrayBuffer = () => {
      started();
      return new Promise((_r, j) => {
        reject = j;
      });
    };
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: { path: "/docs", fileFields: ["files"], mock: [{ id: 1, files: [] as string[] }] },
      },
    });
    const pending = api.docs.create({ files: [new Blob(["first"]), bad] });
    await began;
    expect(mockFiles(api).size).toBe(0);
    reject(Error("read failure"));
    await expect(pending).rejects.toMatchObject({ code: "MOCK_INVALID_INPUT" });
    expect(mockFiles(api).size).toBe(0);
    expect(await api.docs.count()).toBe(1);
  });
  it("response middleware failure happens after commit", async () => {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: [{ id: 1, file: "" }],
          responseMiddleware: [
            () => {
              throw Error("after commit");
            },
          ],
        },
      },
    });
    await expect(api.docs.create({ file: new Blob(["stored"]) })).rejects.toThrow("after commit");
    expect(mockFiles(api).size).toBe(1);
  });
});

it("rolls back files on late bulk/clone failures and conflicting cross-resource paths", async () => {
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      a: {
        path: "/a",
        fileFields: ["file"],
        mock: { data: [{ id: "a", file: "" }], storage: { directory: "same" } },
      },
      b: {
        path: "/b",
        fileFields: ["file"],
        mock: { data: [{ id: "b", file: "" }], storage: { directory: "same" } },
      },
    },
  });
  await expect(
    api.a.createMany([
      { id: "new", file: new File(["x"], "one") },
      { file: new File(["x"], "two") },
    ] as never),
  ).rejects.toThrow();
  await expect(
    api.a.create({ id: "new", file: new File(["x"], "one"), bad: () => 1 } as never),
  ).rejects.toThrow();
  expect(mockFiles(api).size).toBe(0);
  expect(await api.a.count()).toBe(1);
  await api.a.create({ id: "retry", file: new File(["retry"], "one") });
  await api.a.delete("retry");
  expect(mockFiles(api).size).toBe(0);
  const results = await Promise.allSettled([
    api.a.create({ id: "new", file: new File(["a"], "same") }),
    api.b.create({ id: "new", file: new File(["b"], "same") }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(mockFiles(api).size).toBe(1);
  expect((await api.a.count()) + (await api.b.count())).toBe(3);
});

it("rolls back handler file writes on timeout and revokes saved handles after success", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  let began!: () => void;
  let saved!: () => unknown;
  const started = new Promise<void>((r) => {
    began = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  try {
    const api = defineApi({
      baseURL: "https://example.test",
      resources: {
        docs: {
          path: "/docs",
          fileFields: ["file"],
          mock: [{ id: 1, file: "" }],
          operations: {
            timeout: {
              kind: "write",
              method: "POST",
              path: "/timeout",
              mock: async ({ store }) => {
                store.create({ id: 2, file: new File(["x"], "x.txt") } as never);
                began();
                await gate;
                return null;
              },
            },
            success: {
              kind: "write",
              method: "POST",
              path: "/success",
              mock: ({ store }) => {
                saved = () => store.create({ id: 3, file: "" });
                return null;
              },
            },
          },
        },
      },
    });
    const outcome = api.docs.timeout({}, { timeout: 10 }).catch((e) => e);
    await started;
    await vi.advanceTimersByTimeAsync(11);
    expect(await outcome).toMatchObject({ code: "TIMEOUT" });
    release();
    expect(mockFiles(api).size).toBe(0);
    expect(await api.docs.count()).toBe(1);
    await api.docs.success({});
    expect(saved).toThrow();
    expect(await api.docs.count()).toBe(1);
  } finally {
    release?.();
    vi.useRealTimers();
  }
});

it("keeps typed binary handler results intact when managed files change", async () => {
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file"],
        mock: [{ id: 1, file: "" }],
        operations: {
          uploadAndReturn: {
            kind: "write",
            method: "POST",
            path: "/binary",
            responseType: "arrayBuffer",
            mock: ({ store }) => {
              store.patch(1, { file: new File(["x"], "x.txt") } as never);
              return new Uint8Array([0, 255, 1]);
            },
          },
        },
      },
    },
  });
  expect(new Uint8Array(await api.docs.uploadAndReturn({}))).toEqual(new Uint8Array([0, 255, 1]));
  expect(mockFiles(api).size).toBe(1);
});

it("rejects cancellation while queued without waiting for another handler", async () => {
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>((r) => {
    began = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        mock: [{ id: 1 }],
        operations: {
          slow: {
            kind: "write",
            method: "POST",
            path: "/slow",
            mock: async () => {
              began();
              await gate;
              return null;
            },
          },
        },
      },
    },
  });
  const first = api.docs.slow({});
  await started;
  const controller = new AbortController();
  const queued = api.docs.create({ id: 2 }, { signal: controller.signal });
  controller.abort();
  await expect(queued).rejects.toMatchObject({ code: "ABORT" });
  release();
  await first;
  expect(await api.docs.count()).toBe(1);
});
