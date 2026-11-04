type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Public `create()` body for an entity: everything but the id required, id optional. */
export type CreateBodyOf<T, IdKey extends keyof T = "id" & keyof T> = Simplify<
  Omit<T, IdKey> & Partial<Pick<T, IdKey>>
>;
