import { detectTransferSupport } from "@apixa/core";
import { describe, expect, it } from "vitest";

const stub = (over: Record<string, unknown> = {}) =>
  ({
    Request: globalThis.Request,
    Response: globalThis.Response,
    ReadableStream: globalThis.ReadableStream,
    Blob: globalThis.Blob,
    ...over,
  }) as Parameters<typeof detectTransferSupport>[0];

describe("detectTransferSupport", () => {
  it("reports what this runtime can do from feature probes", () => {
    const support = detectTransferSupport();
    expect(support.streamingUpload).toBe(true);
    expect(support.uploadProgress).toBe(true);
    expect(support.downloadProgress).toBe(true);
    expect(support.streamTransform).toBe(true);
  });

  it("reports nothing when the globals are missing", () => {
    expect(detectTransferSupport({})).toEqual({
      streamingUpload: false,
      uploadProgress: false,
      downloadProgress: false,
      streamTransform: false,
    });
  });

  it("a runtime that does not read `duplex` has no streaming upload", () => {
    class LegacyRequest {
      headers = new Headers();
      constructor(_url: string, init?: { headers?: HeadersInit }) {
        this.headers = new Headers(init?.headers);
      }
    }
    const support = detectTransferSupport(stub({ Request: LegacyRequest }));
    expect(support.streamingUpload).toBe(false);
    expect(support.uploadProgress).toBe(false);
  });

  it("a browser-like runtime (Content-Length forbidden) streams uploads but cannot observe sized bodies", () => {
    class BrowserRequest {
      headers: Headers;
      constructor(_url: string, init?: { headers?: HeadersInit; body?: unknown; duplex?: string }) {
        void init?.duplex;
        const headers = new Headers(init?.headers);
        headers.delete("content-length"); // forbidden request header: silently dropped
        if (typeof init?.body === "string") headers.set("content-type", "text/plain");
        this.headers = headers;
      }
    }
    const support = detectTransferSupport(stub({ Request: BrowserRequest }));
    expect(support.streamingUpload).toBe(true);
    expect(support.uploadProgress).toBe(false);
  });

  it("does not look at the user agent", () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      get() {
        throw new Error("navigator must not be read");
      },
    });
    try {
      expect(() => detectTransferSupport()).not.toThrow();
    } finally {
      if (before) Object.defineProperty(globalThis, "navigator", before);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});
