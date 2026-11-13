import { ConfigError, MockError, defineApi, mockFiles, resetMock } from "@apixa/core";
import { describe, expect, it, vi } from "vitest";

type User = { id: string; name: string; avatar?: string | null; documents?: string[] };
type AppApi = { users: { path: "/users"; entity: User }; teams: { path: "/teams"; entity: User } };

const file = (name: string, content = "x", type = "text/plain") =>
  new File([content], name, { type });

type Ops = Record<string, (...args: unknown[]) => Promise<unknown>>;

function setup(extra: Record<string, unknown> = {}) {
  const api = defineApi<AppApi>()({
    baseURL: "https://api.example.com",
    ...extra,
    resources: {
      users: {
        path: "/users",
        mock: [{ id: "1", name: "Ada" }],
        fileFields: ["avatar", "documents"],
      },
      teams: { path: "/teams", mock: [{ id: "t1", name: "Core" }], fileFields: ["avatar"] },
    },
  } as never) as never as { users: Ops; teams: Ops };
  return { api, files: mockFiles(api as never) };
}

describe("mock file storage with dataset writes", () => {
  it("stores bytes apart from records and returns string references", async () => {
    const { api, files } = setup();
    const created = (await api.users.create!({
      id: "2",
      name: "Bob",
      avatar: file("me.png", "PNG-BYTES", "image/png"),
    })) as User;
    expect(created.avatar).toMatch(/^mock-file:\/\/[0-9a-f-]{36}\/me\.png$/);
    expect(files.size).toBe(1);
    const stored = files.get(created.avatar!)!;
    expect(stored.text()).toBe("PNG-BYTES");
    expect(stored.meta).toMatchObject({
      name: "me.png",
      type: "image/png",
      size: 9,
      resource: "users",
      field: "avatar",
    });
    expect(((await api.users.getById!("2")) as User).avatar).toBe(created.avatar);
    const all = (await api.users.getAll!()) as User[];
    expect(all.every((u) => u.avatar === undefined || typeof u.avatar === "string")).toBe(true);
  });

  it("stores multiple files with unique ids and keeps order", async () => {
    const { api, files } = setup();
    const created = (await api.users.create!({
      id: "2",
      name: "Bob",
      documents: [file("a.txt", "A"), file("b.txt", "B")],
    })) as User;
    expect(created.documents).toHaveLength(2);
    expect(new Set(created.documents).size).toBe(2);
    expect(created.documents!.map((ref) => files.get(ref)!.text())).toEqual(["A", "B"]);
  });

  it("replaces files on update and patch, removing the old ones", async () => {
    const { api, files } = setup();
    const first = (await api.users.create!({
      id: "2",
      name: "Bob",
      avatar: file("1.txt", "1"),
    })) as User;
    const second = (await api.users.patch!("2", { body: { avatar: file("2.txt", "2") } })) as User;
    expect(files.has(first.avatar!)).toBe(false);
    expect(files.get(second.avatar!)!.text()).toBe("2");
    expect(files.size).toBe(1);
    // patch without a file keeps the stored one
    const kept = (await api.users.patch!("2", { body: { name: "Bobby" } })) as User;
    expect(kept.avatar).toBe(second.avatar);
    expect(files.size).toBe(1);
    // update without the field drops the file
    const dropped = (await api.users.update!("2", { body: { name: "Robert" } })) as User;
    expect(dropped.avatar).toBeUndefined();
    expect(files.size).toBe(0);
  });

  it("createMany stores files per record", async () => {
    const { api, files } = setup();
    const rows = (await api.users.createMany!([
      { id: "a", name: "A", avatar: file("a") },
      { id: "b", name: "B", avatar: file("b") },
    ])) as User[];
    expect(files.size).toBe(2);
    expect(rows.map((r) => files.get(r.avatar!)!.meta.name)).toEqual(["a", "b"]);
  });

  it("delete and deleteMany remove the files of removed records", async () => {
    const { api, files } = setup();
    await api.users.createMany!([
      { id: "a", name: "A", avatar: file("a") },
      { id: "b", name: "B", documents: [file("b1"), file("b2")] },
      { id: "c", name: "C", avatar: file("c") },
    ]);
    expect(files.size).toBe(4);
    await api.users.delete!("a");
    expect(files.size).toBe(3);
    await api.users.deleteMany!(["b", "c", "missing"]);
    expect(files.size).toBe(0);
  });

  it("failed writes leave records and storage unchanged", async () => {
    const { api, files } = setup();
    await api.users.create!({ id: "2", name: "Bob", avatar: file("keep") });
    const before = JSON.stringify(await api.users.getAll!());
    const size = files.size;
    await expect(
      api.users.create!({ id: "2", name: "Dup", avatar: file("x") }),
    ).rejects.toMatchObject({
      code: "MOCK_DUPLICATE_ID",
    });
    await expect(api.users.update!("nope", { body: { avatar: file("x") } })).rejects.toMatchObject({
      code: "MOCK_NOT_FOUND",
    });
    await expect(
      api.users.createMany!([
        { id: "n1", name: "N", avatar: file("n1") },
        { id: "2", name: "Dup", avatar: file("n2") },
      ]),
    ).rejects.toMatchObject({ code: "MOCK_DUPLICATE_ID" });
    expect(files.size).toBe(size);
    expect(JSON.stringify(await api.users.getAll!())).toBe(before);
  });

  it("rejects binary values in undeclared or nested fields with a MockError", async () => {
    const { api, files } = setup();
    for (const body of [
      { id: "2", name: "Bob", resume: file("r") },
      { id: "3", name: "Bob", extra: { deep: [file("r")] } },
      { id: "4", name: "Bob", avatar: [[file("r")]] },
    ]) {
      await expect(api.users.create!(body)).rejects.toSatisfy(
        (e: unknown) => e instanceof MockError && (e as MockError).code === "MOCK_INVALID_INPUT",
      );
    }
    expect(files.size).toBe(0);
    expect(((await api.users.getAll!()) as User[]).length).toBe(1);
  });

  it("an abort during staging removes what was staged", async () => {
    const { api, files } = setup();
    const controller = new AbortController();
    const pending = api.users.create!(
      { id: "2", name: "Bob", documents: [file("a"), file("b")] },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toBeTruthy();
    expect(files.size).toBe(0);
  });

  it("handles key transforms: wire field names and snake_case records", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transforms: { request: { keys: "snake_case" }, response: { keys: "camelCase" } },
      resources: {
        users: {
          path: "/users",
          mock: [{ id: "1", full_name: "A" }],
          fileFields: ["profilePhoto"],
        },
      },
    } as never) as never as { users: Ops };
    const files = mockFiles(api as never);
    const row = (await api.users.create!({ id: "2", fullName: "B", profilePhoto: file("p") })) as {
      profilePhoto: string;
    };
    expect(files.has(row.profilePhoto)).toBe(true);
    await api.users.delete!("2");
    expect(files.size).toBe(0);
  });

  it("JSON-only mocked writes behave as before", async () => {
    const { api, files } = setup();
    const row = await api.users.create!({ id: "5", name: "Plain" });
    expect(row).toEqual({ id: "5", name: "Plain" });
    expect(files.size).toBe(0);
  });
});

