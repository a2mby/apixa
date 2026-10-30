import { mockApi, type User } from "@/lib/api";

export const usersKey = ["users"] as const;

export const usersQuery = {
  queryKey: usersKey,
  /** TanStack Query passes `signal` — Core aborts as `AbortError` (mock transport honors it). */
  queryFn: () => mockApi.users.getAll(),
};

export type CreateUserInput = Omit<User, "id">;
