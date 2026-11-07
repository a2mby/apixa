/**
 * Mocking scenarios for /test/mocking. Every function is a small, real use of the current API;
 * the page only calls them and prints the result. Typechecked with the example.
 */
import { defineApi, resetMock } from "@apixa/core";
import { defineMockApi, loadDataset, MockApiError } from "@apixa/mocking";
import { users as directUsers } from "@apixa/mocking/datasets/users";
import "@apixa/mocking/register"; // once per app: lets `mock: "<dataset-id>"` load named datasets

const BASE_URL = "https://api.example.com/v1";

/** 1 + 2. Inline records: the entity type and the id are inferred from the array. */
export function inlineMock() {
  return defineApi({
    baseURL: BASE_URL,
    resources: {
      pets: {
        path: "/pets",
        mock: [
          { id: "1", name: "Rex", nickname: null as string | null },
          { id: "2", name: "Tom" },
        ],
      },
    },
  });
}

export async function runInline() {
  const api = inlineMock();
  const rex = await api.pets.getById("1"); // { id: string; name: string; nickname?: string | null }
  const created = await api.pets.create({ name: "Mia" }); // id is generated: "3"
  return { rex, created, all: await api.pets.getAll() };
}

/** 3. Direct dataset import: this page's bundle contains the users records and nothing else. */
export function runDirectImport() {
  return { count: directUsers.length, first: directUsers[0] };
}

/** 4. Lazy loading: nothing is downloaded until the call. Reference sets are lazy-only. */
export async function runLazyLoad() {
  const countries = await loadDataset("countries-csc"); // readonly CountryCsc[]
  return { count: countries.length, first: countries[0]?.name };
}

/** 5. Named datasets through Core (needs the register import above). */
export function namedMock() {
  return defineApi({
    baseURL: BASE_URL,
    resources: { products: { path: "/products", mock: "products-mock" } },
  });
}

/** 6. A provider: any function returning records (sync or async). Runs once per client. */
export function providerMock() {
  return defineApi({
    baseURL: BASE_URL,
    resources: {
      tasks: {
        path: "/tasks",
        mock: async () => [
          { id: "t1", title: "Write docs", done: false },
          { id: "t2", title: "Ship", done: false },
        ],
      },
    },
  });
}

/** 7 + 8. Pagination and slice. Filters go under `query`; `slice` caps only the list result. */
export async function runPaginationAndSlice() {
  const api = defineApi({
    baseURL: BASE_URL,
    resources: {
      comments: { path: "/comments", mock: "comments-mock", pagination: "page" },
      top: { path: "/top", mock: "users-mock", slice: 3 },
    },
  });
  const page2 = await api.comments.getAll({ query: { page: 2, pageSize: 5 } });
  const pastTheEnd = await api.comments.getAll({ query: { page: 999 } });
  const filtered = await api.comments.getAll({ query: { postId: "1", pageSize: 2 } });
  return {
    page2: { page: page2.page, total: page2.total, rows: page2.data.length },
    pastTheEnd: { rows: pastTheEnd.data.length, total: pastTheEnd.total },
    filtered: { total: filtered.total, rows: filtered.data.length },
    slice: { listed: (await api.top.getAll()).length, counted: await api.top.count() },
  };
}

/** 9 + 11. CRUD, errors and reset on one request-scoped client. */
export async function runCrudErrorsReset() {
  const api = inlineMock();
  const log: unknown[] = [];
  log.push(await api.pets.update("1", { name: "Rex II" }));
  log.push(await api.pets.patch("2", { name: "Tommy" }));
  await api.pets.delete("1");
  const missing = await api.pets.getById("1").catch((e: unknown) => e);
  log.push({ code: (missing as { code?: string }).code, message: (missing as Error).message });
  resetMock(api);
  log.push({ afterReset: await api.pets.count() });
  return log;
}

/**
 * 10. Custom operations. A declarative operation says what it does on a mocked resource with its
 * own `mock` handler; without one it fails loudly. A function operation uses `ctx.request()`.
 */
export async function runCustomOperations() {
  const api = defineApi({
    baseURL: BASE_URL,
    resources: {
      pets: {
        path: "/pets",
        mock: [
          { id: "1", name: "Rex", vaccinated: false },
          { id: "2", name: "Tom", vaccinated: true },
          { id: "stats", name: "A pet whose id looks like a path", vaccinated: false },
        ],
        operations: {
          // A custom read: `records` is a typed snapshot of this client's pets.
          getVaccinated: {
            kind: "read",
            method: "GET",
            path: "/vaccinated",
            mock: ({ records }) => records.filter((pet) => pet.vaccinated),
          },
          // A custom write: `store` mutates only this client's pets; `params.id` comes from the path.
          vaccinate: {
            kind: "write",
            method: "POST",
            path: "/:id/vaccinate",
            mock: ({ store, params }) => store.patch(params.id, { vaccinated: true }),
          },
          // No handler: on a mock this rejects with MOCK_UNSUPPORTED. It is never read as
          // "getById('stats')" because of its path, and never sent to the network.
          stats: { kind: "read", method: "GET", path: "/stats" },
          // A function operation: `ctx.request()` is simulated against the same store.
          first: {
            kind: "read",
            run: (ctx) => ctx.request<{ id: string }>({ path: "/1" }),
          },
        },
      },
    },
  });
  const before = (await api.pets.getVaccinated()) as Array<{ id: string }>;
  const vaccinated = await api.pets.vaccinate("1");
  const after = (await api.pets.getVaccinated()) as Array<{ id: string }>;
  const stats = await api.pets.stats().catch((e: unknown) => (e as { code?: string }).code);
  return {
    before: before.map((p) => p.id),
    vaccinated,
    after: after.map((p) => p.id),
    stats,
    first: await api.pets.first(),
  };
}

/** Standalone mocks: no `defineApi`, no network. Same list/pagination contract as a Core mock. */
export async function runStandalone() {
  const api = defineMockApi({
    users: "users-mock",
    comments: { type: "comments-mock", pagination: true },
  });
  const page = await api.comments.getAll({ page: 1, pageSize: 3 });
  const error = await defineMockApi({ users: "users-mock" })
    .users.getById("missing")
    .catch((e: unknown) => e);
  return {
    users: (await api.users.getAll()).length,
    page: { total: page.total, rows: page.data.length },
    error: error instanceof MockApiError ? error.code : String(error),
  };
}

/**
 * Isolation: a client built at module scope is shared by every request your server handles.
 * Build one per request (or per test) when the data must not carry over.
 */
const moduleClient = inlineMock();
export async function runIsolation() {
  const shared = await moduleClient.pets.create({ name: "persists" });
  const fresh = inlineMock();
  return { shared: shared.id, sharedCount: await moduleClient.pets.count(), freshCount: await fresh.pets.count() };
}
