#!/bin/sh
# Rebuild AGENTS.md from .cursor/rules (keeping any trailing "## graphify" section) and copy
# commands to Codex's user prompts dir.
cd "$(dirname "$0")/.." || exit 1
tail_file=$(mktemp)
if [ -f AGENTS.md ]; then
  awk '/^## graphify/{p=1} p' AGENTS.md > "$tail_file"
fi
{
echo "# Apixa agent instructions"
echo
echo "Generated from \`.cursor/rules/*.mdc\` by \`scripts/sync-agent-rules.sh\`. Edit the .mdc files, then re-run. Slash commands live in \`.cursor/commands/\` (symlinked to \`.claude/commands\`); the skill is in \`.cursor/skills/\`."
for f in .cursor/rules/*.mdc; do
  echo; echo "---"; echo
  echo "<!-- source: $f -->"
  awk 'BEGIN{c=0} /^---$/ && c<2 {c++; next} c>=2' "$f"
done
if [ -s "$tail_file" ]; then echo; cat "$tail_file"; fi
} > AGENTS.md.new && mv AGENTS.md.new AGENTS.md
rm -f "$tail_file"
npx prettier --write AGENTS.md >/dev/null 2>&1
mkdir -p "$HOME/.codex/prompts"
for f in .cursor/commands/*.md; do cp "$f" "$HOME/.codex/prompts/apixa-$(basename "$f")"; done
