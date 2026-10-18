declare const brand: unique symbol;

/** Branded type marker. Values are not read at runtime. */
export interface Type<T> {
  readonly [brand]: T;
}

/** The only intentional cast for operation `body` / `response` markers. */
export const type = <T>(): Type<T> => ({}) as Type<T>;

export type Infer<M> = M extends Type<infer T> ? T : never;
