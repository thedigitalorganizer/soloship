---
name: cleanup
description: Knowledge system maintenance: deduplicate solutions, prune stale references, enforce plan lifecycle, fix AGENTS.md drift, rebuild learnings index. The garbage collector, linker, and index rebuilder for a project's knowledge base. Use periodically or when docs/solutions/ has grown since the last cleanup.
---

Invoke the `cleanup` skill from the Soloship plugin. Use the Skill tool with skill name `cleanup` and let it drive the workflow.

If the Skill tool cannot find `cleanup` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/cleanup/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/cleanup/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
