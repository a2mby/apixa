import { createResourceKeys as createKeys } from "@apixa/internal-shared";
import type { QueryKey } from "@tanstack/react-query";
import type { ResourceKeyFactory } from "./types.js";

export type CreateResourceKeysInput = {
  queryKey: QueryKey;
  scope?: QueryKey;
};

// Typed view over the framework-neutral key algorithm shared with other integrations.
export function createResourceKeys(input: CreateResourceKeysInput): ResourceKeyFactory {
  return createKeys(input);
}
