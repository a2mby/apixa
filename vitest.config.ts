import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Most specific first: aliases match by prefix, in order.
    alias: [
      {
        find: /^@apixa\/mocking\/datasets\/(.+)$/,
        replacement: resolve(root, "packages/mocking/src/dataset-modules/$1.ts"),
      },
      { find: "@apixa/core", replacement: resolve(root, "packages/core/src/index.ts") },
      {
        find: "@apixa/mocking/register",
        replacement: resolve(root, "packages/mocking/src/register.ts"),
      },
      { find: "@apixa/mocking/node", replacement: resolve(root, "packages/mocking/src/node.ts") },
      {
        find: "@apixa/mocking/datasets",
        replacement: resolve(root, "packages/mocking/src/datasets.ts"),
      },
      { find: "@apixa/mocking", replacement: resolve(root, "packages/mocking/src/index.ts") },
      {
        find: "@apixa/tanstack-query/advanced",
        replacement: resolve(root, "packages/tanstack-query/src/advanced.ts"),
      },
      {
        find: "@apixa/tanstack-query",
        replacement: resolve(root, "packages/tanstack-query/src/index.ts"),
      },
    ],
  },
});
