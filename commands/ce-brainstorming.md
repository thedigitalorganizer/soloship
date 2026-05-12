---
name: ce-brainstorming
description: Soloship — This skill should be used before implementing features, building components, or making changes. It guides exploring user intent, approaches, and design decisions before planning. Triggers on "let's brainstorm", "help me think through", "what should we build", "explore approaches", ambiguous feature requests, or when the user's request has multiple valid interpretations that need clarification.
---

Invoke the `ce-brainstorming` skill from the Soloship plugin. Use the Skill tool with skill name `ce-brainstorming` and let it drive the workflow.

If the Skill tool cannot find `ce-brainstorming` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/ce-brainstorming/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/ce-brainstorming/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
