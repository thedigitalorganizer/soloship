---
name: review
description: Multi-perspective review for plans or code. For plans: routes to gstack's eng, CEO, or design plan review skills individually, or gs-autoplan to run all four (CEO + design + eng + DX) in one auto-decided pass. For code: routes to ce-review for PR-scale work (CE multi-agent parallel analysis with worktrees), or runs three inline passes (structural, adversarial, design slop lens) for quick local checks.
---

Invoke the `review` skill from the Soloship plugin. Use the Skill tool with skill name `review` and let it drive the workflow.

If the Skill tool cannot find `review` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/review/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
