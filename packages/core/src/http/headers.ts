import { ApiError } from "../errors/index.js";
import type { HeadersInitLike, HeadersSource } from "../types/http.js";

function apply(target: Headers, source: HeadersInitLike | undefined): void {
  if (!source) return;
  if (source instanceof Headers) {
    source.forEach((value, key) => target.set(key, value));
    return;
  }
  if (Array.isArray(source)) {
    for (const [key, value] of source) target.set(key, value);
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) target.delete(key);
    else target.set(key, String(value));
  }
}

/** Static merge (case-insensitive; later sources win; `undefined` deletes). */
export function mergeHeaders(...sources: Array<HeadersInitLike | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) apply(headers, source);
  return headers;
}

/**
 * Resolve root → resource → operation → request header sources for one logical request.
 * Providers run every call (fresh credentials); a fresh `Headers` is built per call so nothing
 * leaks between requests or clients. Provider failures become `ApiError` code `HEADERS`.
 */
export async function resolveHeaders(sources: readonly HeadersSource[], request?: HeadersInitLike): Promise<Headers> {
  const headers = new Headers();
  for (const source of sources) {
    if (typeof source === "function") {
      let value: HeadersInitLike | undefined;
      try {
        value = await source();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new ApiError(`Header provider failed: ${detail}`, { code: "HEADERS", cause });
      }
      apply(headers, value);
    } else {
      apply(headers, source);
    }
  }
  apply(headers, request);
  return headers;
}
