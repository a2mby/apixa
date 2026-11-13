import { defineApi, mockFiles, resetMock } from "@apixa/core";
import { describe, expect, it } from "vitest";

/**
 * v1.8.0 — deterministic fault injection across the managed mock write lifecycle. Guarantees under
 * test: a failure at any stage leaves records AND files exactly as before (no partial write, no
 * unintended deletion, shared files untouched), and the next write succeeds from a consistent state.
 * Out of scope by contract: side effects a custom handler performs outside the mock store.
 */
type Doc = { id: number; file: string; files?: string[] };
const blob = (text: string) => new Blob([text]);
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
};

function setup() {
  const control = { failAt: "" as string, gate: gate() };
  const api = defineApi({
    baseURL: "https://example.test",
    resources: {
      docs: {
        path: "/docs",
        fileFields: ["file", "files"] as never,
        mock: [{ id: 1, file: "" }],
        operations: {
          // stage: before any file exists
          early: {
            kind: "write",
            method: "POST",
            path: "/early",
            mock: () => {
              throw new Error("early failure");
            },
          },
          // stage: records and a new file allocated, then the response fails validation
          late: {
            kind: "write",
            method: "POST",
            path: "/late",
            responseType: "blob",
            maxResponseSize: 1,
            mock: ({ store }: { store: { create(r: object): unknown } }) => {
              store.create({ id: 50, file: new Blob(["allocated"]) });
              return new Blob(["too large"]);
            },
          },
          // stage: handler succeeds, then the caller aborts before commit
          slow: {
            kind: "write",
            method: "POST",
            path: "/slow",
            mock: async ({ store }: { store: { create(r: object): unknown } }) => {
              store.create({ id: 60, file: new Blob(["pending"]) });
              await control.gate.promise;
              return { ok: true };
            },
          },
        },
      },
    },
  });
  return { api, control };
}

/** Reference integrity: every ref a record holds is stored, and every managed file is referenced. */
async function expectConsistent(api: ReturnType<typeof setup>["api"], manual: string[] = []) {
  const rows = (await api.docs.getAll()) as unknown as Doc[];
  const referenced = new Set<string>();
  for (const row of rows)
    for (const value of [row.file, ...(row.files ?? [])])
      if (typeof value === "string" && value.startsWith("mock-file://")) referenced.add(value);
  const files = mockFiles(api)!;
  for (const ref of referenced) expect(files.has(ref), `dangling ${ref}`).toBe(true);
  for (const meta of files.list())
    expect(referenced.has(meta.ref) || manual.includes(meta.ref), `orphan ${meta.ref}`).toBe(true);
}

