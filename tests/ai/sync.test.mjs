import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  mkdir,
  rm,
  lstat,
  symlink,
  readdir,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { synchronize, frontmatter, digest } from "../../.ai/scripts/sync.mjs";
import * as prettier from "prettier";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const legacy = JSON.parse(
  await readFile(new URL("./fixtures/legacy.json", import.meta.url), "utf8"),
);
const read = (root, path) => readFile(resolve(root, path), "utf8");
async function put(root, path, content) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), content);
}
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "apixa-ai-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(resolve(repo, ".ai"), resolve(root, ".ai"), { recursive: true });
  await cp(resolve(repo, ".agents"), resolve(root, ".agents"), { recursive: true });
  await rm(resolve(root, ".ai/generated.json"));
  return root;
}
async function snapshot(root) {
  const result = {};
  async function visit(path = "") {
    for (const name of (await readdir(resolve(root, path))).sort()) {
      const file = path ? `${path}/${name}` : name;
      const info = await lstat(resolve(root, file));
      if (info.isDirectory()) await visit(file);
      else
        result[file] = [
          info.isSymbolicLink() ? "link" : digest(await readFile(resolve(root, file))),
          info.mtimeMs,
          info.mode,
        ];
    }
  }
  await visit();
  return result;
}
function migrated(text) {
  text = text
    .replaceAll(".cursor/rules/*.mdc", ".ai/rules/*.md")
    .replaceAll("scripts/sync-agent-rules.sh", "pnpm ai:sync")
    .replaceAll(".cursor/rules/apixa-*.mdc", ".ai/rules/apixa-*.md")
    .replaceAll(".cursor/rules/apixa-core.mdc", ".ai/rules/apixa-core.md")
    .replaceAll("](../../tests/)", "](../../../tests/)");
  for (const [from, to] of [
    ["examples/query-ssr-next", "examples/frontends/query-ssr-next"],
    ["examples/laravel-backend", "examples/backends/laravel-backend"],
    ["examples/react-native", "examples/frontends/react-native"],
    ["examples/react-vite", "examples/frontends/react-vite"],
    ["examples/vanilla", "examples/frontends/vanilla"],
    ["examples/angular", "examples/frontends/angular"],
    ["examples/next", "examples/frontends/next"],
    ["examples/vue", "examples/frontends/vue"],
    ["examples/basic", "examples/frontends/basic"],
  ])
    text = text.replaceAll(from, to);
  for (const name of [
    "plan-change",
    "implement-version",
    "start-version",
    "git-push",
    "check-structure",
    "ship-changes",
  ])
    text = text.replaceAll(`.cursor/commands/${name}.md`, `.agents/skills/${name}/SKILL.md`);
  return text;
}
// Whitespace-only formatting is permitted; every original policy token must survive.
const tokens = (text) => text.replace(/\s+/g, " ").trim();

test("every original command, skill and rule body survives with only explicit path relocations", async () => {
  for (const [path, source] of Object.entries(legacy)) {
    if (path.startsWith(".cursor/commands/")) {
      const name = path.split("/").at(-1).slice(0, -3);
      const actual = frontmatter(await read(repo, `.agents/skills/${name}/SKILL.md`));
      const original = frontmatter(source);
      assert.equal(actual.metadata.name, name);
      assert.equal(actual.metadata.description, original.metadata.description);
      assert.equal(
        tokens(actual.body),
        tokens(await prettier.format(migrated(original.body), { parser: "markdown" })),
        path,
      );
    } else if (path.startsWith(".cursor/rules/")) {
      const actual = frontmatter(
        await read(repo, `.ai/rules/${path.split("/").at(-1).replace(".mdc", ".md")}`),
      );
      const original = frontmatter(source);
      assert.deepEqual(actual.metadata, original.metadata, path);
      assert.equal(
        tokens(actual.body),
        tokens(await prettier.format(migrated(original.body), { parser: "markdown" })),
        path,
      );
    } else if (path === ".cursor/skills/apixa-workflow/SKILL.md") {
      const actual = frontmatter(await read(repo, ".agents/skills/apixa-workflow/SKILL.md"));
      assert.equal(
        tokens(actual.body),
        tokens(await prettier.format(migrated(frontmatter(source).body), { parser: "markdown" })),
      );
    }
  }
  const graph = frontmatter(await read(repo, ".ai/rules/graphify.md")).body;
  assert.equal(
    tokens(graph),
    tokens("## graphify\n" + legacy["AGENTS.md"].split("\n## graphify\n")[1]),
  );
  for (const line of legacy["CLAUDE.md"].split("\n").filter((line) => line.startsWith("- ")))
    assert.ok(graph.includes(line), line);
});

