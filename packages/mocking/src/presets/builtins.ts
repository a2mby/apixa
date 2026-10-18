import { dataset as usersMock } from "../data/users-mock.js";
import { dataset as usersSample } from "../data/users.js";
import {
  commentsDataset,
  companiesDataset,
  ordersDataset,
  postsDataset,
  productsDataset,
} from "../data/index.js";
import { registerDatasetPreset } from "./registry.js";

/** Idempotent — safe after `clearDatasetPresets()` in tests. */
export function ensureBuiltinPresets(): void {
  registerDatasetPreset("users-sample", usersSample);
  registerDatasetPreset("users-mock", usersMock);
  registerDatasetPreset("products-mock", productsDataset);
  registerDatasetPreset("companies-mock", companiesDataset);
  registerDatasetPreset("orders-mock", ordersDataset);
  registerDatasetPreset("posts-mock", postsDataset);
  registerDatasetPreset("comments-mock", commentsDataset);
}