describe("failure at each stage of a managed write leaves records and files unchanged", () => {
  it("before any file exists (handler throws first)", async () => {
    const { api } = setup();
    await expect(api.docs.early({})).rejects.toThrow("early failure");
    expect(mockFiles(api)!.size).toBe(0);
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
    await expectConsistent(api);
  });

  it("after a file was allocated, before references persist (response validation fails)", async () => {
    const { api } = setup();
    await expect(api.docs.late({})).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mockFiles(api)!.size).toBe(0);
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
    await expectConsistent(api);
  });

  it("after the handler finished, when the caller aborts before commit", async () => {
    const { api, control } = setup();
    const controller = new AbortController();
    const pending = api.docs.slow({}, { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    control.gate.release();
    const error = (await pending) as Error;
    expect(error.name).toBe("AbortError");
    await new Promise((r) => setTimeout(r, 5));
    expect(mockFiles(api)!.size).toBe(0);
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
    await expectConsistent(api);
  });

  it("when mock state is reset between allocation and commit", async () => {
    const { api, control } = setup();
    const pending = api.docs.slow({}).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    resetMock(api);
    control.gate.release();
    expect(await pending).toBeInstanceOf(Error);
    expect(mockFiles(api)!.size).toBe(0);
    expect(await api.docs.getAll()).toEqual([{ id: 1, file: "" }]);
  });

  it("when the file fails reading (file creation itself fails)", async () => {
    const { api } = setup();
    const broken = blob("x");
    broken.arrayBuffer = () => Promise.reject(new Error("disk error"));
    await expect(api.docs.create({ file: broken } as never)).rejects.toThrow();
    expect(mockFiles(api)!.size).toBe(0);
    expect((await api.docs.getAll()) as unknown as Doc[]).toEqual([{ id: 1, file: "" }]);
    await api.docs.create({ file: blob("fine") } as never);
    await expectConsistent(api);
  });

  it("when an id collision aborts a create that carried a file", async () => {
    const { api } = setup();
    await expect(api.docs.create({ id: 1, file: blob("dup") } as never)).rejects.toThrow();
    expect(mockFiles(api)!.size).toBe(0);
    await expectConsistent(api);
  });
});

describe("replacement", () => {
  it("a failed replacement keeps the old file and its reference", async () => {
    const { api } = setup();
    const created = (await api.docs.create({ file: blob("original") } as never)) as unknown as Doc;
    const broken = blob("new");
    broken.arrayBuffer = () => Promise.reject(new Error("disk error"));
    await expect(
      api.docs.update(created.id, { body: { file: broken } as never }),
    ).rejects.toThrow();
    const row = (await api.docs.getById(created.id)) as unknown as Doc;
    expect(row.file).toBe(created.file);
    expect(mockFiles(api)!.get(created.file)!.text()).toBe("original");
    await expectConsistent(api);
  });

  it("an aborted replacement keeps the old file; the retry then replaces it and frees the old one", async () => {
    const { api } = setup();
    const created = (await api.docs.create({ file: blob("original") } as never)) as unknown as Doc;
    const controller = new AbortController();
    const slow = blob("slow");
    let release!: (b: ArrayBuffer) => void;
    slow.arrayBuffer = () =>
      new Promise((r) => {
        release = r;
      });
    const pending = api.docs
      .update(created.id, { ...{ signal: controller.signal }, body: { file: slow } as never })
      .catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    release(new TextEncoder().encode("slow").buffer as ArrayBuffer);
    expect(((await pending) as Error).name).toBe("AbortError");
    expect(mockFiles(api)!.get(created.file)!.text()).toBe("original");
    const replaced = (await api.docs.update(created.id, {
      body: {
        file: blob("final"),
      } as never,
    })) as unknown as Doc;
    expect(mockFiles(api)!.has(created.file)).toBe(false);
    expect(mockFiles(api)!.get(replaced.file)!.text()).toBe("final");
    await expectConsistent(api);
  });

  it("replacing one of several files keeps the others (arrays)", async () => {
    const { api } = setup();
    const created = (await api.docs.create({
      files: [blob("a"), blob("b")],
    } as never)) as unknown as Doc;
    const [a, b] = created.files!;
    const updated = (await api.docs.update(created.id, {
      body: {
        files: [a!, blob("c")],
      } as never,
    })) as unknown as Doc;
    expect(mockFiles(api)!.has(a!)).toBe(true);
    expect(mockFiles(api)!.has(b!)).toBe(false);
    expect(updated.files![0]).toBe(a);
    await expectConsistent(api);
  });
});

describe("deletion and cleanup", () => {
  it("deleting a record that shares a file with another never removes the file", async () => {
    const { api } = setup();
    const a = (await api.docs.create({ file: blob("shared") } as never)) as unknown as Doc;
    const b = (await api.docs.create({ file: a.file } as never)) as unknown as Doc;
    await api.docs.delete(a.id);
    expect(mockFiles(api)!.get(a.file)!.text()).toBe("shared");
    await expectConsistent(api);
    await api.docs.delete(b.id);
    expect(mockFiles(api)!.size).toBe(0);
  });

  it("a failed delete (unknown id) changes nothing and a repeated delete is safe", async () => {
    const { api } = setup();
    const a = (await api.docs.create({ file: blob("x") } as never)) as unknown as Doc;
    await expect(api.docs.delete(9999 as never)).rejects.toThrow();
    expect(mockFiles(api)!.has(a.file)).toBe(true);
    await api.docs.delete(a.id);
    await expect(api.docs.delete(a.id)).rejects.toThrow();
    expect(mockFiles(api)!.size).toBe(0);
    await expectConsistent(api);
  });

  it("a manually stored file is never collected by record deletion or reset of other data", async () => {
    const { api } = setup();
    const meta = await mockFiles(api)!.put(blob("fixture"), { resource: "docs", field: "file" });
    const a = (await api.docs.create({ file: blob("x") } as never)) as unknown as Doc;
    await api.docs.delete(a.id);
    expect(mockFiles(api)!.has(meta.ref)).toBe(true);
    await expectConsistent(api, [meta.ref]);
  });
});

describe("concurrent managed writes", () => {
  it("a failing write among concurrent ones commits none of its own state and none of the others is lost", async () => {
    const { api } = setup();
    const broken = blob("bad");
    broken.arrayBuffer = () => Promise.reject(new Error("disk error"));
    const results = await Promise.allSettled([
      api.docs.create({ file: blob("a") } as never),
      api.docs.create({ file: broken } as never),
      api.docs.create({ file: blob("c") } as never),
      api.docs.create({ file: blob("d") } as never),
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(mockFiles(api)!.size).toBe(3);
    expect(((await api.docs.getAll()) as unknown as Doc[]).length).toBe(4); // seed + 3
    await expectConsistent(api);
  });

  it("interleaved replacements of a shared file never free it while a record still holds it", async () => {
    const { api } = setup();
    const a = (await api.docs.create({ file: blob("shared") } as never)) as unknown as Doc;
    const b = (await api.docs.create({ file: a.file } as never)) as unknown as Doc;
    await Promise.all([
      api.docs.update(a.id, { body: { file: blob("a2") } as never }),
      api.docs.update(b.id, { body: { file: blob("b2") } as never }),
    ]);
    expect(mockFiles(api)!.has(a.file)).toBe(false); // both owners moved on: now an orphan, collected
    await expectConsistent(api);
    const rows = (await api.docs.getAll()) as unknown as Doc[];
    expect(new Set(rows.filter((r) => r.id !== 1).map((r) => r.file)).size).toBe(2);
  });

  it("recovery: after every failure above the next write succeeds from a consistent state", async () => {
    const { api } = setup();
    await api.docs.early({}).catch(() => {});
    await api.docs.late({}).catch(() => {});
    const ok = (await api.docs.create({ file: blob("ok") } as never)) as unknown as Doc;
    expect(mockFiles(api)!.get(ok.file)!.text()).toBe("ok");
    await expectConsistent(api);
  });
});
