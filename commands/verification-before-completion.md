---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

Invoke the `verification-before-completion` skill from the Soloship plugin. Use the Skill tool with skill name `verification-before-completion` and let it drive the workflow.

If the Skill tool cannot find `verification-before-completion` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/verification-before-completion/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/verification-before-completion/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
