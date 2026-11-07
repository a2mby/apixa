import { defineConfig } from "tsup";

// The `apixa` facade is re-exports only. Every `@apixa/*` package, React and TanStack Query stay
// external, so `apixa/*` and `@apixa/*` resolve to the same module instances at runtime. Nothing
// from Core, Mocking or React is bundled here.
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

// One build per entry. A single multi-entry declaration build makes the declaration bundler add a
// side-effect `import "@apixa/react"` for every external to every entry, so `apixa/core`'s types
// would mention React. Separate builds keep each entry's declarations to what it re-exports.
// `pnpm build:package` empties `dist` first.
export default defineConfig(
  Object.entries(entries).map(([name, file]) => ({
    entry: { [name]: file },
    format: "esm" as const,
    target: "es2022",
    dts: true,
    splitting: false,
    clean: false,
    external: [/^@apixa\//, "react", "react-dom", /^@tanstack\//],
  })),
);
