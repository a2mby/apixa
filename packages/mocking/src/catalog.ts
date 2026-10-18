import type {
  AreaCode,
  CapitalCity,
  Comment,
  Company,
  CountryCode,
  CountryCsc,
  CountryMledoze,
  CountryParseapi,
  Currency,
  Language,
  MockUser,
  Order,
  Post,
  Product,
  Timezone,
  User,
} from "./data/entities.js";

type Entry<Entity, IdKey extends keyof Entity> = { entity: Entity; idKey: IdKey };

/**
 * Datasets `defineMockApi()` can load: dataset id → entity type + the field that identifies a record.
 * Not exposed: `states-csc`, `states-parseapi`, `counties-parseapi` (each >500 KB; the two parseapi
 * sets also have non-unique id fields, so `getById` would be ambiguous).
 */
export interface DatasetCatalog {
  "users-sample": Entry<User, "id">;
  "users-mock": Entry<MockUser, "id">;
  "products-mock": Entry<Product, "id">;
  "companies-mock": Entry<Company, "id">;
  "orders-mock": Entry<Order, "id">;
  "posts-mock": Entry<Post, "id">;
  "comments-mock": Entry<Comment, "id">;
  "countries-csc": Entry<CountryCsc, "id">;
  "countries-mledoze": Entry<CountryMledoze, "id">;
  "countries-parseapi": Entry<CountryParseapi, "country">;
  "country-codes-iso": Entry<CountryCode, "id">;
  "cities-capitals": Entry<CapitalCity, "id">;
  "currencies-parseapi": Entry<Currency, "currency">;
  "languages-parseapi": Entry<Language, "language">;
  "timezones-parseapi": Entry<Timezone, "timezone">;
  "area-codes-parseapi": Entry<AreaCode, "area_code">;
}

export type DatasetId = keyof DatasetCatalog;
export type EntityOf<K extends DatasetId> = DatasetCatalog[K]["entity"];
export type IdKeyOf<K extends DatasetId> = DatasetCatalog[K]["idKey"] & keyof EntityOf<K>;

type CatalogEntry<K extends DatasetId> = {
  idKey: DatasetCatalog[K]["idKey"];
  /** Lazy so bundlers split each dataset into its own chunk; the JSON must satisfy the entity type. */
  load: () => Promise<{ default: readonly EntityOf<K>[] }>;
};

/** The root `datasets/` folder stays the single source of truth — these are direct JSON imports. */
export const catalog = {
  "users-sample": {
    idKey: "id",
    load: () => import("../../../datasets/users/users-sample/data.json"),
  },
  "users-mock": {
    idKey: "id",
    load: () => import("../../../datasets/users/users-mock/data.json"),
  },
  "products-mock": {
    idKey: "id",
    load: () => import("../../../datasets/products/products-mock/data.json"),
  },
  "companies-mock": {
    idKey: "id",
    load: () => import("../../../datasets/companies/companies-mock/data.json"),
  },
  "orders-mock": {
    idKey: "id",
    load: () => import("../../../datasets/orders/orders-mock/data.json"),
  },
  "posts-mock": {
    idKey: "id",
    load: () => import("../../../datasets/social/posts-mock/data.json"),
  },
  "comments-mock": {
    idKey: "id",
    load: () => import("../../../datasets/comments/comments-mock/data.json"),
  },
  "countries-csc": {
    idKey: "id",
    load: () => import("../../../datasets/geography/countries-csc/data.json"),
  },
  "countries-mledoze": {
    idKey: "id",
    load: () => import("../../../datasets/geography/countries-mledoze/data.json"),
  },
  "countries-parseapi": {
    idKey: "country",
    load: () => import("../../../datasets/geography/countries-parseapi/data.json"),
  },
  "country-codes-iso": {
    idKey: "id",
    load: () => import("../../../datasets/reference/country-codes-iso/data.json"),
  },
  "cities-capitals": {
    idKey: "id",
    load: () => import("../../../datasets/geography/cities-capitals/data.json"),
  },
  "currencies-parseapi": {
    idKey: "currency",
    load: () => import("../../../datasets/reference/currencies-parseapi/data.json"),
  },
  "languages-parseapi": {
    idKey: "language",
    load: () => import("../../../datasets/reference/languages-parseapi/data.json"),
  },
  "timezones-parseapi": {
    idKey: "timezone",
    load: () => import("../../../datasets/reference/timezones-parseapi/data.json"),
  },
  "area-codes-parseapi": {
    idKey: "area_code",
    load: () => import("../../../datasets/reference/area-codes-parseapi/data.json"),
  },
} satisfies { [K in DatasetId]: CatalogEntry<K> };

export function isDatasetId(value: unknown): value is DatasetId {
  return typeof value === "string" && Object.hasOwn(catalog, value);
}

export function listDatasetIds(): DatasetId[] {
  return Object.keys(catalog) as DatasetId[];
}
