import { ApixaHydrationBoundary } from "@apixa/react";
import {
  QueryClient,
  dehydrate,
  prefetchResourceInfiniteQuery,
  prefetchResourceQuery,
} from "@apixa/react/advanced";
import { api, postsPaging } from "../lib/api";
import { Posts } from "./posts";
import { Users } from "./users";

export const dynamic = "force-dynamic";

export default async function Page() {
  // A new cache per server render prevents data from crossing requests.
  const client = new QueryClient();
  await Promise.all([
    prefetchResourceQuery(client, api.users, { queryKey: ["users"] }),
    prefetchResourceInfiniteQuery(client, api.posts, { queryKey: ["posts"], infinite: postsPaging }),
  ]);
  return (
    <ApixaHydrationBoundary state={dehydrate(client)}>
      <main>
        <h1>Users</h1>
        <Users />
        <h2>Posts</h2>
        <Posts />
      </main>
    </ApixaHydrationBoundary>
  );
}
