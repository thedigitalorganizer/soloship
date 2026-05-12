---
name: gs-design-review
description: Soloship — Designer's eye QA: finds visual inconsistency, spacing issues, hierarchy problems, AI slop patterns, and slow interactions — then fixes them. Iteratively fixes issues in source code, committing each fix atomically and re-verifying with before/after screenshots. For plan-mode design review (before implementation), use /gs-plan-design-review. Use when asked to "audit the design", "visual QA", "check if it looks good", or "design polish". Proactively suggest when the user mentions vi
---

Invoke the `gs-design-review` skill from the Soloship plugin. Use the Skill tool with skill name `gs-design-review` and let it drive the workflow.

If the Skill tool cannot find `gs-design-review` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/gs-design-review/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/gs-design-review/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