describe("mockFiles API", () => {
  it("lists with filters, deletes and clears", async () => {
    const { api, files } = setup();
    await api.users.create!({ id: "2", name: "B", avatar: file("u"), documents: [file("d")] });
    await api.teams.create!({ id: "t2", name: "T", avatar: file("t") });
    expect(files.list()).toHaveLength(3);
    expect(files.list({ resource: "teams" })).toHaveLength(1);
    expect(files.list({ resource: "users", field: "documents" })[0]!.name).toBe("d");
    const [meta] = files.list({ resource: "teams" });
    expect(files.delete(meta!.ref)).toBe(true);
    expect(files.delete(meta!.ref)).toBe(false);
    expect(files.get(meta!.id)).toBeUndefined();
    files.clear();
    expect(files.size).toBe(0);
  });

  it("returns fresh copies and holds no reference to the caller's data", async () => {
    const { api, files } = setup();
    const source = file("a.txt", "ORIGINAL");
    const row = (await api.users.create!({ id: "2", name: "B", avatar: source })) as User;
    const stored = files.get(row.avatar!)!;
    stored.bytes().fill(0);
    expect(stored.text()).toBe("ORIGINAL");
    const first = stored.blob();
    expect(first).not.toBe(stored.blob());
    expect(await first.text()).toBe("ORIGINAL");
    expect(first).toBeInstanceOf(File);
  });

  it("never creates object URLs", async () => {
    const spy = vi.spyOn(URL, "createObjectURL");
    const { api, files } = setup();
    const row = (await api.users.create!({ id: "2", name: "B", avatar: file("a") })) as User;
    files.get(row.avatar!)!.blob();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("resetMock restores records and clears files (per resource or per client)", async () => {
    const { api, files } = setup();
    await api.users.create!({ id: "2", name: "B", avatar: file("u") });
    await api.teams.create!({ id: "t2", name: "T", avatar: file("t") });
    resetMock(api.users as never);
    expect(files.list().map((m) => m.resource)).toEqual(["teams"]);
    expect(((await api.users.getAll!()) as User[]).map((u) => u.id)).toEqual(["1"]);
    resetMock(api as never);
    expect(files.size).toBe(0);
  });

  it("is empty for live clients and rejects non-clients", () => {
    const live = defineApi({
      baseURL: "https://api.example.com",
      resources: { users: { path: "/users" } },
    });
    expect(mockFiles(live as never).size).toBe(0);
    expect(() => mockFiles({} as never)).toThrow(ConfigError);
  });
});
