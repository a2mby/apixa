import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      "@apixa/core": resolve(root, "packages/core/src/index.ts"),
      "@apixa/mocking/data/users-mock": resolve(root, "packages/mocking/src/data/users-mock.ts"),
      "@apixa/mocking/data/users": resolve(root, "packages/mocking/src/data/users.ts"),
      "@apixa/mocking/node": resolve(root, "packages/mocking/src/node.ts"),
      "@apixa/mocking": resolve(root, "packages/mocking/src/index.ts"),
    },
  },
});
