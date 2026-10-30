"use client";

import { api, type User } from "@/lib/api";
import { usersKey, usersQuery, type CreateUserInput } from "@/lib/users";
import { isApiError } from "@apixa/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

type UserFormState = {
  name: string;
  email: string;
  username: string;
  companyId: string;
};

const emptyForm: UserFormState = {
  name: "",
  email: "",
  username: "",
  companyId: "1",
};

function toForm(user: User): UserFormState {
  return {
    name: user.name,
    email: user.email,
    username: user.username,
    companyId: user.companyId,
  };
}

function TestPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isFetching, error, refetch } = useQuery(usersQuery);
  const users: User[] = data ?? [];

  const [createForm, setCreateForm] = useState<UserFormState>(emptyForm);
  const [lookupId, setLookupId] = useState("");
  const [lookedUp, setLookedUp] = useState<User | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(emptyForm);
  const [status, setStatus] = useState<string | null>(null);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: usersKey });

  const createUser = useMutation({
    mutationFn: (input: CreateUserInput) => api.users.create(input),
    onSuccess: (created) => {
      queryClient.setQueryData(usersKey, (current: User[] = []) => [created, ...current]);
      setCreateForm(emptyForm);
      setStatus(`create → ${created.name} (${created.id})`);
    },
  });

  const getById = useMutation({
    mutationFn: (id: string) => api.users.getById(id),
    onSuccess: (user) => {
      setLookedUp(user);
      setStatus(`getById → ${user.name} (${user.id})`);
    },
    onError: () => {
      setLookedUp(null);
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateUserInput> }) =>
      api.users.update(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(usersKey, (current: User[] = []) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (lookedUp?.id === updated.id) setLookedUp(updated);
      setEditingId(null);
      setStatus(`update → ${updated.name} (${updated.id})`);
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.users.delete(id),
    onSuccess: (_void, id) => {
      queryClient.setQueryData(usersKey, (current: User[] = []) =>
        current.filter((item) => item.id !== id),
      );
      if (lookedUp?.id === id) setLookedUp(null);
      if (editingId === id) setEditingId(null);
      setStatus(`delete → ${id}`);
    },
  });

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = createForm.email.trim();
    const local = createForm.username.trim() || email.split("@")[0] || "user";
    createUser.mutate({
      name: createForm.name.trim(),
      email,
      username: local,
      companyId: createForm.companyId.trim() || "1",
    });
  };

  const onLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = lookupId.trim();
    if (!id) return;
    getById.mutate(id);
  };

  const onUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    updateUser.mutate({
      id: editingId,
      body: {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        username: editForm.username.trim(),
        companyId: editForm.companyId.trim(),
      },
    });
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm(toForm(user));
    setStatus(null);
  };

  const actionError =
    createUser.error ?? getById.error ?? updateUser.error ?? deleteUser.error;

  return (
    <main>
      <div className="hero">
        <p className="eyebrow">Apixa · CRUD playground</p>
        <h1>Users API test</h1>
        <p className="meta">
          Exercises getAll, getById, create, update, and delete against the mock users resource.
        </p>
        {status ? <p className="success">{status}</p> : null}
        {actionError ? (
          <p className="error">
            {isApiError(actionError) ? actionError.message : "Request failed"}
          </p>
        ) : null}
      </div>

      <div className="grid">
        <section className="panel">
          <div className="actions" style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, flex: 1 }}>Directory · getAll</h2>
            <button
              type="button"
              className="secondary"
              disabled={isFetching}
              onClick={() => {
                void refetch();
                setStatus("getAll → refetch");
              }}
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
                      {user.email} · @{user.username} · co {user.companyId}
                    </span>
                    <span>{user.id}</span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={getById.isPending}
                      onClick={() => {
                        setLookupId(user.id);
                        getById.mutate(user.id);
                      }}
                    >
                      getById
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={updateUser.isPending}
                      onClick={() => startEdit(user)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={deleteUser.isPending}
                      onClick={() => deleteUser.mutate(user.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div style={{ display: "grid", gap: "1.25rem" }}>
          <section className="panel">
            <h2>Create · create</h2>
            <form onSubmit={onCreate}>
              <label>
                Name
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={createUser.isPending}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={createUser.isPending}
                  required
                />
              </label>
              <label>
                Username
                <input
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  disabled={createUser.isPending}
                  placeholder="defaults from email"
                />
              </label>
              <label>
                Company ID
                <input
                  value={createForm.companyId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, companyId: e.target.value }))}
                  disabled={createUser.isPending}
                  required
                />
              </label>
              <button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? "Creating…" : "Create user"}
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Lookup · getById</h2>
            <form onSubmit={onLookup}>
              <label>
                User ID
                <input
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  disabled={getById.isPending}
                  placeholder="Paste or pick from the list"
                  required
                />
              </label>
              <button type="submit" disabled={getById.isPending}>
                {getById.isPending ? "Fetching…" : "Fetch by ID"}
              </button>
            </form>
            {lookedUp ? (
              <div style={{ marginTop: "1rem" }}>
                <p className="meta" style={{ marginBottom: "0.5rem" }}>
                  Result
                </p>
                <ul className="list">
                  <li>
                    <div>
                      <strong>{lookedUp.name}</strong>
                      <span>
                        {lookedUp.email} · @{lookedUp.username} · co {lookedUp.companyId}
                      </span>
                      <span>{lookedUp.id}</span>
                    </div>
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <h2>Update · update</h2>
            {editingId ? (
              <form onSubmit={onUpdate}>
                <p className="meta">Editing {editingId}</p>
                <label>
                  Name
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    disabled={updateUser.isPending}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={updateUser.isPending}
                    required
                  />
                </label>
                <label>
                  Username
                  <input
                    value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                    disabled={updateUser.isPending}
                    required
                  />
                </label>
                <label>
                  Company ID
                  <input
                    value={editForm.companyId}
                    onChange={(e) => setEditForm((f) => ({ ...f, companyId: e.target.value }))}
                    disabled={updateUser.isPending}
                    required
                  />
                </label>
                <div className="actions">
                  <button type="submit" disabled={updateUser.isPending}>
                    {updateUser.isPending ? "Saving…" : "Save update"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={updateUser.isPending}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="empty">Select Edit on a user in the directory.</p>
            )}
          </section>
        </div>
      </div>

      <p className="footer-note">
        Mock transport · list cache key {JSON.stringify(usersKey)} ·{" "}
        <button
          type="button"
          className="secondary"
          style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
          onClick={() => void invalidateUsers()}
        >
          Invalidate cache
        </button>
      </p>
    </main>
  );
}

export default TestPage;
