/**
 * `@apixa/mocking/datasets/orders` — the `orders-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/orders/orders-mock/data.json";
import type { Order } from "../data/entities.js";

export type { Order };

/** `orders-mock` */
export const orders: readonly Order[] = data;
