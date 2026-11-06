#!/bin/sh
# Rebuild AGENTS.md from .cursor/rules and copy commands to Codex's user prompts dir.
cd "$(dirname "$0")/.." || exit 1
{
echo "# Apixa agent instructions"
echo
echo "Generated from \`.cursor/rules/*.mdc\` by \`scripts/sync-agent-rules.sh\`. Edit the .mdc files, then re-run. Slash commands live in \`.cursor/commands/\` (symlinked to \`.claude/commands\`); the skill is in \`.cursor/skills/\`."
for f in .cursor/rules/*.mdc; do
  echo; echo "---"; echo
  echo "<!-- source: $f -->"
  awk 'BEGIN{c=0} /^---$/ && c<2 {c++; next} c>=2' "$f"
done
} > AGENTS.md
mkdir -p "$HOME/.codex/prompts"
for f in .cursor/commands/*.md; do cp "$f" "$HOME/.codex/prompts/apixa-$(basename "$f")"; done
