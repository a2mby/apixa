export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type PathParams = Record<string, string | number>;

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined | Array<string | number | boolean>
>;

export type HeadersInitLike = HeadersInit | Record<string, string | undefined>;
