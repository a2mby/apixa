import assert from "node:assert/strict";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import {
  createResourceKeys,
  ResourceMutationStore,
} from "../packages/tanstack-query/dist/advanced.js";

for (const rejecting of ["onError", "onSettled"]) {
  async function run(apixa) {
    const events = [];
    const unhandled = [];
    const listener = (error) => {
      unhandled.push(error.message);
    };
    process.on("unhandledRejection", listener);
    const client = new QueryClient();
    const key = ["items", "mutation", "create"];
    const fail = async () => {
      throw new Error("mutation failed");
    };
    const callbacks = {
      onError: async () => {
        events.push("error");
        if (rejecting === "onError") throw new Error("onError failed");
      },
      onSettled: async () => {
        events.push("settled");
        if (rejecting === "onSettled") throw new Error("onSettled failed");
      },
    };
    client.setMutationDefaults(key, callbacks);
    let invalidations = 0;
    client.invalidateQueries = async () => {
      invalidations++;
    };
    const store = new ResourceMutationStore(
      client,
      { create: fail },
      createResourceKeys({ queryKey: ["items"] }),
      {},
    );
    const native = new MutationObserver(client, { mutationKey: key, mutationFn: fail });
    let error;
    try {
      await (apixa ? store.run("create", []) : native.mutate(undefined));
    } catch (cause) {
      error = cause.message;
    }
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", listener);
    client.clear();
    return { events, unhandled, error, invalidations };
  }
  const native = await run(false);
  const apixa = await run(true);
  assert.deepEqual(apixa, native);
  assert.equal(apixa.error, "mutation failed");
  assert.equal(apixa.invalidations, 0);
  assert.deepEqual(apixa.events, ["error", "settled"]);
  assert.deepEqual(apixa.unhandled, [`${rejecting} failed`]);
  console.log(`${rejecting} rejection matches native MutationObserver`);
}

async function settledAfterSuccess(apixa) {
  const events = [];
  const client = new QueryClient();
  let invalidations = 0;
  client.invalidateQueries = async () => {
    invalidations++;
  };
  const key = ["items", "mutation", "create"];
  client.setMutationDefaults(key, {
    onError: async () => {
      events.push("error");
    },
    onSettled: async (data) => {
      events.push(data === undefined ? "settled error" : "settled success");
      if (data !== undefined) throw new Error("settled failed");
    },
  });
  const run = async () => "ok";
  const store = new ResourceMutationStore(
    client,
    { create: run },
    createResourceKeys({ queryKey: ["items"] }),
    {},
  );
  const native = new MutationObserver(client, { mutationKey: key, mutationFn: run });
  let error;
  try {
    await (apixa ? store.run("create", []) : native.mutate(undefined));
  } catch (cause) {
    error = cause.message;
  }
  client.clear();
  return { events, error, invalidations };
}
const settledNative = await settledAfterSuccess(false);
const settledApixa = await settledAfterSuccess(true);
assert.deepEqual(settledApixa.events, settledNative.events);
assert.equal(settledApixa.error, settledNative.error);
assert.equal(settledApixa.invalidations, 1);
assert.deepEqual(settledApixa.events, ["settled success", "error", "settled error"]);
console.log(
  "onSettled rejection after success matches native MutationObserver and invalidates once",
);
