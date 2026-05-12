---
name: shipfast
description: Emergency deploy pipeline. Something's broken in prod, you fixed it, get it live NOW. Lint, test, build, commit, push, deploy. Minimum viable safety checks, maximum speed.
---

Invoke the `shipfast` skill from the Soloship plugin. Use the Skill tool with skill name `shipfast` and let it drive the workflow.

If the Skill tool cannot find `shipfast` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/shipfast/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/shipfast/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
