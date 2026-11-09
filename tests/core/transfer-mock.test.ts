import { MockError, defineApi, resetMock, type Transport } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { collector } from "../helpers/transfer.js";

const forbidden: Transport = {
  request() {
    throw new Error("a mocked operation reached the transport");
  },
};

type Doc = { id: string; name: string };

function makeApi() {
  return defineApi<{ docs: { path: "/docs"; entity: Doc } }>()({
    baseURL: "https://api.example.com",
    transport: forbidden,
    resources: {
      docs: {
        path: "/docs",
        mock: [{ id: "1", name: "Seed" }],
        operations: {
          blob: {
            kind: "read",
            method: "GET",
            path: "/blob",
            responseType: "blob",
            mock: () => new Blob([new Uint8Array(10)], { type: "application/pdf" }),
          },
          buf: {
            kind: "read",
            method: "GET",
            path: "/buf",
            responseType: "arrayBuffer",
            mock: () => new Uint8Array(6),
          },
          text: {
            kind: "read",
            method: "GET",
            path: "/text",
            responseType: "text",
            mock: () => "héllo",
          },
          json: { kind: "read", method: "GET", path: "/json", mock: () => ({ a: 1 }) },
          feed: {
            kind: "read",
            method: "GET",
            path: "/feed",
            responseType: "stream",
            mock: () => "x",
          },
          up: {
            kind: "write",
            method: "POST",
            path: "/up",
            responseType: "text",
            mock: () => "ok",
          },
        },
      },
    },
  } as never) as never as {
    docs: Record<string, (...args: unknown[]) => Promise<unknown>>;
  };
}

describe("mocked transfers", () => {
  it("binary and text results report their real size: start, one progress, complete; never the network", async () => {
    for (const [op, size] of [
      ["blob", 10],
      ["buf", 6],
      ["text", 6],
    ] as const) {
      const c = collector();
      await makeApi().docs[op]!({ onTransfer: c.observer });
      expect(c.phases(), op).toEqual(["download:start", "download:progress", "download:complete"]);
      expect(c.events.at(-1), op).toMatchObject({ loaded: size, total: size, attempt: 0 });
    }
  });

  it("a mocked JSON result has no wire size: unsupported, no invented bytes", async () => {
    const c = collector();
    await makeApi().docs.json!({ onTransfer: c.observer });
    expect(c.events).toEqual([
      expect.objectContaining({ phase: "unsupported", direction: "download" }),
    ]);
  });

  it("a mocked request body is not a transfer: upload is unsupported", async () => {
    const c = collector();
    await makeApi().docs.up!(new Blob([new Uint8Array(5)]), { onTransfer: c.observer });
    expect(c.of("upload")).toEqual([
      expect.objectContaining({ phase: "unsupported", direction: "upload" }),
    ]);
  });

  it("mocked stream stays MOCK_UNSUPPORTED and emits nothing", async () => {
    const c = collector();
    const error = await makeApi().docs.feed!({ onTransfer: c.observer }).catch((e) => e);
    expect(error).toBeInstanceOf(MockError);
    expect((error as MockError).code).toBe("MOCK_UNSUPPORTED");
    expect(c.events).toEqual([]);
  });

  it("without onTransfer a mock call behaves as before, and reset still works", async () => {
    const api = makeApi();
    expect(((await api.docs.blob!()) as Blob).size).toBe(10);
    resetMock(api as never);
    expect(((await api.docs.blob!()) as Blob).size).toBe(10);
  });
});
