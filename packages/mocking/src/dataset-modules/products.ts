/**
 * `@apixa/mocking/datasets/products` — the `products-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/products/products-mock/data.json";
import type { Product } from "../data/entities.js";

export type { Product };

/** `products-mock` */
export const products: readonly Product[] = data;
