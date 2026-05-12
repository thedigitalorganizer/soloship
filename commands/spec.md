---
name: spec
description: Lightweight formal specification with acceptance criteria. For features that need explicit success conditions, data models, or API contracts before planning.
---

Invoke the `spec` skill from the Soloship plugin. Use the Skill tool with skill name `spec` and let it drive the workflow.

If the Skill tool cannot find `spec` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/spec/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/spec/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
