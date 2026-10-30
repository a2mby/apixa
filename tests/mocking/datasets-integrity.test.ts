import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listDatasets, loadDataset } from "@apixa/mocking/node";

const datasetsRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)), "datasets");

const SECRETISH = /(api[_-]?key|password|secret|private[_-]?key)\s*[:=]/i;

describe("datasets integrity", () => {
  it("parses every listed dataset and finds no secret-looking fields", async () => {
    const list = await listDatasets({ basePath: datasetsRoot });
    expect(list.some((d) => d.path?.includes("/"))).toBe(true);

    for (const item of list) {
      const dataset = await loadDataset(item.id, { basePath: datasetsRoot });
      expect(dataset.records.length).toBe(item.records);
      const blob = JSON.stringify(dataset.records);
      expect(blob).not.toMatch(SECRETISH);
    }
  });

  it("keeps FK integrity across synthetic relational sets", async () => {
    const users = await loadDataset("users-mock", { basePath: datasetsRoot });
    const companies = await loadDataset("companies-mock", { basePath: datasetsRoot });
    const products = await loadDataset("products-mock", { basePath: datasetsRoot });
    const orders = await loadDataset("orders-mock", { basePath: datasetsRoot });
    const posts = await loadDataset("posts-mock", { basePath: datasetsRoot });
    const comments = await loadDataset("comments-mock", { basePath: datasetsRoot });

    const userIds = new Set(users.records.map((r) => String(r.id)));
    const companyIds = new Set(companies.records.map((r) => String(r.id)));
    const productIds = new Set(products.records.map((r) => String(r.id)));
    const postIds = new Set(posts.records.map((r) => String(r.id)));

    for (const order of orders.records) {
      expect(userIds.has(String(order.userId))).toBe(true);
      expect(productIds.has(String(order.productId))).toBe(true);
      expect(companyIds.has(String(order.companyId))).toBe(true);
    }

    for (const post of posts.records) {
      expect(userIds.has(String(post.userId))).toBe(true);
    }

    for (const comment of comments.records) {
      expect(postIds.has(String(comment.postId))).toBe(true);
      expect(userIds.has(String(comment.userId))).toBe(true);
    }
  });

  it("loads nested path and short id for the same dataset", async () => {
    const byId = await loadDataset("users-mock", { basePath: datasetsRoot });
    const byPath = await loadDataset("users/users-mock", { basePath: datasetsRoot });
    expect(byId.meta.id).toBe("users-mock");
    expect(byPath.records).toEqual(byId.records);
  });

  it("manifest file exists beside attribution", async () => {
    const attribution = await readFile(resolve(datasetsRoot, "ATTRIBUTION.md"), "utf8");
    expect(attribution).toMatch(/ODbL|CC0/i);
  });
});
