import { prefetchResourceInfiniteQuery, prefetchResourceQuery } from "@apixa/tanstack-query/advanced";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
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
    <HydrationBoundary state={dehydrate(client)}>
      <main>
        <h1>Users</h1>
        <Users />
        <h2>Posts</h2>
        <Posts />
      </main>
    </HydrationBoundary>
  );
}
