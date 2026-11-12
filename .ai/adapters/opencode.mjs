import { header, generated, command, roleBody } from "./common.mjs";
export const capabilities = {
  discovery: ["AGENTS.md", ".agents/skills", ".opencode/commands", ".opencode/agents"],
  skills: "native .agents/skills compatibility",
  commands: "generated Markdown wrappers; /skill-name",
  rules: "native AGENTS.md; conditional explicit references",
  roles: "native Markdown subagents",
  settings: "preserved",
  hooks: "partial: plugin lifecycle, no portable Claude/Codex hook translation",
  mcp: "native; preserved",
  limitations: [
    "Targets documented OpenCode V2 paths; V1 legacy directories are not generated",
    "Role boundaries do not replace native permissions",
  ],
};
export function render({ skills, roles, emit }) {
  for (const skill of skills)
    emit(
      `.opencode/commands/${skill.name}.md`,
      header({ description: skill.metadata.description }) + command(skill, "$ARGUMENTS"),
    );
  for (const role of roles)
    emit(
      `.opencode/agents/${role.name}.md`,
      header({ description: role.metadata.description, mode: "subagent" }) +
        generated(role.path) +
        roleBody(role),
    );
}
