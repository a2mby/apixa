/**
 * `@apixa/mocking/datasets/comments` — the `comments-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/comments/comments-mock/data.json";
import type { Comment } from "../data/entities.js";

export type { Comment };

/** `comments-mock` */
export const comments: readonly Comment[] = data;
