---
name: soloship-learn
description: Soloship — Capture knowledge from non-obvious work. Creates a solution doc via ce-compound, then audits the architecture registry for drift, propagates new pitfalls into AGENTS.md files, and creates missing AGENTS.md for directories that have grown past the governance threshold. Cherry-picks the learnings.jsonl persistence pattern for quick cross-session search.
---

Invoke the `learn` skill from the Soloship plugin. Use the Skill tool with skill name `learn` and let it drive the workflow.

If the Skill tool cannot find `learn` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/learn/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/learn/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
