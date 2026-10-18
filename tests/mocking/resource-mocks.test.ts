import {
  clearDefineApiProcessors,
  createFetchTransport,
  defineApi,
  type Transport,
  type TransportRequest,
} from "@apixa/core";
import {
  clearDatasetPresets,
  disableResourceMocks,
  enableResourceMocks,
  registerDatasetPreset,
} from "@apixa/mocking";
import { dataset as usersSample } from "@apixa/mocking/data/users";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function createRecordingTransport(hits: TransportRequest[]): Transport {
  const inner = createFetchTransport(async () => {
    throw new Error("network should not be called for mocked paths");
  });
  return {
    async request(input) {
      hits.push(input);
      return inner.request(input);
    },
  };
}

describe("resource-level mocking (processor)", () => {
  beforeEach(() => {
    clearDefineApiProcessors();
    clearDatasetPresets();
    registerDatasetPreset("users-sample", usersSample);
    enableResourceMocks();
  });

  afterEach(() => {
    disableResourceMocks();
    clearDefineApiProcessors();
    clearDatasetPresets();
  });

  it("never sends mocked resource requests to the network transport", async () => {
    const hits: TransportRequest[] = [];
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createRecordingTransport(hits),
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-sample" },
      },
    });

    const users = await api.users.getAll();
    expect(hits).toHaveLength(0);
    expect(users).toEqual(usersSample.records);
  });

  it("forwards non-mocked resources to the real transport", async () => {
    const hits: TransportRequest[] = [];
    const fallback: Transport = {
      async request(input) {
        hits.push(input);
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          raw: new Response(JSON.stringify([{ id: "p1" }]), { status: 200 }),
          body: [{ id: "p1" }],
        };
      },
    };

    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: fallback,
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-sample" },
      },
      payments: {
        path: "/payments",
      },
    });

    await api.users.getAll();
    const payments = await api.payments.getAll();
    expect(hits).toHaveLength(1);
    expect(hits[0]!.url).toContain("/payments");
    expect(payments).toEqual([{ id: "p1" }]);
  });

  it("persists CRUD mutations in memory", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-sample" },
      },
    });

    const created = await api.users.create({ name: "Alan", email: "alan@example.com" });
    expect(created).toMatchObject({ name: "Alan" });
    expect(created).toHaveProperty("id");

    const id = String((created as { id: string }).id);
    const updated = await api.users.update(id, { name: "Alan Turing" });
    expect(updated).toMatchObject({ name: "Alan Turing" });

    await api.users.delete(id);
    await expect(api.users.getByID(id)).rejects.toThrow();
  });

  it("applies size then pagination envelope", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "users-sample", size: 2, pagination: true },
      },
    });

    const page = (await api.users.getAll({
      query: { page: 1, pageSize: 1 },
    })) as unknown as {
      data: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };

    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(1);
    expect(page.data).toHaveLength(1);
  });

  it("fails fast when mock:true without mockConfig.type", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        users: {
          path: "/users",
          mock: true,
        },
      }),
    ).toThrow(/mockConfig.type/);
  });

  it("fails fast for unknown mockConfig.type", () => {
    expect(() =>
      defineApi({
        baseURL: "https://api.example.com",
        users: {
          path: "/users",
          mock: true,
          mockConfig: { type: "no-such-dataset" },
        },
      }),
    ).toThrow(/Unknown mockConfig.type/);
  });
});

describe("resource-level mocking (deferred peer when processor off)", () => {
  beforeEach(() => {
    disableResourceMocks();
    clearDefineApiProcessors();
    clearDatasetPresets();
  });

  afterEach(() => {
    disableResourceMocks();
    clearDefineApiProcessors();
    clearDatasetPresets();
  });

  it("rejects unknown mockConfig.type on first request via the peer", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      users: {
        path: "/users",
        mock: true,
        mockConfig: { type: "no-such-dataset" },
      },
    });

    await expect(api.users.getAll()).rejects.toThrow(/Unknown mockConfig.type/);
  });
});
