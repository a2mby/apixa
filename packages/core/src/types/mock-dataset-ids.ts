/**
 * Known `mock` dataset ids for `defineApi` autocomplete.
 * Matches `@apixa/mocking`’s loadable catalog (excludes oversized / non-unique-id sets).
 * Custom ids still type-check via `keyof MockDatasetIds | (string & {})` on `mock`.
 */
export interface MockDatasetIds {
  "users-mock": true;
  "products-mock": true;
  "companies-mock": true;
  "orders-mock": true;
  "posts-mock": true;
  "comments-mock": true;
  "countries-csc": true;
  "countries-mledoze": true;
  "countries-parseapi": true;
  "country-codes-iso": true;
  "cities-capitals": true;
  "currencies-parseapi": true;
  "languages-parseapi": true;
  "timezones-parseapi": true;
  "area-codes-parseapi": true;
}
