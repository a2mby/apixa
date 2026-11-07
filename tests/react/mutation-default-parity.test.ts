import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ResourceMutationStore } from "../../packages/react/src/mutation-store.js";
import { createResourceKeys } from "../../packages/react/src/keys.js";

describe("mutation lifecycle parity", () => {
  for (const scenario of [
    "default",
    "keyed",
    "local",
    "failure",
    "success callback rejection",
  ] as const) {
    it(`matches native callback precedence and error propagation: ${scenario}`, async () => {
      async function run(apixa: boolean) {
        const events: string[] = [];
        const callback =
          (name: string, reject = false) =>
          async () => {
            await Promise.resolve();
            events.push(name);
            if (reject) throw new Error("callback failed");
          };
        const client = new QueryClient({
          defaultOptions: {
            mutations: {
              onSuccess: callback("default success"),
              onError: callback("default error"),
              onSettled: callback("default settled"),
            },
          },
        });
        const key = ["users", "mutation", "create"];
        if (scenario !== "default")
          client.setMutationDefaults(key, {
            onSuccess: callback("keyed success", scenario === "success callback rejection"),
            onError: callback("keyed error"),
            onSettled: callback("keyed settled"),
          });
        const local =
          scenario === "local"
            ? {
                onSuccess: callback("local success"),
                onError: callback("local error"),
                onSettled: callback("local settled"),
              }
            : {};
        const fn = async () => {
          if (scenario === "failure") throw new Error("mutation failed");
          return "ok";
        };
        let invalidations = 0;
        const invalidate = client.invalidateQueries.bind(client);
        client.invalidateQueries = async (...args) => {
          invalidations++;
          events.push("invalidate");
          return invalidate(...args);
        };
        const store = new ResourceMutationStore(
          client,
          { create: fn },
          createResourceKeys({ queryKey: ["users"] }),
          { create: local },
        );
        const native = new MutationObserver(client, { mutationKey: key, mutationFn: fn, ...local });
        let error: string | undefined;
        try {
          await (apixa ? store.run("create", []) : native.mutate(undefined));
        } catch (e) {
          error = (e as Error).message;
        }
        return { events, error, invalidations };
      }
      const native = await run(false);
      const apixa = await run(true);
      expect(apixa.events.filter((event) => event !== "invalidate")).toEqual(native.events);
      expect(apixa.error).toBe(native.error);
      expect(apixa.invalidations).toBe(scenario === "failure" ? 0 : 1);
      if (apixa.invalidations) expect(apixa.events[0]).toBe("invalidate");
    });
  }
});
