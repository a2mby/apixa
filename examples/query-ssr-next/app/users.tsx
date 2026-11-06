"use client";

import { useResource } from "@apixa/tanstack-query";
import { useState } from "react";
import { api } from "../lib/api";

export function Users() {
  // List hydrated from the server prefetch; writes and reads share the ["users"] identity.
  const users = useResource(api.users, {
    queryKey: ["users"],
    query: { staleTime: 30_000 },
    mutations: { create: { invalidate: "lists" } },
  });
  const [stats, setStats] = useState<string>("");

  if (users.isPending) return <p>Loading users…</p>;
  if (users.isError) return <p role="alert">{users.error.message}</p>;
  return (
    <section>
      <ul>
        {users.data.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
      <button
        disabled={users.states.create.isPending}
        onClick={() => void users.create({ name: `User ${users.data.length + 1}`, active: true })}
      >
        Add user
      </button>
      <button onClick={() => void users.stats().then((s) => setStats(JSON.stringify(s)))}>
        Load stats (cached read)
      </button>
      <output>{stats}</output>
    </section>
  );
}
