---
name: sp-subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session - dispatches fresh subagent for each task with code review between tasks, enabling fast iteration with quality gates
---

Invoke the `sp-subagent-driven-development` skill from the Soloship plugin. Use the Skill tool with skill name `sp-subagent-driven-development` and let it drive the workflow.

If the Skill tool cannot find `sp-subagent-driven-development` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/sp-subagent-driven-development/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/sp-subagent-driven-development/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
