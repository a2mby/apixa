import { defineApi, type TransportRequest } from "@apixa/core";

export type User = { id: string; name: string; active: boolean };
export type Post = { id: string; title: string };
export type PostPage = { items: Post[]; nextCursor: number | null };
const posts: Post[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), title: `Post ${i + 1}` }));
const users: User[] = [
  { id: "1", name: "Ada", active: true },
  { id: "2", name: "Grace", active: false },
];

function respond(request: TransportRequest): unknown {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/posts") {
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const end = start + Number(url.searchParams.get("limit") ?? 5);
    return { items: posts.slice(start, end), nextCursor: end < posts.length ? end : null };
  }
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
    // Test hook (browser checks): records each request when a page installs `__apixaRequests`.
    (globalThis as { __apixaRequests?: string[] }).__apixaRequests?.push(
      `${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`,
    );
    const body = respond(request);
    const raw = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    return { status: 200, headers: raw.headers, raw, body };
  },
};

export const api = defineApi<{
  users: { entity: User };
  posts: { entity: Post; list: PostPage; query: { cursor?: number; limit: number } };
}>()({
  baseURL: "https://example.test",
  transport,
  resources: {
    users: {
      path: "/users",
      // A custom read: integrations may cache it as a query instead of a mutation.
      operations: {
        stats: { kind: "read", method: "GET", path: "/stats" },
        // Core sends one Idempotency-Key per logical create (reused by retries).
        create: { idempotency: true },
      },
    },
    posts: { path: "/posts", operations: "read" },
  },
});

/** Shared by the server prefetch and the client hook, so both use the same cache entry. */
export const postsPaging = {
  initialPageParam: 0 as number,
  getNextPageParam: (last: PostPage) => last.nextCursor,
  query: (cursor: number) => ({ cursor, limit: 5 }),
};
