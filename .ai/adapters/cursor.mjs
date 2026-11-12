import { generated, header, command } from "./common.mjs";
export const capabilities = {
  discovery: ["AGENTS.md", ".agents/skills", ".cursor/rules", ".cursor/commands", ".claude/agents"],
  skills: "native .agents/skills",
  commands: "generated Markdown wrappers",
  rules: "native MDC activation metadata; always-on bodies in AGENTS.md",
  roles: "native Claude-compatible .claude/agents (avoid duplicate Cursor definitions)",
  settings: "preserved",
  hooks: "native; preserved",
  mcp: "native; preserved",
  limitations: ["CLI and editor feature availability varies; restart after adding skills"],
};
export function render({ rules, skills, emit }) {
  for (const rule of rules) {
    // Always-on bodies are already loaded through AGENTS.md; keep original metadata without injecting them twice.
    const body = rule.metadata.alwaysApply
      ? `Shared instructions for this rule are supplied by repository AGENTS.md. Canonical source: \`${rule.path}\`.\n`
      : rule.body;
    emit(`.cursor/rules/${rule.name}.mdc`, header(rule.metadata) + generated(rule.path) + body);
  }
  for (const skill of skills)
    emit(
      `.cursor/commands/${skill.name}.md`,
      header({ description: skill.metadata.description }) + command(skill),
    );
}