test("all canonical and generated skill metadata is valid YAML and names match discovery directories", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  for (const name of await readdir(resolve(root, ".agents/skills"))) {
    for (const base of [".agents/skills", ".claude/skills"]) {
      const text = await read(root, `${base}/${name}/SKILL.md`);
      const definition = frontmatter(text);
      assert.equal(definition.metadata.name, name);
      assert.ok(definition.metadata.description);
      // Independent YAML syntax validation using the existing formatter, not the sync parser.
      await prettier.format(text.split("---")[1], { parser: "yaml" });
    }
  }
});

test("provider paths, wrappers and role definitions resolve to real canonical instructions", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  assert.equal((await lstat(resolve(root, ".agents/skills"))).isSymbolicLink(), false);
  for (const name of await readdir(resolve(root, ".agents/skills"))) {
    const path = `.agents/skills/${name}/SKILL.md`;
    for (const target of [
      `.cursor/commands/${name}.md`,
      `.gemini/commands/${name}.toml`,
      `.opencode/commands/${name}.md`,
    ])
      assert.ok((await read(root, target)).includes(path));
    assert.equal(await read(root, `.claude/skills/${name}/SKILL.md`), await read(root, path));
  }
  assert.ok((await read(root, "CLAUDE.md")).includes("@AGENTS.md"));
  assert.ok((await read(root, "GEMINI.md")).includes("@AGENTS.md"));
  for (const name of ["architect", "implementer", "reviewer", "tester"]) {
    const body = frontmatter(await read(root, `.ai/agents/${name}.md`)).body;
    assert.ok((await read(root, `.claude/agents/${name}.md`)).includes(body));
    assert.ok((await read(root, `.opencode/agents/${name}.md`)).includes(body));
    const codex = await read(root, `.codex/agents/${name}.toml`);
    const prompt = JSON.parse(codex.split("developer_instructions = ")[1]);
    assert.ok(prompt.includes(body));
    assert.ok(
      (await read(root, `.gemini/commands/role-${name}.toml`)).includes(`.ai/agents/${name}.md`),
    );
  }
});

test("canonical edits and new skills propagate with supporting files and executable modes", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  const skill = ".agents/skills/git-push/SKILL.md";
  await put(root, skill, (await read(root, skill)) + "\nExtra canonical requirement.\n");
  await put(
    root,
    ".agents/skills/new-workflow/SKILL.md",
    '---\nname: new-workflow\ndescription: "Perform a new workflow"\n---\nRead scripts/helper.sh and references/info.md.\n',
  );
  await put(root, ".agents/skills/new-workflow/scripts/helper.sh", "#!/bin/sh\nexit 0\n");
  await chmod(resolve(root, ".agents/skills/new-workflow/scripts/helper.sh"), 0o755);
  await put(
    root,
    ".agents/skills/new-workflow/references/info.md",
    "Complete supporting instructions.\n",
  );
  await synchronize(root);
  assert.ok(
    (await read(root, ".claude/skills/git-push/SKILL.md")).includes("Extra canonical requirement."),
  );
  for (const path of [
    ".cursor/commands/new-workflow.md",
    ".gemini/commands/new-workflow.toml",
    ".opencode/commands/new-workflow.md",
  ])
    assert.ok((await read(root, path)).includes(".agents/skills/new-workflow/SKILL.md"));
  assert.equal(
    await read(root, ".claude/skills/new-workflow/references/info.md"),
    "Complete supporting instructions.\n",
  );
  assert.equal(
    (await lstat(resolve(root, ".claude/skills/new-workflow/scripts/helper.sh"))).mode & 0o777,
    0o755,
  );
  await synchronize(root, { check: true });
});

