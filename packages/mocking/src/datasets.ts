/**
 * Canonical dataset entry point.
 *
 * - `loadDataset(id)` — **lazy**: imports only the selected dataset when called.
 * - `users`, `products`, … — **eager**: direct named exports of the small synthetic sets. Using
 *   one loads that JSON when the module is evaluated; bundlers drop the ones you do not import.
 *   Direct imports do not save memory — they only decide *when* the records load.
 *
 * Reference sets (countries, currencies, …) are typed here but only available lazily, through
 * `loadDataset("countries-csc")` or `defineMockApi`. Exports are read-only; `defineMockApi()`
 * copies before it stores anything, and `mock: "<dataset-id>"` needs no manual loading.
 */
import usersMock from "../../../datasets/users/users-mock/data.json";
import productsMock from "../../../datasets/products/products-mock/data.json";
import productsMockMeta from "../../../datasets/products/products-mock/meta.json";
import companiesMock from "../../../datasets/companies/companies-mock/data.json";
import companiesMockMeta from "../../../datasets/companies/companies-mock/meta.json";
import ordersMock from "../../../datasets/orders/orders-mock/data.json";
import ordersMockMeta from "../../../datasets/orders/orders-mock/meta.json";
import postsMock from "../../../datasets/social/posts-mock/data.json";
import postsMockMeta from "../../../datasets/social/posts-mock/meta.json";
import commentsMock from "../../../datasets/comments/comments-mock/data.json";
import commentsMockMeta from "../../../datasets/comments/comments-mock/meta.json";
import type { Comment, Company, Order, Post, Product, User } from "./data/entities.js";
import type { Dataset, DatasetMeta } from "./types.js";

export type * from "./data/entities.js";

export { loadDataset, loadDatasetRecords } from "./loader.js";
export { listDatasetIds } from "./catalog.js";

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
