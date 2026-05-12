---
name: soloship-design-review
description: Soloship — Visual design audit combining gstack design-review checklist with Impeccable AI Slop Detection. Finds spacing issues, hierarchy problems, and generic AI-generated design fingerprints, then fixes them.
---

Invoke the `design-review` skill from the Soloship plugin. Use the Skill tool with skill name `design-review` and let it drive the workflow.

If the Skill tool cannot find `design-review` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/design-review/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/design-review/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
