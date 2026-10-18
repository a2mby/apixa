import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listDatasets, loadDataset } from "@apixa/mocking/node";

const datasetsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "datasets");

describe("dataset registry", () => {
  it("lists local datasets without network", async () => {
    const list = await listDatasets({ basePath: datasetsRoot });
    expect(list.some((d) => d.id === "users-sample")).toBe(true);
    const users = list.find((d) => d.id === "users-sample")!;
    expect(users.title).toBeTruthy();
    expect(users.license).toBeTruthy();
    expect(users.version).toBeTruthy();
    expect(users.resourcePath).toBe("/users");
  });

  it("loads a dataset by id with meta and records", async () => {
    const dataset = await loadDataset("users-sample", { basePath: datasetsRoot });
    expect(dataset.meta.id).toBe("users-sample");
    expect(dataset.meta.title).toBeTruthy();
    expect(dataset.meta.license).toBe("MIT");
    expect(dataset.meta.version).toBeTruthy();
    expect(dataset.meta.schema.fields.length).toBeGreaterThan(0);
    expect(dataset.meta.records).toBe(dataset.records.length);
    expect(dataset.records.length).toBeGreaterThan(0);
    expect(dataset.records[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  it("fails clearly for unknown ids", async () => {
    await expect(loadDataset("missing-dataset", { basePath: datasetsRoot })).rejects.toThrow(
      /Failed to load dataset/,
    );
  });
});
