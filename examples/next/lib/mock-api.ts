import { defineMockApi } from "@apixa/mocking";

/**
 * Standalone mock API: in-memory, seeded from local datasets.
 * No network requests and no `defineApi()` — separate from `api.ts`, they share no state.
 */
export const mockApi = defineMockApi({
  users: { type: "users-mock", pagination: true },
  products: { type: "products-mock", slice: 50 },
});

// await mockApi.users.getAll({ page: 1, pageSize: 10 }); // { data, total, page, pageSize }
// await mockApi.products.create({ title: "Lamp", description: "…", price: 9, brand: "B", category: "home", stock: 3 });
