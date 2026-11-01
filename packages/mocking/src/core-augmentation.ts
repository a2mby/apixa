/**
 * Plugin seam retained for side-effect imports of `@apixa/mocking`.
 * `mock` / `slice` / `pagination` types and known dataset ids ship on Core
 * (`ResourceExtensions` / `MockDatasetIds`) so defineApi call sites need no
 * mocking import for autocomplete.
 */
export {};
