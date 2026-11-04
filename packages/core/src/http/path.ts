import type { PathParams } from "../types/http.js";

export function interpolatePath(path: string, params?: PathParams): string {
  if (!params) return path;

  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

export function joinURL(baseURL: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = baseURL.replace(/\/+$/, "");
  if (!path || path === "/") {
    return base;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/** Join a resource path with an operation path that may be relative. */
export function joinPath(base: string, relative?: string): string {
  if (!relative || relative === "/") {
    return base.replace(/\/+$/, "") || "/";
  }

  if (/^https?:\/\//i.test(relative)) {
    return relative;
  }

  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedRelative = relative.startsWith("/") ? relative : `/${relative}`;
  return `${normalizedBase}${normalizedRelative}`;
}

export function extractPathParamNames(path: string): string[] {
  if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  const names: string[] = [];
  const re = /:([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(path)) !== null) {
    names.push(match[1]!);
  }

  return names;
}
