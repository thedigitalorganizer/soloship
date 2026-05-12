---
name: gs-context-restore
description: Restore working context saved earlier by /gs-context-save. Loads the most recent saved state (across all branches by default) so you can pick up where you left off — even across Conductor workspace handoffs. Use when asked to "resume", "restore context", "where was I", or "pick up where I left off". Pair with /gs-context-save. Formerly /checkpoint resume — renamed because Claude Code treats /checkpoint as a native rewind alias in current environments.
---

Invoke the `gs-context-restore` skill from the Soloship plugin. Use the Skill tool with skill name `gs-context-restore` and let it drive the workflow.

If the Skill tool cannot find `gs-context-restore` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/gs-context-restore/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/gs-context-restore/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
