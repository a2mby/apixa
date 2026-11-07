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
import productsMockMeta from "../../../datasets/products/products-mock/meta.json";
import companiesMockMeta from "../../../datasets/companies/companies-mock/meta.json";
import ordersMockMeta from "../../../datasets/orders/orders-mock/meta.json";
import postsMockMeta from "../../../datasets/social/posts-mock/meta.json";
import commentsMockMeta from "../../../datasets/comments/comments-mock/meta.json";
import { comments } from "./dataset-modules/comments.js";
import { companies } from "./dataset-modules/companies.js";
import { orders } from "./dataset-modules/orders.js";
import { posts } from "./dataset-modules/posts.js";
import { products } from "./dataset-modules/products.js";
import type { Dataset, DatasetMeta } from "./types.js";

export type * from "./data/entities.js";

export { loadDataset, loadDatasetRecords } from "./loader.js";
export { listDatasetIds } from "./catalog.js";

/** Direct named exports: each lives in its own module (`@apixa/mocking/datasets/<name>`). */
export { users } from "./dataset-modules/users.js";
export { products } from "./dataset-modules/products.js";
export { companies } from "./dataset-modules/companies.js";
export { orders } from "./dataset-modules/orders.js";
export { posts } from "./dataset-modules/posts.js";
export { comments } from "./dataset-modules/comments.js";

/** `Dataset` wrappers (meta + records) for the synthetic sets. */
export const productsDataset: Dataset = {
  meta: productsMockMeta as DatasetMeta,
  records: products as unknown as Record<string, unknown>[],
};
export const companiesDataset: Dataset = {
  meta: companiesMockMeta as DatasetMeta,
  records: companies as unknown as Record<string, unknown>[],
};
export const ordersDataset: Dataset = {
  meta: ordersMockMeta as DatasetMeta,
  records: orders as unknown as Record<string, unknown>[],
};
export const postsDataset: Dataset = {
  meta: postsMockMeta as DatasetMeta,
  records: posts as unknown as Record<string, unknown>[],
};
export const commentsDataset: Dataset = {
  meta: commentsMockMeta as DatasetMeta,
  records: comments as unknown as Record<string, unknown>[],
};
