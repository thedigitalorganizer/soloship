---
name: autoplan
description: Auto-review pipeline — reads the full CEO, design, eng, and DX review skills from disk and runs them sequentially with auto-decisions using 6 decision principles. Surfaces taste decisions (close approaches, borderline scope, codex disagreements) at a final approval gate. One command, fully reviewed plan out. Use when asked to "auto review", "autoplan", "run all reviews", "review this plan automatically", or "make the decisions for me". Proactively suggest when the user has a plan 
---

Invoke the `autoplan` skill from the Soloship plugin. Use the Skill tool with skill name `autoplan` and let it drive the workflow.

If the Skill tool cannot find `autoplan` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/autoplan/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/autoplan/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
