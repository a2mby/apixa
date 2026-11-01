/**
 * Plugin seam retained for side-effect imports of `@apixa/mocking`.
 * `mock` / `slice` / `mockConfig` types now ship on Core's `ResourceExtensions`
 * so defineApi call sites need no mocking import for autocomplete.
 * Dataset modules still merge ids into `MockDatasetIds`.
 */
export {};
