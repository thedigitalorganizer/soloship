---
name: implement
description: Execute an implementation plan. Routes to ce-work which reads the plan, sets up a working branch, and executes systematically while maintaining quality.
---

Invoke the `implement` skill from the Soloship plugin. Use the Skill tool with skill name `implement` and let it drive the workflow.

If the Skill tool cannot find `implement` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/implement/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/implement/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
