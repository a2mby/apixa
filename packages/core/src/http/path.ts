import { ValidationError } from "../errors/index.js";
import type { PathParams } from "../types/http.js";

const PARAM = /:([A-Za-z0-9_]+)/g;

/** Fill `:name` segments (URL-encoded). The scheme/port part of an absolute URL is left alone. */
export function interpolatePath(path: string, params?: PathParams): string {
  const absolute = /^(https?:\/\/[^/]+)(.*)$/i.exec(path);
  const head = absolute ? absolute[1]! : "";
  const tail = absolute ? absolute[2]! : path;
  return (
    head +
    tail.replace(PARAM, (_, key: string) => {
      const value = params?.[key];
      if (value === undefined || value === null || value === "") {
        throw new ValidationError(`Missing path parameter "${key}" for ${path}`);
      }
      return encodeURIComponent(String(value));
    })
  );
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
