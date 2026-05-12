---
name: soloship-audit
description: Soloship — Deep codebase investigation that produces an architecture map, quality assessment, and actionable recommendations. Two-phase: understand the system, then assess it. Use when onboarding to a codebase, before /bootstrap, or periodically to check for drift. Produces docs/audit/AUDIT-YYYY-MM-DD.md + audit-findings.json.
---

Invoke the `audit` skill from the Soloship plugin. Use the Skill tool with skill name `audit` and let it drive the workflow.

If the Skill tool cannot find `audit` by that exact name, read `${CLAUDE_PLUGIN_ROOT}/skills/audit/SKILL.md` directly (or fall back to `~/.claude/plugins/marketplaces/soloship/skills/audit/SKILL.md`) and execute its instructions as a complete workflow.

The skill file is the source of truth. Do not paraphrase or improvise — open it and follow it.
