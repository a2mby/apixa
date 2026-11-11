import { NetworkError, SecurityError } from "../errors/index.js";
import type { TransportRequest } from "../types/transport.js";

/** What one hop sends; `duplex` is set for stream bodies. */
export interface Hop {
  headers: Headers;
  body: BodyInit | null | undefined;
  duplex: boolean;
}

const MAX_REDIRECTS = 20;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const BODY_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
  "content-location",
];

const blocked = (message: string) =>
  new SecurityError(
    `${message} Credentials and custom headers are never forwarded across origins. Return the final URL from your API and fetch it with a presigned descriptor, or list the destination origin in redirectOrigins.`,
  );

/**
 * One request with redirects handled here instead of by the runtime. `fetch` would follow a
 * redirect to another origin with the request's custom headers (only `Authorization` is stripped),
 * so every hop is inspected before anything is sent to it:
 *
 * - same origin: followed with the request unchanged (method and body rewritten like fetch does);
 * - a listed `redirectOrigins` origin: followed with **no** headers, cookies or body, `GET`/`HEAD` only;
 * - anything else, or a runtime that hides the destination (browsers return an opaque redirect for
 *   `redirect: "manual"`): refused with `SecurityError` before the destination is contacted.
 */
export async function fetchSafely(
  fetchImpl: typeof fetch,
  input: TransportRequest,
  first: Hop,
  rebuild: () => Promise<Hop>,
): Promise<Response> {
  const origins = new Set(input.redirectOrigins ?? []);
  let url = input.url;
  let method: string = input.method;
  let hop = first;
  let bare = false; // true once the request left the API origin: nothing sensitive is sent any more
  let replays = false; // the body must be re-sent for a 307/308

  for (let count = 0; ; count++) {
    const response = await fetchImpl(url, {
      method,
      headers: hop.headers,
      body: hop.body,
      signal: input.signal,
      redirect: "manual",
      ...(bare ? { credentials: "omit" as const } : {}),
      ...(hop.duplex ? ({ duplex: "half" } as RequestInit) : {}),
    });
    if (response.type === "opaqueredirect")
      throw blocked(
        "This runtime hides redirect destinations, so Apixa cannot verify where the redirect leads and refuses to follow it.",
      );
    const location = REDIRECTS.has(response.status) ? response.headers.get("location") : null;
    if (location === null) return response;
    void response.body?.cancel().catch(() => {});
    if (count >= MAX_REDIRECTS) throw new NetworkError("Too many redirects");

    let next: URL;
    try {
      next = new URL(location, url);
    } catch (cause) {
      throw new NetworkError("Redirect response carried an invalid Location", { cause });
    }
    if (next.protocol !== "https:" && next.protocol !== "http:")
      throw blocked(`Refusing to follow a redirect to a ${next.protocol} URL.`);
    const current = new URL(url);
    const status = response.status;
    const toGet =
      (status === 303 && method !== "GET" && method !== "HEAD") ||
      ((status === 301 || status === 302) && method === "POST");
    const sameOrigin = next.origin === current.origin;
    if (!sameOrigin) {
      if (!origins.has(next.origin))
        throw blocked(`Refusing to follow a redirect from ${current.origin} to ${next.origin}.`);
      if (!toGet && method !== "GET" && method !== "HEAD")
        throw blocked(`Refusing to forward a ${method} request (and its body) to ${next.origin}.`);
      bare = true;
    }
    if (toGet) {
      method = "GET";
      replays = false;
      const headers = new Headers(hop.headers);
      for (const name of BODY_HEADERS) headers.delete(name);
      hop = { headers, body: undefined, duplex: false };
    } else if (hop.body !== undefined && hop.body !== null && !bare) {
      // 307/308 (or a method that keeps its body): the body is sent again, so it must be replayable.
      replays = true;
    }
    if (bare) hop = { headers: new Headers(), body: undefined, duplex: false };
    else if (replays && !toGet) hop = await rebuild();
    url = next.href;
  }
}
