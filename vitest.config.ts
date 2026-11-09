import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    maxWorkers: 2,
    // Most specific first: aliases match by prefix, in order.
    alias: [
      // The `apixa` facade: source entry per public subpath (anchored so `@apixa/*` is unaffected).
      {
        find: /^apixa\/mocking\/datasets\/(.+)$/,
        replacement: resolve(root, "src/mocking/datasets/$1.ts"),
      },
      {
        find: /^apixa\/mocking\/datasets$/,
        replacement: resolve(root, "src/mocking/datasets/index.ts"),
      },
      {
        find: /^apixa\/mocking\/(register|node)$/,
        replacement: resolve(root, "src/mocking/$1.ts"),
      },
      { find: /^apixa\/mocking$/, replacement: resolve(root, "src/mocking/index.ts") },
      { find: /^apixa\/react\/advanced$/, replacement: resolve(root, "src/react/advanced.ts") },
      { find: /^apixa\/react$/, replacement: resolve(root, "src/react/index.ts") },
      { find: /^apixa\/core$/, replacement: resolve(root, "src/core.ts") },
      { find: /^apixa$/, replacement: resolve(root, "src/index.ts") },
      {
        find: /^@apixa\/mocking\/datasets\/(.+)$/,
        replacement: resolve(root, "packages/mocking/src/dataset-modules/$1.ts"),
      },
      { find: "@apixa/core", replacement: resolve(root, "packages/core/src/index.ts") },
      {
        find: "@apixa/internal-shared",
        replacement: resolve(root, "packages/internal/shared/src/index.ts"),
      },
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
        find: "@apixa/react/advanced",
        replacement: resolve(root, "packages/react/src/advanced.ts"),
      },
      {
        find: "@apixa/react",
        replacement: resolve(root, "packages/react/src/index.ts"),
      },
    ],
  },
});
