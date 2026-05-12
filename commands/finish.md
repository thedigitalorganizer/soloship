---
name: finish
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

Invoke the `finish` skill from the Soloship plugin. Use the Skill tool with skill name `finish` and let it drive the workflow.

If the Skill tool cannot find `finish` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/finish/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/finish/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
