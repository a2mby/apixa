/**
 * Typed records for the small synthetic datasets, plus entity types for every dataset
 * `defineMockApi()` can load. Records come straight from the root `datasets/` JSON (no copies).
 *
 * Reference sets (countries, currencies, …) are typed here but not exported as arrays — load them
 * lazily with `defineMockApi({ countries: { type: "countries-csc" } })`.
 * Exports are read-only: `defineMockApi()` copies before it stores anything.
 *
 * Importing this module never changes `defineApi` behavior: `mock: "<dataset-id>"` loads
 * datasets lazily through `@apixa/mocking/datasets`, and inline `mock: users` works too.
 */
import usersMock from "../../../../datasets/users/users-mock/data.json";
import productsMock from "../../../../datasets/products/products-mock/data.json";
import productsMockMeta from "../../../../datasets/products/products-mock/meta.json";
import companiesMock from "../../../../datasets/companies/companies-mock/data.json";
import companiesMockMeta from "../../../../datasets/companies/companies-mock/meta.json";
import ordersMock from "../../../../datasets/orders/orders-mock/data.json";
import ordersMockMeta from "../../../../datasets/orders/orders-mock/meta.json";
import postsMock from "../../../../datasets/social/posts-mock/data.json";
import postsMockMeta from "../../../../datasets/social/posts-mock/meta.json";
import commentsMock from "../../../../datasets/comments/comments-mock/data.json";
import commentsMockMeta from "../../../../datasets/comments/comments-mock/meta.json";
import type { Comment, Company, Order, Post, Product, User } from "./entities.js";
import type { Dataset, DatasetMeta } from "../types.js";

export type * from "./entities.js";

/** `users-mock` */
export const users: readonly User[] = usersMock;
/** `products-mock` */
export const products: readonly Product[] = productsMock;
/** `companies-mock` */
export const companies: readonly Company[] = companiesMock;
/** `orders-mock` */
export const orders: readonly Order[] = ordersMock;
/** `posts-mock` */
export const posts: readonly Post[] = postsMock;
/** `comments-mock` */
export const comments: readonly Comment[] = commentsMock;

/** `Dataset` wrappers (meta + records) for the synthetic sets. */
export const productsDataset: Dataset = {
  meta: productsMockMeta as DatasetMeta,
  records: productsMock as unknown as Record<string, unknown>[],
};
export const companiesDataset: Dataset = {
  meta: companiesMockMeta as DatasetMeta,
  records: companiesMock as unknown as Record<string, unknown>[],
};
export const ordersDataset: Dataset = {
  meta: ordersMockMeta as DatasetMeta,
  records: ordersMock as unknown as Record<string, unknown>[],
};
export const postsDataset: Dataset = {
  meta: postsMockMeta as DatasetMeta,
  records: postsMock as unknown as Record<string, unknown>[],
};
export const commentsDataset: Dataset = {
  meta: commentsMockMeta as DatasetMeta,
  records: commentsMock as unknown as Record<string, unknown>[],
};
