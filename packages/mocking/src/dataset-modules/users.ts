/**
 * `@apixa/mocking/datasets/users` — the `users-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/users/users-mock/data.json";
import type { User } from "../data/entities.js";

export type { User };

/** `users-mock` */
export const users: readonly User[] = data;
