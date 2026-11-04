import { createResourceQueryOptions } from "@apixa/tanstack-query/advanced";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Users } from "./users";

export const dynamic = "force-dynamic";

export default async function Page() {
  // A new cache per server render prevents data from crossing requests.
  const client = new QueryClient();
  await client.prefetchQuery(createResourceQueryOptions(api.users, { queryKey: ["users"] }));
  return <HydrationBoundary state={dehydrate(client)}><main><h1>Users</h1><Users /></main></HydrationBoundary>;
}
