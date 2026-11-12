#!/usr/bin/env node
import { createHash } from "node:crypto";
import { format, resolveConfig } from "prettier";
import { readdir, readFile, lstat, mkdir, writeFile, chmod, unlink } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const sorted = (values) => [...values].sort();
async function stat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// A deliberately small YAML subset: scalars, block strings and the spec's metadata map.
// Unsupported YAML is rejected instead of interpreted differently by providers.
function scalar(raw, path, key) {
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw);
      if (typeof value === "string") return value;
    } catch {}
    fail(`${path}: invalid quoted scalar ${key}`);
  }
  if (raw.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(raw)) fail(`${path}: invalid quoted scalar ${key}`);
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw === "true" || raw === "false") return raw === "true";
  if (
    !raw ||
    /^[\[\]{}&*!|>@`]/.test(raw) ||
    /:\s|\s#/.test(raw) ||
    /^(?:null|Null|NULL|~|True|TRUE|False|FALSE|[+-]?(?:\d[\d_.]*|\.\d+)(?:[eE][+-]?\d+)?)$/.test(
      raw,
    )
  )
    fail(`${path}: unsupported YAML scalar ${key}; quote strings with JSON double quotes`);
  return raw;
}
export function frontmatter(source, path = "definition") {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) fail(`${path}: expected YAML frontmatter delimited by ---`);
  const metadata = Object.create(null);
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() || lines[i].trimStart().startsWith("#")) continue;
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!field)
      fail(`${path}: unsupported YAML at line ${i + 2}; use scalar fields or a metadata map`);
    const [, key, raw] = field;
    if (Object.hasOwn(metadata, key)) fail(`${path}: duplicate metadata field ${key}`);
    let value;
    if (key === "metadata" && !raw) {
      value = Object.create(null);
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1])) {
        const line = lines[++i];
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        const entry = /^  ([\w.-]+):\s*(.*)$/.exec(line);
        if (!entry) fail(`${path}: metadata must be a two-space-indented string map`);
        if (Object.hasOwn(value, entry[1])) fail(`${path}: duplicate metadata key ${entry[1]}`);
        value[entry[1]] = scalar(entry[2], path, `metadata.${entry[1]}`);
        if (typeof value[entry[1]] !== "string") fail(`${path}: metadata values must be strings`);
      }
    } else if (/^[>|][-+]?$/.test(raw)) {
      const parts = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1]))
        parts.push(lines[++i].trim());
      value = parts.join(raw.startsWith(">") ? " " : "\n").trim();
    } else value = scalar(raw, path, key);
    metadata[key] = value;
  }
  if (!match[2].trim()) fail(`${path}: instructions must not be empty`);
  if (typeof metadata.description !== "string" || !metadata.description.trim())
    fail(`${path}: description is required`);
  return { metadata, body: match[2].trim() + "\n", source };
}

export async function synchronize(root, { check = false, log = () => {} } = {}) {
  root = resolve(root);
  async function safe(path) {
    if (
      typeof path !== "string" ||
      !path ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      resolve(root, path) === root ||
      relative(root, resolve(root, path)).startsWith(`..${sep}`) ||
      path.startsWith("/")
    )
      fail(`Unsafe repository path: ${path}`);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const current = parts.slice(0, i).join("/");
      const info = await stat(resolve(root, current));
      if (info?.isSymbolicLink())
        fail(
          `${current}: symlink refused (including broken links); replace only after reviewing its target`,
        );
      if (info && i < parts.length && !info.isDirectory()) fail(`${current}: expected directory`);
    }
    return resolve(root, path);
  }
  async function read(path) {
    return readFile(await safe(path), "utf8");
  }
  async function walk(path) {
    const absolute = await safe(path);
    const info = await stat(absolute);
    if (!info?.isDirectory()) fail(`${path}: expected real directory`);
    const result = [];
    for (const name of sorted(await readdir(absolute))) {
      const file = `${path}/${name}`;
      const entry = await stat(await safe(file));
      if (entry.isDirectory()) result.push(...(await walk(file)));
      else if (entry.isFile()) result.push(file);
      else fail(`${file}: expected regular file`);
    }
    return result;
  }
  const config = JSON.parse(await read(".ai/config.json"));
  if (config.version !== 1) fail(".ai/config.json: unsupported version");
  for (const key of ["skills", "rules", "roles"]) await safe(config[key]);
  if (new Set(config.adapters).size !== config.adapters.length) fail("Duplicate adapter names");
  const skills = [];
  const skillFiles = await walk(config.skills);
  const skillNames = sorted(await readdir(resolve(root, config.skills)));
  for (const name of skillNames) {
    const path = `${config.skills}/${name}/SKILL.md`;
    const definition = frontmatter(await read(path), path);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
      name.length > 64 ||
      definition.metadata.name !== name
    )
      fail(`${path}: name must match directory and Agent Skills naming rules`);
    if (definition.metadata.description.length > 1024)
      fail(`${path}: description exceeds 1024 characters`);
    const allowed = [
      "name",
      "description",
      "license",
      "compatibility",
      "allowed-tools",
      "metadata",
    ];
    for (const key of Object.keys(definition.metadata))
      if (
        !allowed.includes(key) ||
        (key !== "metadata" && typeof definition.metadata[key] !== "string")
      )
        fail(
          `${path}: unsupported skill field ${key}; supported flat scalar fields: ${allowed.join(", ")}`,
        );
    if (
      definition.metadata.compatibility !== undefined &&
      (!definition.metadata.compatibility.trim() || definition.metadata.compatibility.length > 500)
    )
      fail(`${path}: compatibility must contain 1–500 characters`);
    if (
      definition.metadata.metadata !== undefined &&
      (typeof definition.metadata.metadata !== "object" || definition.metadata.metadata === null)
    )
      fail(`${path}: metadata must be a string map`);
    const files = [];
    for (const file of skillFiles.filter((file) => file.startsWith(`${config.skills}/${name}/`))) {
      files.push({
        path: file.slice(`${config.skills}/${name}/`.length),
        content: await readFile(await safe(file)),
        mode: (await stat(resolve(root, file))).mode & 0o777,
      });
    }
    skills.push({ ...definition, name, path, files });
  }
  const rules = [];
  for (const path of await walk(config.rules)) {
    if (!path.endsWith(".md")) fail(`${path}: rules must be Markdown`);
    const rule = frontmatter(await read(path), path);
    for (const key of Object.keys(rule.metadata))
      if (!["description", "globs", "alwaysApply"].includes(key))
        fail(`${path}: unknown rule field ${key}`);
    if (typeof rule.metadata.alwaysApply !== "boolean")
      fail(`${path}: alwaysApply must be boolean`);
    if (rule.metadata.globs !== undefined && typeof rule.metadata.globs !== "string")
      fail(`${path}: globs must be a comma-separated string`);
    if (!rule.metadata.alwaysApply && !rule.metadata.globs?.trim())
      fail(`${path}: conditional rules require globs`);
    rules.push({ ...rule, path, name: path.split("/").at(-1).slice(0, -3) });
  }
  const roles = [];
  for (const path of await walk(config.roles)) {
    const role = frontmatter(await read(path), path);
    const name = path.split("/").at(-1).replace(/\.md$/, "");
    if (!path.endsWith(".md") || role.metadata.name !== name || !/^[a-z][a-z-]*$/.test(name))
      fail(`${path}: invalid role name`);
    roles.push({ ...role, name, path });
  }
  const outputs = new Map();
  function emit(path, content, mode = 0o644) {
    if (outputs.has(path)) fail(`${path}: conflicting generated definitions`);
    if (
      path === ".ai/generated.json" ||
      path.startsWith(".ai/") ||
      path.startsWith(`${config.skills}/`) ||
      config.nativeFiles.some((native) => path === native || path.startsWith(`${native}/`))
    )
      fail(`${path}: adapter cannot write canonical sources, manifest or native settings`);
    outputs.set(path, { content: Buffer.from(content), mode });
  }
  const unconditional = rules.filter((rule) => rule.metadata.alwaysApply);
  const conditional = rules.filter((rule) => !rule.metadata.alwaysApply);
  let agents =
    "# Apixa agent instructions\n\nGenerated by `pnpm ai:sync` from `.ai/rules/`. Edit canonical sources; see `.ai/README.md`.\n\n";
  agents += unconditional
    .map((rule) => `<!-- source: ${rule.path} -->\n\n${rule.body}`)
    .join("\n---\n\n");
  agents +=
    "\n## Conditional engineering rules\n\nBefore reading, editing, or reviewing files matching a pattern below, read the linked rule and apply it to those files. Patterns are repository-relative; `**/*` includes files directly in the directory and nested files. These rules are conditional, not repository-wide.\n\n| File patterns | Rule |\n| --- | --- |\n";
  agents += conditional
    .map(
      (rule) =>
        `| ${rule.metadata.globs
          .split(",")
          .map((glob) => `\`${glob.trim()}\``)
          .join(", ")} | [${rule.name}](${rule.path}) |\n`,
    )
    .join("");
  agents +=
    "\n## Workflows and roles\n\nReusable workflows live in `.agents/skills/<name>/SKILL.md`. Use your provider's supported skill invocation; slash names in migrated workflows refer to the same named skill on every provider. Only an explicit request to run a shipping workflow authorizes its commits, pushes or merges. Reading a workflow during configuration work is not invocation.\n\nFor a requested role, read `.ai/agents/<role>.md` (architect, implementer, reviewer, tester). Follow `AGENTS.md` and applicable conditional rules in every role. A role defines task boundaries, not additional runtime permissions.\n";
  emit("AGENTS.md", agents);
  for (const name of config.adapters) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`Invalid adapter name: ${name}`);
    const adapterPath = `.ai/adapters/${name}.mjs`;
    await safe(adapterPath);
    const adapter = await import(pathToFileURL(resolve(root, adapterPath)).href);
    for (const key of [
      "discovery",
      "skills",
      "commands",
      "rules",
      "roles",
      "settings",
      "hooks",
      "mcp",
      "limitations",
    ])
      if (!Object.hasOwn(adapter.capabilities ?? {}, key))
        fail(`${adapterPath}: missing capability ${key}`);
    await adapter.render({ skills, rules, roles, emit });
  }
  // Reuse the project's existing formatter so repository format never makes adapters stale.
  for (const [path, output] of outputs) {
    if (path.endsWith(".md") || path.endsWith(".mdc")) {
      // Use the repository's Prettier config so generated files match `pnpm format` output.
      const options = (await resolveConfig(await safe(path))) ?? {};
      output.content = Buffer.from(
        await format(output.content.toString("utf8"), { ...options, parser: "markdown" }),
      );
    }
  }
  // Validate native JSON when present, but never rewrite it or require it on other machines.
  const skipped = [];
  for (const path of config.nativeFiles) {
    const file = await safe(path);
    if (await stat(file)) {
      if (path.endsWith(".json")) JSON.parse(await read(path));
      skipped.push({ status: "skipped", path, reason: "native configuration preserved" });
    } else
      skipped.push({ status: "skipped", path, reason: "optional native configuration absent" });
  }
  // Prevent leftover legacy sources from shadowing generated skills/commands/roles.
  const discoveryRoots = [
    ".cursor/skills",
    ".codex/skills",
    ".gemini/skills",
    ".opencode/skills",
    ".claude/skills",
    ".claude/commands",
    ".cursor/commands",
    ".gemini/commands",
    ".opencode/command",
    ".opencode/commands",
    ".cursor/agents",
    ".claude/agents",
    ".codex/agents",
    ".opencode/agents",
    ".opencode/agent",
  ];
  const names = new Set([...skills, ...roles].map((item) => item.name));
  for (const directory of discoveryRoots) {
    if (!(await stat(await safe(directory)))) continue;
    for (const file of await walk(directory)) {
      const rest = file.slice(directory.length + 1);
      const name = rest.split("/")[0].replace(/\.(md|toml)$/, "");
      if (names.has(name) && !outputs.has(file))
        fail(
          `${file}: conflicting provider definition for ${name}; move shared instructions to canonical sources`,
        );
    }
  }
  const manifestPath = ".ai/generated.json";
  const manifestInfo = await stat(await safe(manifestPath));
  const previous = manifestInfo ? JSON.parse(await read(manifestPath)) : { version: 1, files: {} };
  if (previous.version !== 1 || typeof previous.files !== "object" || !previous.files)
    fail(`${manifestPath}: invalid manifest`);
  const actions = [];
  const manifest = { version: 1, files: {} };
  for (const path of sorted(outputs.keys())) {
    const target = await safe(path);
    const info = await stat(target);
    if (info && !info.isFile()) fail(`${path}: refusing to replace a non-file`);
    const next = outputs.get(path);
    const current = info ? await readFile(target) : null;
    const hash = current && digest(current);
    if (
      current &&
      !current.equals(next.content) &&
      previous.files[path]?.sha256 !== hash &&
      config.adopt?.[path] !== hash
    )
      fail(
        `${path}: generated file has unowned/manual changes; preserve them and reconcile with the canonical source before syncing`,
      );
    const status = !current
      ? "created"
      : current.equals(next.content) && (info.mode & 0o777) === next.mode
        ? "unchanged"
        : "updated";
    actions.push({ status, path });
    manifest.files[path] = { sha256: digest(next.content), mode: next.mode };
  }
  for (const path of sorted(Object.keys(previous.files))) {
    if (outputs.has(path)) continue;
    const target = await safe(path);
    const info = await stat(target);
    if (info && (!info.isFile() || digest(await readFile(target)) !== previous.files[path].sha256))
      fail(`${path}: obsolete generated file has manual changes; refusing removal`);
    if (info) actions.push({ status: "removed", path });
  }
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const oldManifest = manifestInfo ? await read(manifestPath) : null;
  if (oldManifest !== manifestText)
    actions.push({ status: oldManifest === null ? "created" : "updated", path: manifestPath });
  else actions.push({ status: "unchanged", path: manifestPath });
  const changes = actions.filter((action) => action.status !== "unchanged");
  // Everything above is read-only: preflight the entire plan before any mutation.
  if (!check) {
    for (const { path, status } of changes) {
      const target = await safe(path);
      if (status === "removed") await unlink(target);
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, path === manifestPath ? manifestText : outputs.get(path).content);
        if (path !== manifestPath) await chmod(target, outputs.get(path).mode);
      }
    }
  }
  for (const action of [...actions, ...skipped])
    log(`${action.status}: ${action.path}${action.reason ? ` (${action.reason})` : ""}`);
  log(
    `${check ? "check" : "sync"}: ${changes.length} change(s), ${actions.length - changes.length} unchanged, ${skipped.length} skipped`,
  );
  if (check && changes.length)
    fail(`AI configuration is stale (${changes.length} change(s)); run pnpm ai:sync`);
  return { actions, skipped, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) {
    console.error("Usage: node .ai/scripts/sync.mjs [--check]");
    process.exitCode = 1;
  } else {
    try {
      await synchronize(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), {
        check: args.includes("--check"),
        log: console.log,
      });
    } catch (error) {
      console.error(`ai: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