test("second sync and ai:check change no contents, modes or mtimes", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  const before = await snapshot(root);
  assert.equal((await synchronize(root)).changes.length, 0);
  await synchronize(root, { check: true });
  assert.deepEqual(await snapshot(root), before);
});

test("check detects stale adapters without writing and sync repairs missing outputs", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  await rm(resolve(root, ".cursor/commands/git-push.md"));
  const before = await snapshot(root);
  await assert.rejects(synchronize(root, { check: true }), /stale/);
  assert.deepEqual(await snapshot(root), before);
  await synchronize(root);
  await synchronize(root, { check: true });
});

test("check detects stale canonical content and sync distributes it", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  const file = ".ai/rules/apixa-docs.md";
  await put(root, file, (await read(root, file)) + "\nAdditional scoped requirement.\n");
  const before = await snapshot(root);
  await assert.rejects(synchronize(root, { check: true }), /stale/);
  assert.deepEqual(await snapshot(root), before);
  await synchronize(root);
  assert.ok(
    (await read(root, ".cursor/rules/apixa-docs.mdc")).includes("Additional scoped requirement."),
  );
  assert.ok(!(await read(root, "AGENTS.md")).includes("Additional scoped requirement."));
});

test("native settings, permissions, hooks, MCP and unrelated files remain byte-for-byte intact", async (t) => {
  const root = await fixture(t);
  const native = {
    ".claude/settings.json": legacy[".claude/settings.json"],
    ".codex/hooks.json": legacy[".codex/hooks.json"],
    ".codex/config.toml": '# user owned\napproval_policy = "on-request"\n',
    ".gemini/settings.json": '{"security":{"folderTrust":{"enabled":true}},"mcpServers":{}}\n',
    ".mcp.json": '{"mcpServers":{}}\n',
    "opencode.jsonc": '{ /* native */ "permission": { "edit": "ask" } }\n',
    "unrelated.txt": "Keep this exact text.\n",
    ".claude/commands/local-command.md": "Unrelated native command.\n",
  };
  for (const [path, text] of Object.entries(native)) await put(root, path, text);
  await synchronize(root);
  await synchronize(root, { check: true });
  for (const [path, text] of Object.entries(native))
    assert.equal(await read(root, path), text, path);
});

test("missing optional native files are skipped, absent provider output directories are created", async (t) => {
  const root = await fixture(t);
  const result = await synchronize(root);
  assert.ok(result.skipped.every((entry) => entry.reason.includes("absent")));
  assert.ok((await lstat(resolve(root, ".claude/skills"))).isDirectory());
  assert.ok((await lstat(resolve(root, ".gemini/commands"))).isDirectory());
});

for (const target of ["/nonexistent/apixa-broken-link", "external"]) {
  test(`symlinked generated parent is refused safely (${target})`, async (t) => {
    const root = await fixture(t);
    await mkdir(resolve(root, ".claude"));
    await symlink(target, resolve(root, ".claude/skills"));
    const before = await lstat(resolve(root, ".claude/skills"));
    await assert.rejects(synchronize(root), /symlink refused/);
    assert.equal((await lstat(resolve(root, ".claude/skills"))).mtimeMs, before.mtimeMs);
    await assert.rejects(read(root, "AGENTS.md"), /ENOENT/); // No partial writes.
  });
}

