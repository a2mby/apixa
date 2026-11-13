import type { HttpMethod } from "../types/http.js";

type Convention = {
  method: HttpMethod;
  path: string;
  hasBody?: boolean;
  access: "read" | "write";
  extended: boolean;
  many: boolean;
  strategy?: "exists" | "findFirst" | "getMany" | "getBy";
};

/** Shared source for runtime selection and public builtin-name types. */
export const BUILTIN_CONVENTIONS = {
  getAll: { method: "GET", path: "", access: "read", extended: false, many: false },
  getById: { method: "GET", path: "/:id", access: "read", extended: false, many: false },
  create: { method: "POST", path: "", access: "write", extended: false, many: false },
  update: { method: "PUT", path: "/:id", access: "write", extended: false, many: false },
  delete: {
    method: "DELETE",
    path: "/:id",
    hasBody: false,
    access: "write",
    extended: false,
    many: false,
  },
  patch: { method: "PATCH", path: "/:id", access: "write", extended: true, many: false },
  count: { method: "GET", path: "/count", access: "read", extended: true, many: false },
  createMany: { method: "POST", path: "/bulk", access: "write", extended: true, many: true },
  deleteMany: {
    method: "DELETE",
    path: "/bulk",
    hasBody: true,
    access: "write",
    extended: true,
    many: true,
  },
  getMany: {
    method: "GET",
    path: "",
    access: "read",
    extended: true,
    many: true,
    strategy: "getMany",
  },
  exists: {
    method: "GET",
    path: "/:id",
    access: "read",
    extended: true,
    many: false,
    strategy: "exists",
  },
  findFirst: {
    method: "GET",
    path: "",
    access: "read",
    extended: true,
    many: false,
    strategy: "findFirst",
  },
  getBy: {
    method: "GET",
    path: "",
    access: "read",
    extended: true,
    many: false,
    strategy: "getBy",
  },
} as const satisfies Record<string, Convention>;

export type BuiltinConventionName = keyof typeof BUILTIN_CONVENTIONS;

export function isBuiltinName(name: string): name is BuiltinConventionName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_CONVENTIONS, name);
}
