import { mockApi } from "./api";

export const commentsKey = ["comments"] as const;

/** With `pagination: true`, `getAll()` is `Promise<Page<Comment>>` — use `.data` / `.next` / `.previous`. */
export const commentsQuery = {
  queryKey: commentsKey,
  queryFn: () => mockApi.comments.getAll(),
};
