---
name: bootstrap
description: Configure project governance from audit findings or interactive questions. Creates/updates CLAUDE.md, AGENTS.md files, rules, and hooks tailored to the actual project. Use after /audit on existing projects, or standalone on new projects.
---

Invoke the `bootstrap` skill from the Soloship plugin. Use the Skill tool with skill name `bootstrap` and let it drive the workflow.

If the Skill tool cannot find `bootstrap` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/bootstrap/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/bootstrap/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
