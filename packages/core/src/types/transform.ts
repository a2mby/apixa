import type { KeyCase } from "../transform/keys.js";

export type { KeyCase };

/** Per-direction key conventions. */
export interface TransformsConfig {
  /** Convert outgoing body / query keys to the backend convention at the serialization stage. */
  request?: { keys: KeyCase };
  /** Convert incoming response keys to the public convention before response middleware. */
  response?: { keys: KeyCase };
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

/** Recursively rename keys of plain object types (and inside arrays) to convention `C`. */
export type TransformKeys<T, C extends KeyCase | undefined> = C extends KeyCase
  ? IsAny<T> extends true
    ? T
    : T extends Opaque
      ? T
      : T extends readonly (infer E)[]
        ? T extends unknown[]
          ? TransformKeys<E, C>[]
          : readonly TransformKeys<E, C>[]
        : T extends object
          ? { [K in keyof T as K extends string ? ConvertKey<K, C> : K]: TransformKeys<T[K], C> }
          : T
  : T;
