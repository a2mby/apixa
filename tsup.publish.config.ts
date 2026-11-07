import { defineConfig } from "tsup";

// Resolve private modules to canonical source through tsconfig.publish.json.
const entries: Record<string, string> = {
  index: "src/index.ts",
  core: "src/core.ts",
  "mocking/index": "src/mocking/index.ts",
  "mocking/register": "src/mocking/register.ts",
  "mocking/node": "src/mocking/node.ts",
  "mocking/datasets/index": "src/mocking/datasets/index.ts",
  "mocking/datasets/users": "src/mocking/datasets/users.ts",
  "mocking/datasets/products": "src/mocking/datasets/products.ts",
  "mocking/datasets/companies": "src/mocking/datasets/companies.ts",
  "mocking/datasets/orders": "src/mocking/datasets/orders.ts",
  "mocking/datasets/posts": "src/mocking/datasets/posts.ts",
  "mocking/datasets/comments": "src/mocking/datasets/comments.ts",
  "react/index": "src/react/index.ts",
  "react/advanced": "src/react/advanced.ts",
};

// One runtime graph: Core classes, React context, stores and QueryClient are shared across entries.
// Declarations are emitted separately, preserving modules and unique-symbol identity.
export default defineConfig({
  entry: entries,
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: false,
  splitting: true,
  clean: true,
  sourcemap: false,
  noExternal: [/^@apixa\//],
  external: ["react", "react/jsx-runtime", "react-dom", /^@tanstack\//, /^node:/],
  esbuildOptions(options) {
    options.chunkNames = "chunks/[name]-[hash]";
  },
});
