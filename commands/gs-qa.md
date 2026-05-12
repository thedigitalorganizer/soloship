---
name: gs-qa
description: Soloship — Systematically QA test a web application and fix bugs found. Runs QA testing, then iteratively fixes bugs in source code, committing each fix atomically and re-verifying. Use when asked to "qa", "QA", "test this site", "find bugs", "test and fix", or "fix what's broken". Proactively suggest when the user says a feature is ready for testing or asks "does this work?". Three tiers: Quick (critical/high only), Standard (+ medium), Exhaustive (+ cosmetic). Produces before/after health sc
---

Invoke the `gs-qa` skill from the Soloship plugin. Use the Skill tool with skill name `gs-qa` and let it drive the workflow.

If the Skill tool cannot find `gs-qa` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/gs-qa/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/gs-qa/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
