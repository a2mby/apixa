import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResource, useResourceMutation, useResourceQuery } from "@apixa/tanstack-query";
import { createResourceQueryOptions } from "@apixa/tanstack-query/advanced";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const calls = [];
let resolveMutation;
const resource = {
  getAll: async () => [{ id: "1" }],
  getById: async (id) => ({ id }),
  create: async (value) =>
    value === "slow"
      ? new Promise((resolve) => {
          resolveMutation = resolve;
        })
      : value,
};
const options = createResourceQueryOptions(resource, { queryKey: ["direct"] });
assert.deepEqual(await client.fetchQuery(options), [{ id: "1" }]);
client.setMutationDefaults(["users", "mutation", "create"], {
  onSuccess: async () => {
    calls.push("default");
  },
});
const originalInvalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = async (...args) => {
  calls.push("invalidate");
  return originalInvalidate(...args);
};
let surface;
let renders = 0;
let currentResource = resource;
let currentClient = client;
let local = false;
function App() {
  renders++;
  const query = useResourceQuery(currentResource, { queryKey: ["query"] });
  const mutation = useResourceMutation(currentResource, {
    queryKey: ["users"],
    mutations: {
      create: local
        ? {
            onSuccess: async () => {
              calls.push("local");
            },
          }
        : {},
    },
  });
  const all = useResource(currentResource, { queryKey: ["all"] });
  surface = { query, mutation, all };
  return React.createElement("div", null, String(query.data?.length), String(all.data?.length));
}
const root = createRoot(document.getElementById("root"));
const render = () =>
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(
        QueryClientProvider,
        { client: currentClient, key: currentClient === client ? "first" : "replacement" },
        React.createElement(App),
      ),
    ),
  );
await act(async () => {
  render();
  await pause();
});
await act(async () => {
  await pause();
});
assert.equal(surface.query.data[0].id, "1");
assert.equal(surface.all.data[0].id, "1");
assert.deepEqual(await surface.all.getById("42"), { id: "42" });
await act(async () => {
  assert.equal(await surface.mutation.create("first"), "first");
});
assert.deepEqual(calls.slice(-2), ["invalidate", "default"]);
local = true;
await act(async () => {
  render();
});
await act(async () => {
  assert.equal(await surface.mutation.create("second"), "second");
});
assert.deepEqual(calls.slice(-2), ["invalidate", "local"]);
let pending;
await act(async () => {
  pending = surface.mutation.create("slow");
  await pause();
});
await act(async () => {
  assert.equal(await surface.mutation.create("fast"), "fast");
});
assert.equal(surface.mutation.states.create.data, "fast");
await act(async () => {
  resolveMutation("slow-result");
  await pending;
});
assert.equal(surface.mutation.states.create.data, "fast");
const replacement = { ...resource, getAll: async () => [{ id: "replacement" }] };
currentResource = replacement;
await act(async () => {
  render();
});
await act(async () => {
  await Promise.all([surface.query.refetch(), surface.all.refetch()]);
  await pause();
});
assert.equal(surface.query.data[0].id, "replacement");
assert.equal(surface.all.data[0].id, "replacement");
currentClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
await act(async () => {
  render();
  await pause();
});
await act(async () => {
  await pause();
});
assert.equal(surface.query.data[0].id, "replacement");
assert.equal(surface.all.data[0].id, "replacement");
await act(async () => {
  pending = surface.mutation.create("slow");
  await pause();
});
await act(async () => {
  root.unmount();
});
resolveMutation("unmounted");
assert.equal(await pending, "unmounted");
assert.ok(renders < 40, `unexpected render count ${renders}`);
client.clear();
currentClient.clear();
dom.window.close();
console.log(
  `React ${React.version}: runtime hooks, Strict Mode, replacements, callbacks and concurrent/unmounted mutations passed`,
);
