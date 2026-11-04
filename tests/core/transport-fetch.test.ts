import { createFetchTransport, defineApi, isApiError } from "@apixa/core";
import { describe, expect, it } from "vitest";

function fetchImplReturning(body: string, contentType = "application/json"): typeof fetch {
  return (async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": contentType },
    })) as unknown as typeof fetch;
}

describe("createFetchTransport — response parsing", () => {
  it("throws ParseError (not a silent 200/null) for a malformed JSON body", async () => {
    const transport = createFetchTransport(fetchImplReturning("{not valid json"));

    await expect(
      transport.request({
        url: "https://api.example.com/users",
        method: "GET",
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({ name: "ParseError", code: "PARSE" });
  });

  it("propagates ParseError through the full defineApi request pipeline", async () => {
    const api = defineApi({
      baseURL: "https://api.example.com",
      transport: createFetchTransport(fetchImplReturning("{not valid json")),
      resources: {
        users: { path: "/users" },
      },
    });

    const error = await api.users.getAll().catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect((error as { code?: string }).code).toBe("PARSE");
    expect((error as { name?: string }).name).toBe("ParseError");
  });

  it("still parses a well-formed JSON body normally", async () => {
    const transport = createFetchTransport(fetchImplReturning('[{"id":"1"}]'));

    const response = await transport.request({
      url: "https://api.example.com/users",
      method: "GET",
      headers: new Headers(),
    });
    expect(response.body).toEqual([{ id: "1" }]);
  });

  it("falls back to raw text when content-type is ambiguous and the body isn't JSON", async () => {
    // No declared content-type: Apixa can't assume the body was meant to be JSON, so a parse
    // failure here falls back to the raw text rather than throwing — unlike a server that
    // explicitly declares `application/json` and then sends something broken.
    const transport = createFetchTransport(fetchImplReturning("plain text, not json", ""));

    const response = await transport.request({
      url: "https://api.example.com/users",
      method: "GET",
      headers: new Headers(),
    });
    expect(response.body).toBe("plain text, not json");
  });
});
