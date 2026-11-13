"use client";

import { useResourceQuery } from "@apixa/react";
import { api, postsPaging } from "../lib/api";

export function Posts() {
  // Infinite mode of the same hook: hydrated first page, then native fetchNextPage.
  const posts = useResourceQuery(api.posts, {
    queryKey: ["posts"],
    staleTime: 30_000,
    infinite: postsPaging,
  });

  if (posts.isPending) return <p>Loading posts…</p>;
  if (posts.isError) return <p role="alert">{posts.error.message}</p>;
  return (
    <section>
      <ul>
        {posts.data.pages.flatMap((page) => page.data).map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button
        disabled={!posts.hasNextPage || posts.isFetchingNextPage}
        onClick={() => void posts.fetchNextPage()}
      >
        {posts.hasNextPage ? "Load more" : "No more posts"}
      </button>
    </section>
  );
}
