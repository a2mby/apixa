import { AbortError, ValidationError, defineApi } from "@apixa/core";
import { describe, expect, it } from "vitest";
import { collector } from "../helpers/transfer.js";
import { file, petApi, recordingTransport, rejection } from "../helpers/validation.js";

const rules = { fileFields: { photo: { maxSize: 10 }, docs: { max: 1 } } };

describe("the validation checkpoint", () => {
  it("rejects before any transport call, any event and any retry", async () => {
    const { api, calls } = petApi("live", { resource: rules });
    const c = collector();
    const error = await rejection(
      api.pets.create(
        { photo: file(50) },
        { retry: { retries: 3, baseDelayMs: 0, methods: ["POST"] }, onTransfer: c.observer },
      ),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).retryable).toBe(false);
    expect(calls).toHaveLength(0);
    expect(c.events).toEqual([]);
  });

  it("covers builtin, custom declarative and function operations (ctx.request)", async () => {
    const { api, calls } = petApi("live", { resource: rules });
    for (const call of [
      () => api.pets.create({ photo: file(50) }),
      () => api.pets.upload({ photo: file(50) }),
      () => api.pets.viaCtx({ photo: file(50) }),
    ]) {
      expect(await rejection(call())).toBeInstanceOf(ValidationError);
    }
    expect(calls).toHaveLength(0);
    await expect(api.pets.viaCtx({ photo: file(5) })).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("runs after request middleware: a file added by middleware is validated", async () => {
    const { api, calls } = petApi("live", {
      resource: {
        ...rules,
        requestMiddleware: [
          (request: { body: unknown }) => ({ ...request, body: { photo: file(50) } }),
        ],
      },
    });
    expect(await rejection(api.pets.create({ name: "innocent" }))).toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("runs after request key transforms: rules use the wire names", async () => {
    const { api } = petApi("live", {
      resource: {
        fileFields: { profilePhoto: { maxSize: 10 } },
        transforms: { request: { keys: "snake_case" } },
      },
    });
    const error = (await rejection(api.pets.create({ profilePhoto: file(50) }))) as ValidationError;
    expect(error.violations[0]).toMatchObject({ code: "FILE_TOO_LARGE", path: "$.profile_photo" });
  });

  it("error middleware receives the ValidationError and can recover or replay", async () => {
    let seen: unknown;
    const { api, calls } = petApi("live", {
      resource: {
        ...rules,
        middleware: {
          onError: (error: unknown) => {
            seen = error;
            return { recovered: true };
          },
        },
      },
    });
    await expect(api.pets.create({ photo: file(50) })).resolves.toEqual({ recovered: true });
    expect(seen).toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("replay() re-validates the whole call", async () => {
    let attempts = 0;
    const { api } = petApi("live", {
      resource: {
        ...rules,
        middleware: {
          onError: async (_e: unknown, ctx: { replay?: () => Promise<unknown> }) => {
            attempts++;
            return ctx.replay ? ctx.replay() : undefined;
          },
        },
      },
    });
    expect(await rejection(api.pets.create({ photo: file(50) }))).toBeInstanceOf(ValidationError);
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it("an already-aborted signal wins over validation", async () => {
    const { api } = petApi("live", { resource: rules });
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(
      api.pets.create({ photo: file(50) }, { signal: controller.signal }),
    );
    expect(error).toBeInstanceOf(AbortError);
  });

  it("valid calls are unaffected, retries included", async () => {
    let n = 0;
    const transport = recordingTransport();
    const original = transport.request.bind(transport);
    transport.request = async (input) => {
      const r = await original(input);
      return ++n === 1 ? { ...r, status: 503, body: null } : r;
    };
    const api = defineApi<{ pets: { path: "/pets"; entity: { id: string } } }>()({
      baseURL: "https://api.example.com",
      transport,
      resources: { pets: { path: "/pets", fileFields: { photo: { maxSize: 10 } } } },
    } as never) as never as { pets: { create(b: unknown, o?: object): Promise<unknown> } };
    await api.pets.create(
      { photo: file(5) },
      { retry: { retries: 2, baseDelayMs: 0, methods: ["POST"] } },
    );
    expect(n).toBe(2);
  });

  it("non-file bodies pass through untouched: JSON, null, undefined, strings, URLSearchParams", async () => {
    const { api, calls } = petApi("live", {
      resource: { ...rules, fileLimits: { maxTotalSize: 5 } },
    });
    await api.pets.upload({ big: "x".repeat(10_000), n: 1, list: [1, 2] });
    await api.pets.upload(null);
    await api.pets.upload(undefined);
    expect(calls).toHaveLength(3);
  });

  it("raw bodies are limited by maxBodySize / maxTotalSize only: field rules never apply to them", async () => {
    const { api, calls } = petApi("live", {
      resource: {
        fileFields: { photo: { accept: ["application/pdf"], minSize: 100 } },
        fileLimits: { maxBodySize: 50 },
      },
    });
    await api.pets.upload(new Blob([new Uint8Array(40)], { type: "image/png" })); // no field: field rules do not apply
    expect(calls).toHaveLength(1);
    expect(await rejection(api.pets.upload(new Blob([new Uint8Array(60)])))).toBeInstanceOf(
      ValidationError,
    );
  });
});
