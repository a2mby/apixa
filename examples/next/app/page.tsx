"use client";

import { CreateUserForm } from "@/components/create-user-form";
import { UserActions } from "@/components/user-actions";
import { commentsQuery } from "@/lib/comments";
import { usersQuery } from "@/lib/users";
import { useQuery } from "@tanstack/react-query";

export default function HomePage() {
  const { data: users = [], isPending, isFetching, error, refetch } = useQuery(usersQuery);
  const { data: commentsPage } = useQuery(commentsQuery);
  const comments = commentsPage?.data ?? [];

  return (
    <main>
      <div className="hero">
        <p className="eyebrow">Apixa · Next example</p>
        <h1>Users</h1>
        <p className="meta">TanStack Query + Apixa — list updates without a full refresh.</p>
      </div>

      <div className="grid">
        <section className="panel">
          <div className="actions" style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, flex: 1 }}>Directory</h2>
            <button
              type="button"
              className="secondary"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? "Loading…" : "Reload"}
            </button>
          </div>

          {error ? <p className="error">{error.message}</p> : null}
          {isPending ? <p className="empty">Loading users…</p> : null}
          {!isPending && users.length === 0 && !error ? (
            <p className="empty">No users yet. Create one on the right.</p>
          ) : null}

          {users.length > 0 ? (
            <ul className="list">
              {users.map((user) => (
                <li key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>
                      {user.email} · {user.id}
                    </span>
                  </div>
                  <UserActions user={user} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel">
          <h2>Create user</h2>
          <CreateUserForm />
        </section>

        <section className="panel">
          <h2>
            Comments
            {commentsPage ? ` · page ${commentsPage.page}` : null}
          </h2>
          <p className="meta">
            defineMockApi + pagination: true → page envelope (data, total, previous, next).
          </p>
          {commentsPage ? (
            <p className="meta">
              {commentsPage.total} total · prev {String(commentsPage.previous)} · next{" "}
              {String(commentsPage.next)}
            </p>
          ) : null}
          {comments.length > 0 ? (
            <ul className="list">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <div>
                    <strong>#{comment.id}</strong>
                    <span>
                      {comment.body} · post {comment.postId}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No comments loaded.</p>
          )}
        </section>
      </div>
    </main>
  );
}
