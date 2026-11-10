import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const temporary = mkdtempSync(join(tmpdir(), "apixa-query-consumers-"));
const pack = join(temporary, "packs");
mkdirSync(pack);
const tarball = join(pack, `apixa-${version}.tgz`);
const builtIndex = readFileSync(join(root, "dist/react/index.js"), "utf8");
const builtAdvanced = readFileSync(join(root, "dist/react/advanced.js"), "utf8");
if (!builtIndex.startsWith('"use client";') || builtAdvanced.startsWith('"use client";')) {
  throw new Error("Query package client/server entry directives are incorrect.");
}

function run(command, args, cwd = root) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

try {
  run("pnpm", ["pack", "--pack-destination", pack]);
  for (const [major, withMocking] of [
    [18, false],
    [19, false],
    [19, true],
  ]) {
    const directory = join(temporary, `react-${major}${withMocking ? "-mocking" : "-standalone"}`);
    mkdirSync(directory);
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            apixa: `file:${tarball}`,
            "@tanstack/react-query": major === 18 ? "5.90.1" : "5.104.4",
            react: major === 18 ? "18.3.1" : "19.1.1",
            "react-dom": major === 18 ? "18.3.1" : "19.1.1",
          },
          devDependencies: {
            "@types/react": major === 18 ? "^18.3.0" : "^19.1.13",
            "@types/react-dom": major === 18 ? "^18.3.0" : "^19.1.9",
            "@types/node": "^22.13.10",
            typescript: "^5.8.2",
            jsdom: "^26.1.0",
            ...(major === 19 ? { next: "15.5.27" } : {}),
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
      `${withMocking ? 'import "apixa/mocking/register";\n' : ""}import { defineApi, getOperationMetadata } from "apixa/core";
import { useResource, useResourceMutation, useResourceQuery } from "apixa/react";
import { createResourceQueryOptions } from "apixa/react/advanced";
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
const optionalArgs = { getAll: async (org?: string) => [org] };
const dynamic: { getAll?: (org: string) => Promise<string[]> } = {};
const noList = { getById: async (id: string) => ({ id }) };
const parameterized = { getAll: async (org: string) => [{ id: org }], getById: async (id: string) => ({ id }) };
function App() {
  // @ts-expect-error required default-query argument
  useResource(parameterized, { queryKey: ["parameterized"] });
  // @ts-expect-error dynamically optional getAll still needs arguments when present
  useResource(dynamic, { queryKey: ["dynamic"] });
  useResource(dynamic, { queryKey: ["dynamic"], query: { args: ["org"] } });
  useResource(optionalArgs, { queryKey: ["optional"] });
  const observed = useResource(noList, { queryKey: ["detail"], query: { operation: "getById", args: ["x"] } });
  const maybeId: string | undefined = observed.data?.id;
  void maybeId;
  const selected = useResource(parameterized, { queryKey: ["parameterized"], query: { operation: "getById", args: ["1"], initialData: { id: "1" }, select: data => data.id } });
  const selectedId: string = selected.data;
  void selectedId;
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
    writeFileSync(
      join(directory, "runtime.mjs"),
      `${withMocking ? 'import "apixa/mocking/register";\n' : ""}${readFileSync(join(root, "scripts/query-consumer-runtime.mjs"), "utf8")}${
        withMocking
          ? `
const { defineApi } = await import("apixa/core");
const mocked = defineApi({ baseURL: "https://example.test", resources: { users: { path: "/users", mock: "users-mock" } } });
assert.ok((await mocked.users.getAll()).length > 0);
console.log("Registered named mock dataset loaded");
`
          : ""
      }`,
    );
    run("pnpm", ["install", "--no-frozen-lockfile"], directory);
    run("pnpm", ["exec", "tsc", "--noEmit"], directory);
    run("node", ["runtime.mjs"], directory);
    // Executed file scenarios (uploads, downloads, progress, cancellation, typed errors, mocks) through
    // the packed hooks on this React version; closes the runtime-coverage gap recorded since v1.3.0.
    writeFileSync(
      join(directory, "file-runtime.mjs"),
      readFileSync(join(root, "scripts/file-consumer-runtime.mjs"), "utf8"),
    );
    execFileSync("node", ["file-runtime.mjs"], {
      cwd: directory,
      stdio: "inherit",
      env: { ...process.env, REACT_MAJOR: String(major) },
    });
    run("pnpm", ["exec", "vite", "build"], directory);
    if (major === 19) {
      mkdirSync(join(directory, "app"));
      writeFileSync(
        join(directory, "app/layout.jsx"),
        "export default function Layout({ children }) { return <html><body>{children}</body></html> }",
      );
      writeFileSync(
        join(directory, "app/client.jsx"),
        '"use client"; import { useResource } from "apixa/react"; import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; const c = new QueryClient(); const r = { getAll: async () => [] }; function View() { const value = useResource(r, { queryKey: ["test"] }); return <span>{value.data?.length ?? 0}</span> } export default function Client() { return <QueryClientProvider client={c}><View /></QueryClientProvider> }',
      );
      writeFileSync(
        join(directory, "app/page.jsx"),
        `${withMocking ? 'import "apixa/mocking/register";\nimport { defineApi } from "apixa/core";\n' : ""}import Client from "./client";\nexport default async function Page() { ${withMocking ? 'const api = defineApi({ baseURL: "https://example.test", resources: { users: { path: "/users", mock: "users-mock" } } }); const users = await api.users.getAll(); if (!users.length) throw new Error("empty mock dataset");' : ""} return <Client /> }`,
      );
      run("pnpm", ["exec", "next", "build"], directory);
    }
    run(
      "node",
      [
        "--input-type=module",
        "-e",
        'import("apixa/react/advanced").then(m => { if (typeof m.createResourceQueryOptions !== "function" || typeof m.ResourceMutationStore !== "function") process.exit(1) })',
      ],
      directory,
    );
    console.log(
      `React ${major} (${withMocking ? "with mocking" : "standalone"}): packed runtime, declarations, and Vite build passed`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
