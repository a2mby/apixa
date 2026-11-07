/**
 * `@apixa/mocking/datasets/posts` — the `posts-mock` records on their own. Importing this path loads
 * only this dataset (no barrel, no other dataset module). The array is the module-cached source
 * shared by every caller: treat it as read-only.
 */
import data from "../../../../datasets/social/posts-mock/data.json";
import type { Post } from "../data/entities.js";

export type { Post };

/** `posts-mock` */
export const posts: readonly Post[] = data;
