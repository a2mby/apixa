"use client";

import { ApixaProvider, useResourceQuery } from "@apixa/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Probe = { __clients?: unknown[] };

function List({ renders, onRerender }: { renders: number; onRerender: () => void }) {
  const client = useQueryClient();
  // Test hook: every distinct client the provider hands out is recorded.
  useEffect(() => {
    ((window as Probe).__clients ??= []).push(client);
  }, [client]);
  const users = useResourceQuery(api.users, { queryKey: ["config-users"] });
  return (
    <section>
      <p data-testid="renders">{renders}</p>
      <button onClick={onRerender}>Rerender provider</button>
      <ul>{users.data?.map((user) => <li key={user.id}>{user.name}</li>)}</ul>
    </section>
  );
}

/** The provider re-renders with a new `config` object each time; its client must stay the same. */
export function ConfigDemo() {
  const [renders, setRenders] = useState(0);
  return (
    <ApixaProvider config={{ staleTime: 60_000, retry: false }}>
      <List renders={renders} onRerender={() => setRenders((n) => n + 1)} />
    </ApixaProvider>
  );
}
