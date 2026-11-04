import { defineApi, type TransportRequest } from "@apixa/core";

export type User = { id: string; name: string; active: boolean };
const users: User[] = [
  { id: "1", name: "Ada", active: true },
  { id: "2", name: "Grace", active: false },
];

function respond(request: TransportRequest): unknown {
  const path = new URL(request.url).pathname;
  if (request.method === "POST" && path === "/users") {
    const created = { id: String(users.length + 1), active: true, ...JSON.parse(String(request.body)) };
    users.push(created);
    return created;
  }
  if (path === "/users/stats") return { total: users.length, active: users.filter((u) => u.active).length };
  const id = path.match(/^\/users\/([^/]+)$/)?.[1];
  return id ? users.find((user) => user.id === id) : users;
}

// Deterministic local transport: this example builds and runs without an API server.
const transport = {
  async request(request: TransportRequest) {
    const body = respond(request);
    const raw = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    return { status: 200, headers: raw.headers, raw, body };
  },
};

export const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://example.test",
  transport,
  resources: {
    users: {
      path: "/users",
      // A custom read: integrations may cache it as a query instead of a mutation.
      operations: { stats: { kind: "read", method: "GET", path: "/stats" } },
    },
  },
});
