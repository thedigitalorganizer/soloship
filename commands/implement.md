---
name: implement
description: Execute an implementation plan. Finds the most recent plan in docs/plans/, sets up a working branch, then runs the Compound-Engineering-derived execution methodology with branching, clarification gates, and quality checks. Freshness check warns on stale plans.
---

Invoke the `implement` skill from the Soloship plugin. Use the Skill tool with skill name `implement` and let it drive the workflow.

If the Skill tool cannot find `implement` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/implement/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/implement/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