test("canonical symlinks and output leaf symlinks are refused without following targets", async (t) => {
  const root = await fixture(t);
  await rm(resolve(root, ".agents/skills/git-push/SKILL.md"));
  await symlink("/nonexistent/skill", resolve(root, ".agents/skills/git-push/SKILL.md"));
  await assert.rejects(synchronize(root), /symlink refused/);
  await rm(resolve(root, ".agents/skills/git-push/SKILL.md"));
  await cp(
    resolve(repo, ".agents/skills/git-push/SKILL.md"),
    resolve(root, ".agents/skills/git-push/SKILL.md"),
  );
  await symlink("/nonexistent/agents", resolve(root, "AGENTS.md"));
  await assert.rejects(synchronize(root), /symlink refused/);
});

test("conditional rules retain original activation and always rules stay always even with globs", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  const agents = await read(root, "AGENTS.md");
  for (const [path, text] of Object.entries(legacy).filter(([path]) =>
    path.startsWith(".cursor/rules/"),
  )) {
    const original = frontmatter(text);
    const generated = frontmatter(await read(root, path));
    assert.deepEqual(generated.metadata, original.metadata);
    if (original.metadata.alwaysApply)
      assert.ok(
        tokens(agents).includes(
          tokens(await prettier.format(migrated(original.body), { parser: "markdown" })),
        ),
      );
    else {
      assert.ok(!agents.includes(original.body));
      assert.ok(agents.includes(original.metadata.globs.split(",")[0]));
      assert.ok(
        tokens(generated.body).includes(
          tokens(await prettier.format(migrated(original.body), { parser: "markdown" })),
        ),
      );
    }
  }
  assert.equal(
    frontmatter(await read(root, ".cursor/rules/apixa-examples.mdc")).metadata.alwaysApply,
    true,
  );
});

test("manual generated edits and conflicting native definitions fail before writes", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  await put(root, ".cursor/commands/git-push.md", "Manual changes must survive.\n");
  await assert.rejects(synchronize(root), /unowned\/manual changes/);
  assert.equal(await read(root, ".cursor/commands/git-push.md"), "Manual changes must survive.\n");
  await rm(resolve(root, ".cursor/commands/git-push.md"));
  await synchronize(root);
  await put(root, ".claude/commands/git-push.md", "Shadow workflow.\n");
  const before = await snapshot(root);
  await assert.rejects(synchronize(root), /conflicting provider definition/);
  assert.deepEqual(await snapshot(root), before);
});

test("legacy outputs are adopted only if their audited original hashes match", async (t) => {
  const root = await fixture(t);
  for (const [path, text] of Object.entries(legacy))
    if (
      path === "AGENTS.md" ||
      path === "CLAUDE.md" ||
      path.startsWith(".cursor/commands/") ||
      path.startsWith(".cursor/rules/")
    )
      await put(root, path, text);
  await synchronize(root);
  await synchronize(root, { check: true });
});

test("removed skills retire only their owned generated files, preserving unrelated neighbors", async (t) => {
  const root = await fixture(t);
  await synchronize(root);
  await put(root, ".claude/skills/local/SKILL.md", "Local workflow not managed here.\n");
  await rm(resolve(root, ".agents/skills/git-push"), { recursive: true });
  await assert.rejects(synchronize(root, { check: true }), /stale/);
  await synchronize(root);
  await assert.rejects(read(root, ".claude/skills/git-push/SKILL.md"), /ENOENT/);
  assert.equal(
    await read(root, ".claude/skills/local/SKILL.md"),
    "Local workflow not managed here.\n",
  );
});

test("invalid metadata, duplicate fields, wrong names and malformed native JSON fail clearly", async (t) => {
  const root = await fixture(t);
  const path = ".agents/skills/git-push/SKILL.md";
  const original = await read(root, path);
  for (const [text, error] of [
    ["No frontmatter", /frontmatter/],
    [original.replace("name: git-push", "name: other"), /name must match/],
    [original.replace("name: git-push", "name: git-push\nname: git-push"), /duplicate/],
    [original.replace(/description:.*\n/, ""), /description/],
    [original.replace(/description:.*\n/, "description: [invalid]\n"), /unsupported YAML/],
  ]) {
    await put(root, path, text);
    await assert.rejects(synchronize(root), error);
  }
  await put(root, path, original);
  await put(root, ".claude/settings.json", "{");
  await assert.rejects(synchronize(root), /JSON/);
  await assert.rejects(read(root, "AGENTS.md"), /ENOENT/);
});

