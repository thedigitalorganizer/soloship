---
name: soloship-onboard
description: Soloship — Codebase orientation for new contributors or fresh AI sessions. Reads CLAUDE.md, AGENTS.md files, recent git history, and audit reports to produce a quick briefing.
---

Invoke the `onboard` skill from the Soloship plugin. Use the Skill tool with skill name `onboard` and let it drive the workflow.

If the Skill tool cannot find `onboard` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/onboard/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/onboard/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
