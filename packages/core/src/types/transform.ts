import type { KeyCase } from "../transform/keys.js";

export type { KeyCase };

/** Key transform rule for one direction (`request` or `response`). */
export interface KeyTransformConfig {
  keys: KeyCase;
  /**
   * Key names or dot-paths excluded from key transformation (neither the matched key itself nor
   * its nested descendants are transformed).
   */
  exclude?: readonly string[];
  /**
   * Key names or dot-paths whose nested value keys are preserved untouched while the matched key
   * itself is still converted.
   */
  preserve?: readonly string[];
  /** Maximum nesting depth walked before throwing `TransformError`. Default: `64`. */
  maxDepth?: number;
}

/** Per-direction key conventions. */
export interface TransformsConfig {
  /** Convert outgoing body / query keys to the backend convention at the serialization stage. */
  request?: KeyTransformConfig;
  /** Convert incoming response keys to the public convention before response middleware. */
  response?: KeyTransformConfig;
}

type Sep = "_" | "-";
type IsUpper<C extends string> =
  C extends Lowercase<C> ? false : C extends Uppercase<C> ? true : false;
type EndsWith<S extends string, X extends string> = S extends `${string}${X}` ? true : false;

/** Same character-wise rules as the runtime `convertKey` (see `transform/keys.ts`). */
type Delimited<
  S extends string,
  D extends Sep,
  Acc extends string = "",
> = S extends `${infer C}${infer Rest}`
  ? C extends Sep
    ? Delimited<Rest, D, Acc extends "" ? Acc : EndsWith<Acc, D> extends true ? Acc : `${Acc}${D}`>
    : IsUpper<C> extends true
      ? Delimited<
          Rest,
          D,
          Acc extends ""
            ? Lowercase<C>
            : EndsWith<Acc, D> extends true
              ? `${Acc}${Lowercase<C>}`
              : `${Acc}${D}${Lowercase<C>}`
        >
      : Delimited<Rest, D, `${Acc}${C}`>
  : Acc;

type Camel<
  S extends string,
  Acc extends string = "",
  Up extends boolean = false,
> = S extends `${infer C}${infer Rest}`
  ? C extends Sep
    ? Camel<Rest, Acc, Acc extends "" ? false : true>
    : Acc extends ""
      ? Camel<Rest, Lowercase<C>, false>
      : Camel<Rest, `${Acc}${Up extends true ? Uppercase<C> : C}`, false>
  : Acc;

export type ConvertKey<K extends string, C extends KeyCase> = string extends K
  ? string
  : C extends "camelCase"
    ? Camel<K>
    : C extends "PascalCase"
      ? Capitalize<Camel<K>>
      : C extends "snake_case"
        ? Delimited<K, "_">
        : Delimited<K, "-">;

/** Values that are never walked by the runtime transform. */
type Opaque =
  | Date
  | RegExp
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream
  | Map<unknown, unknown>
  | Set<unknown>
  | ((...args: never[]) => unknown);

type IsAny<T> = 0 extends 1 & T ? true : false;

type RuleCase<R> = R extends KeyCase
  ? R
  : R extends { keys: infer C extends KeyCase }
    ? C
    : undefined;

type LiteralListMember<L> = L extends readonly (infer S extends string)[]
  ? string extends S
    ? never
    : S
  : never;

type ExcludedKeys<R> = R extends { exclude: infer E } ? LiteralListMember<E> : never;
type PreservedKeys<R> = R extends { preserve: infer P } ? LiteralListMember<P> : never;

type StripDot<S extends string> = S extends `$.${infer Rest}` ? Rest : S;
type TopName<P extends string> = P extends `${string}.${string}` ? never : P;
type SubPaths<Patterns extends string, K extends string> = {
  [P in Patterns]: StripDot<P> extends `${K}.${infer Rest}` ? Rest : never;
}[Patterns];

type NextRule<
  C extends KeyCase,
  ExcludePat extends string,
  PreservePat extends string,
  K extends string,
> = {
  keys: C;
  exclude: (TopName<ExcludePat> | SubPaths<ExcludePat, K>)[];
  preserve: (TopName<PreservePat> | SubPaths<PreservePat, K>)[];
};

type TransformObject<
  T,
  C extends KeyCase,
  ExcludePat extends string,
  PreservePat extends string,
> = {
  [
    K in keyof T as K extends string ? (K extends TopName<ExcludePat> ? K : ConvertKey<K, C>) : K
  ]: K extends string
    ? K extends TopName<ExcludePat> | TopName<PreservePat>
      ? T[K]
      : TransformWithRule<T[K], NextRule<C, ExcludePat, PreservePat, K>>
    : T[K];
};

type TransformWithRule<T, R> =
  RuleCase<R> extends infer C extends KeyCase
    ? IsAny<T> extends true
      ? T
      : T extends Opaque
        ? T
        : T extends readonly (infer E)[]
          ? T extends unknown[]
            ? TransformWithRule<E, R>[]
            : readonly TransformWithRule<E, R>[]
          : T extends object
            ? TransformObject<T, C, ExcludedKeys<R>, PreservedKeys<R>>
            : T
    : T;

/** Recursively rename keys of plain object types (and inside arrays) to convention `C`. */
export type TransformKeys<
  T,
  C extends KeyCase | KeyTransformConfig | undefined,
> = TransformWithRule<T, C>;
