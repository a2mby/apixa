import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = (name) =>
  JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8")).version;
const temporary = mkdtempSync(join(tmpdir(), "apixa-query-consumers-"));
const pack = join(temporary, "packs");
mkdirSync(pack);
const coreTarball = join(pack, `apixa-core-${version("core")}.tgz`);
const mockingTarball = join(pack, `apixa-mocking-${version("mocking")}.tgz`);
const queryTarball = join(pack, `apixa-tanstack-query-${version("tanstack-query")}.tgz`);
const builtIndex = readFileSync(join(root, "packages/tanstack-query/dist/index.js"), "utf8");
const builtAdvanced = readFileSync(join(root, "packages/tanstack-query/dist/advanced.js"), "utf8");
if (!builtIndex.startsWith('"use client";') || builtAdvanced.startsWith('"use client";')) {
  throw new Error("Query package client/server entry directives are incorrect.");
}

function run(command, args, cwd = root) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

try {
  run("pnpm", ["--dir", "packages/core", "pack", "--pack-destination", pack]);
  run("pnpm", ["--dir", "packages/mocking", "pack", "--pack-destination", pack]);
  run("pnpm", ["--dir", "packages/tanstack-query", "pack", "--pack-destination", pack]);
  for (const major of [18, 19]) {
    const directory = join(temporary, `react-${major}`);
    mkdirSync(directory);
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          pnpm: { overrides: { "@apixa/core": `file:${coreTarball}` } },
          dependencies: {
            "@apixa/core": `file:${coreTarball}`,
            // Core's optional dynamic dataset import must resolve in a Vite bundle.
            "@apixa/mocking": `file:${mockingTarball}`,
            "@apixa/tanstack-query": `file:${queryTarball}`,
            "@tanstack/react-query": "5.104.4",
            react: major === 18 ? "18.3.1" : "19.3.0",
            "react-dom": major === 18 ? "18.3.1" : "19.3.0",
          },
          devDependencies: {
            "@types/react": major === 18 ? "^18.3.0" : "^19.1.13",
            "@types/react-dom": major === 18 ? "^18.3.0" : "^19.1.9",
            typescript: "^5.8.2",
            vite: "^6.3.5",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(directory, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
            jsx: "react-jsx",
            skipLibCheck: true,
          },
          include: ["src.tsx"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(directory, "index.html"),
      '<div id="root"></div><script type="module" src="/src.tsx"></script>',
    );
    writeFileSync(
      join(directory, "src.tsx"),
      `import { defineApi, getOperationMetadata } from "@apixa/core";
import { useResource, useResourceMutation, useResourceQuery } from "@apixa/tanstack-query";
import { createResourceQueryOptions } from "@apixa/tanstack-query/advanced";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
type User = { id: string; name: string };
const api = defineApi<{ users: { entity: User } }>()({
  baseURL: "https://example.test",
  resources: {
    users: {
      path: "/users",
      operations: {
        stats: { kind: "read", method: "GET", path: "/stats" },
        archive: { kind: "write", run: async (ctx, id: string) => ctx.request<User>({ method: "POST", path: \`/\${id}/archive\` }) },
      },
    },
  },
});
const options = createResourceQueryOptions(api.users, { queryKey: ["users"] });
const client = new QueryClient();
if (getOperationMetadata(api.users)?.stats?.kind !== "read") throw new Error("metadata missing");
function App() {
  const users = useResourceQuery(api.users, {
    queryKey: ["users"], enabled: false, select: (data) => data.map((user) => user.name),
  });
  const names: string[] | undefined = users.data;
  const writes = useResourceMutation(api.users, {
    queryKey: ["users"],
    mutations: { create: { retry: 1 }, ping: { mutationFn: async (n: number) => n * 2 } },
  });
  const all = useResource(api.users, { queryKey: ["users"], query: { enabled: false } });
  const archived: Promise<User> = all.archive("1");
  const doubled: Promise<number> = writes.ping(2);
  void archived.catch(() => undefined);
  void doubled;
  const pending: boolean = all.states.create.isPending || writes.states.ping.isPending;
  return <p>{names?.join(",") ?? String(options.queryKey.length)}{String(pending)}</p>;
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><App /></QueryClientProvider>,
);
`,
    );
    run("pnpm", ["install", "--no-frozen-lockfile"], directory);
    run("pnpm", ["exec", "tsc", "--noEmit"], directory);
    run("pnpm", ["exec", "vite", "build"], directory);
    run(
      "node",
      [
        "--input-type=module",
        "-e",
        'import("@apixa/tanstack-query/advanced").then(m => { if (typeof m.createResourceQueryOptions !== "function" || typeof m.ResourceMutationStore !== "function") process.exit(1) })',
      ],
      directory,
    );
    console.log(`React ${major}: packed ESM, declarations, and Vite build passed`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
