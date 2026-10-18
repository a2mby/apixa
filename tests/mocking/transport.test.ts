import { defineApi } from "@apixa/core";
import { createMockTransport } from "@apixa/mocking";
import { loadDataset } from "@apixa/mocking/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const datasetsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "datasets");

describe("createMockTransport", () => {
  it("serves getAll and getByID from dataset data", async () => {
    const dataset = await loadDataset("users-sample", { basePath: datasetsRoot });
    const api = defineApi({
      baseURL: "https://mock.local",
      transport: createMockTransport({ dataset }),
      users: { path: "/users" },
    });

    const all = await api.users.getAll();
    expect(all).toEqual(dataset.records);

    const one = await api.users.getByID("1");
    expect(one).toMatchObject({ id: "1", name: "Ada Lovelace" });
  });

  it("supports in-memory create / update / delete", async () => {
    const dataset = await loadDataset("users-sample", { basePath: datasetsRoot });
    const api = defineApi({
      baseURL: "https://mock.local",
      transport: createMockTransport({ dataset }),
      users: { path: "/users" },
    });

    const created = await api.users.create({ name: "Alan", email: "alan@example.com" });
    expect(created).toMatchObject({ name: "Alan", email: "alan@example.com" });
    expect(created).toHaveProperty("id");

    const updated = await api.users.update(String((created as { id: string }).id), {
      name: "Alan Turing",
    });
    expect(updated).toMatchObject({ name: "Alan Turing" });

    await api.users.delete(String((created as { id: string }).id));
    await expect(api.users.getByID(String((created as { id: string }).id))).rejects.toThrow();
  });

  it("returns 404 for unknown resource paths", async () => {
    const dataset = await loadDataset("users-sample", { basePath: datasetsRoot });
    const transport = createMockTransport({ dataset });
    const result = await transport.request({
      url: "https://mock.local/posts",
      method: "GET",
      headers: new Headers(),
    });
    expect(result.status).toBe(404);
  });
});
