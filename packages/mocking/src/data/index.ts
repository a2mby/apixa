/**
 * Compatibility entry (`@apixa/mocking/data`): the same eager records as the canonical
 * `@apixa/mocking/datasets`, without its loaders. Prefer `@apixa/mocking/datasets` in new code.
 */
export {
  users,
  products,
  companies,
  orders,
  posts,
  comments,
  productsDataset,
  companiesDataset,
  ordersDataset,
  postsDataset,
  commentsDataset,
} from "../datasets.js";
export type * from "./entities.js";
