---
name: code-review
description: Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees
---

Invoke the `code-review` skill from the Soloship plugin. Use the Skill tool with skill name `code-review` and let it drive the workflow.

If the Skill tool cannot find `code-review` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/code-review/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/code-review/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
