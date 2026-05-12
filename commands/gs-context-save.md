---
name: gs-context-save
description: Save working context. Captures git state, decisions made, and remaining work so any future session can pick up without losing a beat. Use when asked to "save progress", "save state", "context save", or "save my work". Pair with /gs-context-restore to resume later. Formerly /checkpoint — renamed because Claude Code treats /checkpoint as a native rewind alias in current environments, which was shadowing this skill.
---

Invoke the `gs-context-save` skill from the Soloship plugin. Use the Skill tool with skill name `gs-context-save` and let it drive the workflow.

If the Skill tool cannot find `gs-context-save` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/gs-context-save/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/gs-context-save/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
