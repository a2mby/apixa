"use client";

import { useResourceQuery } from "@apixa/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

function List() {
  const users = useResourceQuery(api.users, { queryKey: ["native-users"] });
  return <ul>{users.data?.map((user) => <li key={user.id}>{user.name}</li>)}</ul>;
}

/** Apixa's hooks work under a plain TanStack provider; no Apixa provider is required. */
export function NativeDemo() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <List />
    </QueryClientProvider>
  );
}
