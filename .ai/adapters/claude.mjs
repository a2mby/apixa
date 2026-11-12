import { generated, header, roleBody } from "./common.mjs";
export const capabilities = {
  discovery: ["CLAUDE.md", ".claude/skills", ".claude/agents"],
  skills: "generated real copies with supporting resources",
  commands: "native /skill-name via skills; no duplicate commands",
  rules: "CLAUDE.md imports AGENTS.md; conditional explicit references",
  roles: "native Markdown subagents",
  settings: "preserved",
  hooks: "native; preserved",
  mcp: "native; preserved",
  limitations: [
    "Role boundaries are instructions, not a new sandbox; inherited tools and permissions remain in force",
  ],
};
export function render({ skills, roles, emit }) {
  emit("CLAUDE.md", generated("AGENTS.md") + "\n@AGENTS.md\n");
  for (const skill of skills)
    for (const file of skill.files)
      emit(`.claude/skills/${skill.name}/${file.path}`, file.content, file.mode);
  for (const role of roles)
    emit(
      `.claude/agents/${role.name}.md`,
      header(role.metadata) + generated(role.path) + roleBody(role),
    );
}
