import type { QueryClient } from "@tanstack/react-query";

/**
 * `@tanstack/react-query` is an optional peer of the single `apixa` package (Core-only consumers
 * never need it). When a React consumer has not installed it, TypeScript resolves every import
 * from it to an error type that behaves as `any`, and `any & X` is `any`: a hook result would silently lose all its types.
 * Detect that here instead.
 */
export type TanStackQueryResolved = unknown extends QueryClient ? false : true;

/**
 * What a hook returns when `@tanstack/react-query` cannot be resolved from `apixa`'s declarations.
 * Every property access on it is a compile error that names the fix:
 * `npm install @tanstack/react-query`. (Under `skipLibCheck: true` TypeScript hides the
 * unresolved-module diagnostic inside `node_modules`, so this is the visible signal.)
 */
export interface ApixaMissingPeer_Install_tanstack_react_query {
  readonly "run: npm install @tanstack/react-query": never;
}

/** `T` when TanStack Query resolves; otherwise {@link ApixaMissingPeer_Install_tanstack_react_query}. */
export type RequireTanStackQuery<T> = TanStackQueryResolved extends true
  ? T
  : ApixaMissingPeer_Install_tanstack_react_query;