test("path traversal, duplicate adapters and conflicting adapter outputs are rejected", async (t) => {
  const root = await fixture(t);
  const config = JSON.parse(await read(root, ".ai/config.json"));
  await put(root, ".ai/config.json", JSON.stringify({ ...config, skills: "../outside" }));
  await assert.rejects(synchronize(root), /Unsafe/);
  await put(root, ".ai/config.json", JSON.stringify({ ...config, adapters: ["cursor", "cursor"] }));
  await assert.rejects(synchronize(root), /Duplicate adapter/);
  await put(
    root,
    ".ai/adapters/conflict.mjs",
    'export { capabilities } from "./cursor.mjs"; export function render({emit}) { emit("AGENTS.md", "Conflict"); }',
  );
  await put(root, ".ai/config.json", JSON.stringify({ ...config, adapters: ["conflict"] }));
  await assert.rejects(synchronize(root), /conflicting generated/);
});

test("a new provider adapter uses canonical sources without changing the sync implementation", async (t) => {
  const root = await fixture(t);
  const config = JSON.parse(await read(root, ".ai/config.json"));
  await put(
    root,
    ".ai/adapters/future.mjs",
    `
export const capabilities = { discovery: [".future"], skills: "copies", commands: "unsupported", rules: "AGENTS.md", roles: "unsupported", settings: "preserved", hooks: "unsupported", mcp: "unsupported", limitations: ["test provider"] };
export function render({skills, emit}) { for (const skill of skills) for (const file of skill.files) emit(".future/skills/"+skill.name+"/"+file.path, file.content, file.mode); }
`,
  );
  await put(
    root,
    ".ai/config.json",
    JSON.stringify({ ...config, adapters: [...config.adapters, "future"] }),
  );
  await synchronize(root);
  assert.equal(
    await read(root, ".future/skills/git-push/SKILL.md"),
    await read(root, ".agents/skills/git-push/SKILL.md"),
  );
});

test("adapters cannot overwrite native settings or canonical sources", async (t) => {
  const root = await fixture(t);
  const config = JSON.parse(await read(root, ".ai/config.json"));
  await put(
    root,
    ".ai/adapters/unsafe.mjs",
    `export {capabilities} from "./cursor.mjs"; export function render({emit}) {emit(".claude/settings.json", "{}");}`,
  );
  await put(root, ".ai/config.json", JSON.stringify({ ...config, adapters: ["unsafe"] }));
  await assert.rejects(synchronize(root), /adapter cannot write/);
  await assert.rejects(read(root, "AGENTS.md"), /ENOENT/);
});

test("Agent Skills optional metadata and compatibility fields propagate without provider-specific fields", async (t) => {
  const root = await fixture(t);
  const path = ".agents/skills/metadata-example/SKILL.md";
  await put(
    root,
    path,
    '---\nname: metadata-example\ndescription: 12 fixture checks when requested\ncompatibility: "Node >=22"\nlicense: MIT\nmetadata:\n  author: apixa\n  version: "1.0"\n---\nInspect requested fixtures and report evidence.\n',
  );
  await synchronize(root);
  const definition = frontmatter(await read(root, ".claude/skills/metadata-example/SKILL.md"));
  assert.equal(definition.metadata.metadata.author, "apixa");
  assert.equal(definition.metadata.metadata.version, "1.0");
  assert.equal(definition.metadata.compatibility, "Node >=22");
  await put(root, path, (await read(root, path)).replace('version: "1.0"', "version: 1.0"));
  await assert.rejects(synchronize(root), /unsupported YAML scalar/);
});
