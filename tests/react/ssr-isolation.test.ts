import { defineApi } from "@apixa/core";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  prefetchResourceInfiniteQuery,
  prefetchResourceQuery,
} from "../../packages/react/src/query-options.js";
import { createFakeTransport } from "../helpers/fake-transport.js";

type User = { id: string; name: string };
type Post = { id: string; owner: string };
type PostPage = { items: Post[]; next: number | null };

/** One server: answers with the data of whoever the Authorization header names, after a delay. */
const server = createFakeTransport(async (request) => {
  const who = request.headers.get("authorization")?.replace("Bearer ", "") ?? "anonymous";
  await new Promise((resolve) => setTimeout(resolve, who === "alice" ? 15 : 1));
  if (new URL(request.url).pathname === "/posts") {
    return { body: { items: [{ id: `${who}-p1`, owner: who }], next: null } satisfies PostPage };
  }
  return { body: [{ id: who, name: `${who}'s profile` }] satisfies User[] };
});

/** What an app does per request: an API bound to that request's credentials. */
const apiFor = (token: string) =>
  defineApi<{ users: { entity: User }; posts: { entity: Post; list: PostPage } }>()({
    baseURL: "https://x.dev",
    transport: server,
    headers: { authorization: `Bearer ${token}` },
    resources: { users: { path: "/users" }, posts: { path: "/posts", readOnly: true } },
  });

async function render(token: string) {
  const client = new QueryClient(); // request-scoped, as the docs require
  const api = apiFor(token);
  await Promise.all([
    prefetchResourceQuery(client, api.users, { queryKey: ["users"] }),
    prefetchResourceInfiniteQuery(client, api.posts, {
      queryKey: ["posts"],
      infinite: { initialPageParam: 0, getNextPageParam: (last: PostPage) => last.next },
    }),
  ]);
  return JSON.stringify(dehydrate(client));
}

describe("request-scoped server prefetching", () => {
  it("concurrent renders for different users never share data", async () => {
    // Alice's responses are slower, so the two renders interleave.
    const [alice, bob] = await Promise.all([render("alice"), render("bob")]);
    expect(alice).toContain("alice's profile");
    expect(alice).toContain("alice-p1");
    expect(alice).not.toContain("bob");
    expect(bob).toContain("bob's profile");
    expect(bob).not.toContain("alice");
  });

  it("dehydrated state carries keys and data only, never request headers", async () => {
    const state = await render("secret-token-123");
    expect(state).not.toContain("Bearer");
    expect(state).not.toMatch(/authorization/i);
    // The token appears only inside the fake server's echoed data, not as request metadata.
    const parsed = JSON.parse(state) as { queries: Array<{ queryKey: unknown[] }> };
    expect(parsed.queries.map((q) => q.queryKey)).toEqual([
      ["users", "list"],
      ["posts", "infinite", "getAll"],
    ]);
  });

  it("a shared QueryClient would leak, which is why the client must be per request", async () => {
    const shared = new QueryClient();
    await prefetchResourceQuery(shared, apiFor("alice").users, { queryKey: ["users"] });
    // Same key, different user: an existing fresh entry is reused, so Bob would see Alice's data.
    await prefetchResourceQuery(shared, apiFor("bob").users, {
      queryKey: ["users"],
      staleTime: 60_000,
    });
    expect(JSON.stringify(dehydrate(shared))).toContain("alice");
  });
});
